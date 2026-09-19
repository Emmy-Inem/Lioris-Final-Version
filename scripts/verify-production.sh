#!/usr/bin/env bash
# Read-only probes of the LIVE Lioris deployment. Prints PASS/FAIL per check and exits
# non-zero if anything failed. It only performs GET/HEAD/anonymous requests (plus POSTs
# that are expected to be REJECTED); it never writes data and needs no credentials:
# the project URL and the publishable anon key are public (they ship in the web bundle).
#
#   scripts/verify-production.sh
#   SITE_URL=https://lioris.app scripts/verify-production.sh      # probe another site URL
#
# Sections: 1 anon table reads  2 anon RPC permissions  3 edge function status codes
#           4 site security headers  5 live bundle leak scan
#
# Requires: bash, curl, grep.

set -uo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://fdtnbluslkabwsmspbem.supabase.co}"
ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF}"
SITE_URL="${SITE_URL:-https://lioris-final-version.vercel.app}"

PASS=0
FAIL=0
TMP="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/verify-prod.$$")"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  PASS  %s\n' "$*"; PASS=$((PASS+1)); }
fail() { printf '  FAIL  %s\n' "$*"; FAIL=$((FAIL+1)); }
in_list() { local n="$1"; shift; local x; for x in "$@"; do [ "$x" = "$n" ] && return 0; done; return 1; }

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }

# api METHOD PATH [json-body]  -> sets CODE and BODY (body truncated to 300 chars, never printed unless needed)
api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -o "$TMP/body" -w '%{http_code}' --max-time 25 -X "$method"
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  CODE="$(curl "${args[@]}" "${SUPABASE_URL}${path}" 2>/dev/null || echo 000)"
  BODY="$(head -c 300 "$TMP/body" 2>/dev/null || true)"
}

# ------------------------------------------------------------------ 1. anonymous table reads
echo "== 1. Anonymous table reads: expect 0 rows or permission denied =="
for table in profiles notifications chat_messages chat_channels verifications audit_logs \
             moderation_queue push_tokens client_errors user_consents rate_limits; do
  api GET "/rest/v1/${table}?select=*&limit=1"
  if [ "$CODE" = "200" ]; then
    if [ "$BODY" = "[]" ]; then pass "$table: 200 with 0 rows"; else fail "$table: anon can read rows (HTTP 200, non-empty)"; fi
  elif in_list "$CODE" 401 403; then
    pass "$table: denied ($CODE)"
  elif [ "$CODE" = "404" ]; then
    pass "$table: not exposed (404)"   # table absent or not in the API schema - not readable either way
  else
    fail "$table: unexpected HTTP $CODE"
  fi
done

# ------------------------------------------------------------------ 2. anonymous RPC permissions
echo
echo "== 2. Anonymous RPC calls: expect denied (401/403/404) =="
rpc_denied() { # name json-args
  api POST "/rest/v1/rpc/$1" "$2"
  if in_list "$CODE" 401 403 404; then pass "rpc/$1: denied for anon ($CODE)"; else fail "rpc/$1: anon got HTTP $CODE"; fi
}
rpc_denied consume_rate_limit '{"p_key":"verify","p_limit":1,"p_window_seconds":1}'
rpc_denied purge_user_data '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
rpc_denied list_expired_verification_documents '{"p_days":30}'
rpc_denied latest_consent '{"p_type":"terms_and_privacy"}'
rpc_denied record_consent '{"p_version":"probe","p_age_confirmed":true}'

# ------------------------------------------------------------------ 3. edge functions
echo
echo "== 3. Edge functions (anon key, empty body) =="
fn_expect() { # name "codes..."  (space separated list of accepted codes)
  local fn="$1" expected="$2"
  api POST "/functions/v1/${fn}" '{}'
  # shellcheck disable=SC2086
  if in_list "$CODE" $expected; then pass "$fn -> $CODE"; else fail "$fn -> $CODE (expected $expected)"; fi
}
for fn in gemini-proxy admin-delete-user admin-impersonate-user delete-my-account turn-credentials; do
  fn_expect "$fn" "401"
done
fn_expect purge-expired-verification-documents "401"
fn_expect send-push "401"
fn_expect overpass-proxy "400"
fn_expect report-client-error "400 202 204"

# ------------------------------------------------------------------ 4. security headers
echo
echo "== 4. Security headers of ${SITE_URL} =="
HEADERS="$(curl -sI --max-time 25 "$SITE_URL" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z')"
SSO_WALL=0
if printf '%s
' "$HEADERS" | grep -q '^location: https://vercel.com/sso-api'; then SSO_WALL=1; fi
if [ -z "$HEADERS" ]; then
  fail "could not fetch headers from $SITE_URL"
elif [ "$SSO_WALL" -eq 1 ]; then
  fail "$SITE_URL redirects to Vercel SSO (Deployment Protection is ON): the public cannot open it and headers cannot be verified. Disable protection for Production or probe the public domain: SITE_URL=https://lioris.app $0"
else
  for h in strict-transport-security x-content-type-options x-frame-options referrer-policy \
           content-security-policy permissions-policy cross-origin-opener-policy; do
    if printf '%s\n' "$HEADERS" | grep -q "^${h}:"; then pass "header $h present"; else fail "header $h MISSING"; fi
  done
  if printf '%s\n' "$HEADERS" | grep "^content-security-policy:" | grep -q "frame-ancestors 'none'"; then
    pass "CSP has frame-ancestors 'none'"
  else
    fail "CSP lacks frame-ancestors 'none'"
  fi
  if printf '%s\n' "$HEADERS" | grep "^content-security-policy:" | grep -q "unsafe-eval"; then
    fail "CSP allows unsafe-eval"
  else
    pass "CSP does not allow unsafe-eval"
  fi
fi

# ------------------------------------------------------------------ 5. live bundle leak scan
echo
echo "== 5. Live JS bundle leak scan =="
curl -s --max-time 25 "$SITE_URL/" -o "$TMP/index.html" 2>/dev/null || true
SCRIPTS="$(grep -oE 'src="[^"]+\.js[^"]*"' "$TMP/index.html" 2>/dev/null | sed -E 's/^src="([^"]+)"$/\1/' | head -n 10)"
if [ "$SSO_WALL" -eq 1 ]; then
  fail "skipped: site is behind Vercel SSO (see section 4)"
elif [ -z "$SCRIPTS" ]; then
  fail "no <script src> found in $SITE_URL (could not scan the bundle)"
else
  : > "$TMP/bundle.js"
  for s in $SCRIPTS; do
    case "$s" in
      http*) url="$s" ;;
      /*)    url="${SITE_URL}${s}" ;;
      *)     url="${SITE_URL}/${s}" ;;
    esac
    curl -s --max-time 60 "$url" >> "$TMP/bundle.js" 2>/dev/null || true
  done
  SIZE="$(wc -c < "$TMP/bundle.js" | tr -d ' ')"
  if [ "${SIZE:-0}" -lt 10000 ]; then
    fail "downloaded bundle is suspiciously small (${SIZE} bytes); scan not trustworthy"
  else
    echo "  scanned ${SIZE} bytes"
    for needle in 'generativelanguage.googleapis.com' 'SUPABASE_SERVICE_ROLE_KEY'; do
      if grep -qF -- "$needle" "$TMP/bundle.js"; then fail "bundle contains '$needle'"; else pass "bundle does not contain '$needle'"; fi
    done
    # Google API keys are 'AIza' + 35 chars; the full pattern avoids false hits on base64 blobs.
    if grep -qE 'AIza[0-9A-Za-z_-]{35}' "$TMP/bundle.js"; then fail "bundle contains a Google API key (AIza...)"; else pass "bundle does not contain a Google API key (AIza...)"; fi
  fi
fi

echo
echo "== Result: ${PASS} passed, ${FAIL} failed =="
[ "$FAIL" -eq 0 ]

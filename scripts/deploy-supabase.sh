#!/usr/bin/env bash
# Deploy every Lioris Supabase edge function and report which secrets are still missing.
#
#   scripts/deploy-supabase.sh [--dry-run] [--skip-smoke] [--only fn1,fn2]
#
# --dry-run    Read-only: runs the login / link / secrets checks (they only READ) and PRINTS the
#              deploy commands instead of running them. Nothing is deployed, no smoke requests.
# --skip-smoke Skip the post-deploy smoke checks.
# --only       Comma separated list of functions to deploy (default: every dir in supabase/functions).
#
# Prerequisites: Supabase CLI (`supabase login` done, `supabase link --project-ref fdtnbluslkabwsmspbem`),
# curl. Apply the SQL migrations FIRST (see docs/security/deploy.md).
# This script never contains or prints secret values: `supabase secrets list` output is reduced to NAMES.

set -uo pipefail

PROJECT_REF="fdtnbluslkabwsmspbem"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
# Public (publishable) key - safe to embed, it ships in every client bundle.
ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF}"

# Functions deployed with --no-verify-jwt (mirrors supabase/config.toml).
JWT_OFF=(overpass-proxy purge-expired-verification-documents send-push report-client-error)

REQUIRED_SECRETS=(
  SUPABASE_SERVICE_ROLE_KEY
  GEMINI_API_KEY
  ALLOWED_ORIGINS
  REQUIRE_ADMIN_MFA
  CRON_SECRET
  PUSH_WEBHOOK_SECRET
  TURN_KEY_ID
  TURN_KEY_API_TOKEN
)
OPTIONAL_SECRETS=(EXPO_ACCESS_TOKEN)

DRY_RUN=0
SKIP_SMOKE=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --only) shift; ONLY="${1:-}" ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

say()  { printf '%s\n' "$*"; }
ok()   { printf '  [ OK ] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; }
bad()  { printf '  [FAIL] %s\n' "$*"; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then printf '  [dry-run] %s\n' "$*"; else printf '  $ %s\n' "$*"; "$@"; fi; }

in_list() { local needle="$1"; shift; local x; for x in "$@"; do [ "$x" = "$needle" ] && return 0; done; return 1; }

[ "$DRY_RUN" -eq 1 ] && say "== DRY RUN: nothing will be deployed =="

# ---------------------------------------------------------------- 1. CLI, login, link
say ""
say "== 1. Supabase CLI =="
if ! command -v supabase >/dev/null 2>&1; then
  bad "supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi
ok "CLI $(supabase --version 2>/dev/null | head -n1)"

if supabase projects list >/dev/null 2>&1; then
  ok "logged in"
else
  bad "not logged in. Run: supabase login"
  exit 1
fi

LINKED_REF=""
[ -f supabase/.temp/project-ref ] && LINKED_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
if [ "$LINKED_REF" = "$PROJECT_REF" ]; then
  ok "linked to $PROJECT_REF"
else
  bad "not linked to $PROJECT_REF (linked: ${LINKED_REF:-none}). Run: supabase link --project-ref $PROJECT_REF"
  exit 1
fi

# ---------------------------------------------------------------- 2. secrets (names only)
say ""
say "== 2. Secrets (names only, values are never read) =="
SECRETS_RAW="$(supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null || true)"
PRESENT=()
while IFS= read -r line; do
  # Table rows look like "  NAME   |  DIGEST  |" - keep only the first column.
  name="$(printf '%s' "$line" | awk -F'|' 'NF>1{gsub(/[[:space:]]/,"",$1); print $1}')"
  if [[ "$name" =~ ^[A-Za-z0-9_]+$ ]] && [ "$name" != "NAME" ]; then PRESENT+=("$name"); fi
done <<< "$SECRETS_RAW"

MISSING=0
if [ "${#PRESENT[@]}" -eq 0 ]; then
  warn "could not read the secrets list (empty or CLI output format changed); treat every secret as unverified"
fi
for s in "${REQUIRED_SECRETS[@]}"; do
  if in_list "$s" "${PRESENT[@]:-}"; then ok "$s set"; else bad "$s MISSING   -> supabase secrets set $s=<value>"; MISSING=$((MISSING+1)); fi
done
for s in "${OPTIONAL_SECRETS[@]}"; do
  if in_list "$s" "${PRESENT[@]:-}"; then ok "$s set (optional)"; else warn "$s not set (optional)"; fi
done

# ---------------------------------------------------------------- 3. deploy
say ""
say "== 3. Deploy functions =="
FUNCTIONS=()
for d in supabase/functions/*/; do
  fn="$(basename "$d")"
  [ "$fn" = "_shared" ] && continue
  [ -f "$d/index.ts" ] || continue
  if [ -n "$ONLY" ] && ! in_list "$fn" $(printf '%s' "$ONLY" | tr ',' ' '); then continue; fi
  FUNCTIONS+=("$fn")
done

FAILED=()
for fn in "${FUNCTIONS[@]}"; do
  if in_list "$fn" "${JWT_OFF[@]}"; then
    run supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt || FAILED+=("$fn")
  else
    run supabase functions deploy "$fn" --project-ref "$PROJECT_REF" || FAILED+=("$fn")
  fi
done
if [ "${#FAILED[@]}" -gt 0 ]; then bad "deploy failed for: ${FAILED[*]}"; else ok "${#FUNCTIONS[@]} function(s) processed"; fi

# ---------------------------------------------------------------- 4. smoke checks
say ""
say "== 4. Smoke checks (anon key, no user session) =="
if [ "$DRY_RUN" -eq 1 ] || [ "$SKIP_SMOKE" -eq 1 ]; then
  say "  skipped. Would POST {} to each function and expect:"
  say "    gemini-proxy, admin-delete-user, admin-impersonate-user, delete-my-account, turn-credentials -> 401"
  say "    purge-expired-verification-documents, send-push -> 401 (500 = secret not set yet)"
  say "    overpass-proxy -> 400 (invalid coordinates)   report-client-error -> 400/202/204"
else
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl not found; skipping smoke checks"
  else
    SMOKE_FAIL=0
    smoke() { # name, expected (space separated codes), [extra curl args...]
      local fn="$1" expected="$2"; shift 2
      local code
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
        -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${ANON_KEY}" -H 'Content-Type: application/json' \
        "$@" -d '{}' "${SUPABASE_URL}/functions/v1/${fn}" || true)"
      if in_list "$code" $expected; then ok "$fn -> $code (expected $expected)"; else bad "$fn -> $code (expected $expected)"; SMOKE_FAIL=$((SMOKE_FAIL+1)); fi
    }
    for fn in "${FUNCTIONS[@]}"; do
      case "$fn" in
        gemini-proxy|admin-delete-user|admin-impersonate-user|delete-my-account|turn-credentials) smoke "$fn" "401" ;;
        purge-expired-verification-documents|send-push) smoke "$fn" "401" ;;
        overpass-proxy) smoke "$fn" "400" ;;
        report-client-error) smoke "$fn" "400 202 204" ;;
        *) warn "$fn: no smoke expectation defined" ;;
      esac
    done
    [ "$SMOKE_FAIL" -gt 0 ] && bad "$SMOKE_FAIL smoke check(s) failed"
  fi
fi

# ---------------------------------------------------------------- 5. summary
say ""
say "== Summary =="
[ "$MISSING" -gt 0 ] && bad "$MISSING required secret(s) missing (see above)"
[ "${#FAILED[@]}" -gt 0 ] && bad "deploy failures: ${FAILED[*]}"
say "Next: create the send-push Database Webhook (docs/operations/push-notifications.md) and run scripts/verify-production.sh"
[ "$MISSING" -eq 0 ] && [ "${#FAILED[@]}" -eq 0 ]

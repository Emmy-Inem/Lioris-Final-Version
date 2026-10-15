#!/usr/bin/env bash
# Rebuilds supabase/manual/*.sql (paste-into-the-SQL-editor versions) from the migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/manual
mkdir -p "$out"
cp supabase/diagnostics/audit_live_state.sql "$out/01_diagnostics_before.sql"
{
  echo "-- ============================================================================"
  echo "-- LIORIS - 02 APPLY FIXES (run once, after 01_diagnostics_before.sql)"
  echo "-- = migrations 20261028000000, 20261029000000, 20261030000000 in order."
  echo "-- Each part is its own transaction and is safe to re-run. Run the whole file."
  echo "-- The 2FA requirement stays OFF until you turn it on (see the last section of README.md)."
  echo "-- ============================================================================"
  for f in supabase/migrations/20261028000000_audit_remediation.sql \
           supabase/migrations/20261029000000_admin_scope_completion.sql \
           supabase/migrations/20261030000000_optional_admin_mfa_enforcement.sql; do
    echo; echo "-- ########## $(basename "$f") ##########"; cat "$f"
  done
} > "$out/02_apply_fixes.sql"
cp supabase/diagnostics/audit_live_state.sql "$out/03_verify_after.sql"

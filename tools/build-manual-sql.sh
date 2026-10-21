#!/usr/bin/env bash
# Rebuilds supabase/manual/*.sql (paste-into-the-SQL-editor versions) from the migrations.
set -euo pipefail
exec python3 "$(dirname "$0")/build-manual-sql.py"

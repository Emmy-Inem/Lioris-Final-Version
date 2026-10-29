#!/usr/bin/env bash
# Rebuilds supabase/manual/*.sql (paste-into-the-SQL-editor versions) from the migrations, then the per-migration parts.
set -euo pipefail
here="$(dirname "$0")"
python3 "$here/build-manual-sql.py"
python3 "$here/split-manual-parts.py"

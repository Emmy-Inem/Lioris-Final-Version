#!/usr/bin/env python3
"""Splits supabase/manual/02_apply_all.sql into one self-contained, pasteable file per migration
(supabase/manual/parts/NN_<version>_<name>.sql). Each part = the file's header (session settings + the
_manual_migration_log table) + that migration's section, so it can be pasted on its own. The chain guard inside each
section still refuses to run if an earlier part is missing, so run them in order. Run by tools/build-manual-sql.sh."""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
bundle = (root / 'supabase/manual/02_apply_all.sql').read_text(encoding='utf-8')
out = root / 'supabase/manual/parts'
out.mkdir(exist_ok=True)
for old in out.glob('*.sql'):
    old.unlink()

marker = re.compile(r'^-- ########## (\d{14})_(\S+?)\.sql ##########$', re.M)
matches = list(marker.finditer(bundle))
header = bundle[:matches[0].start()]
# keep only the executable part of the header (drop the "run the WHOLE file" prose)
header = header[header.index('SET lock_timeout'):]
for i, m in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(bundle)
    body = bundle[m.start():end].rstrip() + '\n'
    name = f'{i + 1:02d}_{m.group(1)}_{m.group(2)}.sql'
    banner = (f'-- LIORIS manual SQL, part {i + 1} of {len(matches)}: {m.group(1)}_{m.group(2)}.sql\n'
              '-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below\n'
              '-- stops this part if an earlier one is missing. Safe to run twice.\n')
    (out / name).write_text(banner + header + '\n' + body, encoding='utf-8')
print(f'wrote {len(matches)} parts into {out}')

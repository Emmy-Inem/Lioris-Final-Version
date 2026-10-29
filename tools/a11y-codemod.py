#!/usr/bin/env python3
"""Mirror React Native `accessibilityState={{ ... }}` onto DOM-visible aria-* props.

react-native-web 0.21 does not translate the RN `accessibilityState` prop, so on web the
checked / selected / disabled / expanded / busy states are never exposed to assistive
technology (axe: aria-required-attr, role states lost, ...). React Native >= 0.71 accepts
the `aria-*` equivalents on native too, so we KEEP accessibilityState and add the aria-*
props next to it, with the very same value expressions.

Usage (repo root or anywhere):
    python3 tools/a11y-codemod.py            # patch src/ and app/ in place
    python3 tools/a11y-codemod.py --dry-run  # report what would change, write nothing
    python3 tools/a11y-codemod.py --check    # like --dry-run, exit 1 if anything is pending
    python3 tools/a11y-codemod.py path1 ...  # restrict to files / directories

Properties:
  * Idempotent / re-runnable: an element that already has the aria-* prop is skipped, so a
    second run (e.g. after merging branches that add new accessibilityState usages) only
    touches the new elements.
  * Line endings are preserved byte-for-byte: files are read and written as bytes and every
    inserted line uses the EOL of the line it follows (CRLF stays CRLF, LF stays LF).
  * Role aware, because axe rejects states that the element's ARIA role does not support
    (aria-selected is only valid on tab/option/row/gridcell/treeitem, aria-checked only on
    checkbox/radio/switch/menuitem*checkbox|radio/option/treeitem):
        selected on checkbox|radio|switch|menuitemcheckbox|menuitemradio -> aria-checked
        selected on button                                               -> aria-pressed
        checked  on button                                               -> aria-pressed
    Combinations that have no valid aria equivalent are skipped and reported (MANUAL).
  * Anything that is not a plain object literal (`accessibilityState={state}`, spreads,
    ternaries, computed keys) is not touched and is listed under MANUAL for hand fixing.
Only the Python standard library is used.
"""
from __future__ import annotations

import os
import re
import sys

ATTR = 'accessibilityState'
DIRS = ('src', 'app')
EXTS = ('.tsx', '.jsx', '.ts', '.js')
KEYS = ('checked', 'selected', 'disabled', 'expanded', 'busy')

SELECTED_OK = {'tab', 'option', 'row', 'gridcell', 'treeitem', 'columnheader', 'rowheader'}
CHECKED_OK = {'checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem'}
PRESSED_OK = {'button'}


# --------------------------------------------------------------------------- scanning
def skip_string(s: str, i: int) -> int:
    """s[i] is a quote; return the index just past the literal (template aware)."""
    q = s[i]
    i += 1
    n = len(s)
    while i < n:
        c = s[i]
        if c == '\\':
            i += 2
            continue
        if q == '`' and c == '$' and i + 1 < n and s[i + 1] == '{':
            i = match_bracket(s, i + 1) + 1
            continue
        if c == q:
            return i + 1
        i += 1
    return n


def match_bracket(s: str, i: int) -> int:
    """s[i] is one of ( [ {; return the index of the matching closer (or len(s) - 1)."""
    pairs = {'(': ')', '[': ']', '{': '}'}
    stack = [pairs[s[i]]]
    i += 1
    n = len(s)
    while i < n and stack:
        c = s[i]
        if c in '\'"`':
            i = skip_string(s, i)
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '/':
            j = s.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '*':
            j = s.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in pairs:
            stack.append(pairs[c])
        elif c == stack[-1]:
            stack.pop()
            if not stack:
                return i
        i += 1
    return n - 1


def split_top_level(body: str) -> list[str]:
    parts, depth, start, i, n = [], 0, 0, 0, len(body)
    while i < n:
        c = body[i]
        if c in '\'"`':
            i = skip_string(body, i)
            continue
        if c in '([{':
            i = match_bracket(body, i) + 1
            continue
        if c == ',':
            parts.append(body[start:i])
            start = i + 1
        i += 1
    parts.append(body[start:])
    return [p.strip() for p in parts if p.strip()]


def tag_bounds(s: str, attr_start: int, attr_end: int) -> tuple[int, int]:
    """Opening-tag extent (start index of '<', index of the closing '>') around an attribute."""
    # backwards: skip balanced {...} and quoted attribute strings until a '<' + name.
    i, depth = attr_start - 1, 0
    start = 0
    while i >= 0:
        c = s[i]
        if c == '}':
            depth += 1
        elif c == '{':
            depth -= 1
        elif depth == 0 and c in '"\'':
            j = s.rfind(c, 0, i)
            i = j if j >= 0 else i
        elif depth == 0 and c == '<' and i + 1 < len(s) and (s[i + 1].isalpha() or s[i + 1] in '_'):
            start = i
            break
        i -= 1
    # forwards: first '>' outside braces / strings.
    j, n = attr_end, len(s)
    end = n - 1
    while j < n:
        c = s[j]
        if c in '\'"`':
            j = skip_string(s, j)
            continue
        if c in '([{':
            j = match_bracket(s, j) + 1
            continue
        if c == '>':
            end = j
            break
        j += 1
    return start, end


def role_of(tag: str) -> tuple[str | None, bool]:
    """(literal role or None, is_dynamic_or_unknown)."""
    m = re.search(r'\b(?:accessibilityRole|role)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{\s*["\']([^"\']*)["\']\s*\})', tag)
    if m:
        return next(g for g in m.groups() if g is not None), False
    if re.search(r'\b(?:accessibilityRole|role)\s*=\s*\{', tag):
        return None, True
    return None, False


def tag_name(tag: str) -> str:
    m = re.match(r'<([A-Za-z_][\w.]*)', tag)
    return m.group(1) if m else '?'


# --------------------------------------------------------------------------- mapping
def map_props(items: list[tuple[str, str]], role: str | None, dynamic: bool):
    """-> (list of (aria-name, expr), list of notes)."""
    out, notes = [], []
    for key, expr in items:
        if key in ('disabled', 'expanded', 'busy'):
            out.append((f'aria-{key}', expr))
            continue
        if role is None:
            # unknown (dynamic / missing) role: direct mapping, but ask for a review.
            out.append((f'aria-{key}', expr))
            notes.append(f'REVIEW role {"dynamic" if dynamic else "missing"}: aria-{key} added as-is')
            continue
        if key == 'selected':
            if role in SELECTED_OK:
                out.append(('aria-selected', expr))
            elif role in CHECKED_OK:
                out.append(('aria-checked', expr))
            elif role in PRESSED_OK:
                out.append(('aria-pressed', expr))
            else:
                notes.append(f'MANUAL selected has no valid aria equivalent on role="{role}"')
        elif key == 'checked':
            if role in CHECKED_OK:
                out.append(('aria-checked', expr))
            elif role in PRESSED_OK:
                out.append(('aria-pressed', expr))
            elif role in SELECTED_OK:
                out.append(('aria-selected', expr))
            else:
                notes.append(f'MANUAL checked has no valid aria equivalent on role="{role}"')
    return out, notes


# --------------------------------------------------------------------------- per file
def process(path: str, apply: bool, report: list[str]) -> int:
    with open(path, 'rb') as fh:
        raw = fh.read()
    s = raw.decode('utf-8', errors='surrogateescape')
    if ATTR not in s:
        return 0
    edits: list[tuple[int, str]] = []
    pos = 0
    rel = os.path.relpath(path)
    while True:
        m = re.compile(r'\b' + ATTR + r'\s*=').search(s, pos)
        if not m:
            break
        pos = m.end()
        line_no = s.count('\n', 0, m.start()) + 1
        loc = f'{rel}:{line_no}'
        j = m.end()
        while j < len(s) and s[j] in ' \t\r\n':
            j += 1
        if not s.startswith('{', j):
            report.append(f'MANUAL {loc} accessibilityState is not a JSX expression')
            continue
        close = match_bracket(s, j)
        inner = s[j + 1:close].strip()
        attr_start, attr_end = m.start(), close + 1
        if not (inner.startswith('{') and match_bracket(inner, 0) == len(inner) - 1):
            report.append(f'MANUAL {loc} non-literal accessibilityState={{{inner[:60]}}} (spread / variable / conditional)')
            continue
        body = inner[1:-1]
        items: list[tuple[str, str]] = []
        bad = False
        for part in split_top_level(body):
            if part.startswith('...'):
                report.append(f'MANUAL {loc} spread in accessibilityState ({part[:50]})')
                bad = True
                continue
            km = re.match(r'^[\'"]?(\w+)[\'"]?\s*:\s*(.+)$', part, re.S)
            if km:
                key, expr = km.group(1), re.sub(r'\s+', ' ', km.group(2).strip())
            elif re.match(r'^\w+$', part):
                key, expr = part, part
            else:
                report.append(f'MANUAL {loc} cannot parse property "{part[:50]}"')
                bad = True
                continue
            if key in KEYS:
                items.append((key, expr))
        if not items:
            continue
        ts, te = tag_bounds(s, attr_start, attr_end)
        tag = s[ts:te + 1]
        role, dynamic = role_of(tag)
        props, notes = map_props(items, role, dynamic)
        if role == 'link' and 'aria-current' in tag:
            notes = []  # a link that already exposes aria-current needs nothing else
        for n in notes:
            report.append(f'{n.split(" ", 1)[0]} {loc} <{tag_name(tag)}> {n.split(" ", 1)[1]}')
        props = [(k, e) for k, e in props if not re.search(r'(?<![\w-])' + re.escape(k) + r'\s*=', tag)]
        if not props:
            continue
        name = tag_name(tag)
        if name[0].islower() is False and name not in (
            'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
            'View', 'Text', 'TextInput', 'ScrollView', 'Switch', 'Image', 'AnimatedPressable',
            'Animated.View', 'Animated.Text', 'Animated.Pressable',
        ):
            report.append(f'NOTE {loc} <{name}> custom component: aria-* only helps if it forwards props to a DOM-backed primitive')
        # newline layout when the attribute is on its own line(s) and nothing follows it on that line.
        ls = s.rfind('\n', 0, attr_start) + 1
        le = s.find('\n', attr_end)
        le = len(s) if le < 0 else le
        before = s[ls:attr_start]
        after = s[attr_end:le].rstrip('\r')
        eol = '\r\n' if s[le - 1:le] == '\r' else '\n'
        if before.strip() == '' and after.strip() == '':
            ins = ''.join(f'{eol}{before}{k}={{{e}}}' for k, e in props)
            at = attr_end
            edits.append((at, ins))
        else:
            ins = ''.join(f' {k}={{{e}}}' for k, e in props)
            nxt = s[attr_end:attr_end + 1]
            if nxt and nxt not in ' \t\r\n/>':
                ins += ' '
            edits.append((attr_end, ins))
        report.append(f'EDIT {loc} <{name}> +' + ', '.join(k for k, _ in props))
    if not edits:
        return 0
    if apply:
        for at, ins in sorted(edits, key=lambda e: -e[0]):
            s = s[:at] + ins + s[at:]
        with open(path, 'wb') as fh:
            fh.write(s.encode('utf-8', errors='surrogateescape'))
    return len(edits)


def collect(paths: list[str]) -> list[str]:
    files: list[str] = []
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist')]
            files += [os.path.join(root, n) for n in names if n.endswith(EXTS)]
    return sorted(files)


def main(argv: list[str]) -> int:
    flags = {a for a in argv if a.startswith('-')}
    args = [a for a in argv if not a.startswith('-')]
    check = '--check' in flags
    apply = not (check or '--dry-run' in flags)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    paths = args or [os.path.join(root, d) for d in DIRS]
    report: list[str] = []
    total = 0
    for f in collect(paths):
        total += process(f, apply, report)
    for line in report:
        if not line.startswith('EDIT') or flags & {'-v', '--verbose'}:
            print(line)
    edits = sum(1 for r in report if r.startswith('EDIT'))
    manual = sum(1 for r in report if r.startswith(('MANUAL', 'REVIEW')))
    verb = 'would add' if not apply else 'added'
    print(f'a11y-codemod: {verb} aria props on {edits} element(s); {manual} item(s) need manual review')
    if check and edits:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

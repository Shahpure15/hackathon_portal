#!/usr/bin/env python3
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEMVER = re.compile(r'^[0-9]+[.][0-9]+[.][0-9]+$')


def parse(v):
    return tuple(int(x) for x in v.split('.'))


def sub_once(path, pattern, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    out, n = re.subn(pattern, lambda m: m.group(1) + new + m.group(2), text, count=1)
    if n != 1:
        sys.exit('bump_version: pattern not found in ' + path)
    return p, out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if len(args) != 1 or not SEMVER.match(args[0]):
        sys.exit('usage: bump_version.py X.Y.Z [--dry-run]')
    new = args[0]
    current = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if parse(new) <= parse(current):
        sys.exit('new version must be greater than ' + current)

    writes = [(ROOT / 'VERSION', new + chr(10))]
    writes.append(sub_once('frontend/src/version.js', r'(APP_VERSION[ ]*=[ ]*")[^"]+(")', new))
    writes.append(sub_once('frontend/package.json', r'("version":[ ]*")[^"]+(")', new))
    writes.append(sub_once('backend/app/config.py', r'(BACKEND_VERSION:[ ]*str[ ]*=[ ]*")[^"]+(")', new))

    lock_path = ROOT / 'frontend/package-lock.json'
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    lock['version'] = new
    lock['packages']['']['version'] = new
    writes.append((lock_path, json.dumps(lock, indent=2, ensure_ascii=False) + chr(10)))

    cl_path = ROOT / 'CHANGELOG.md'
    lines = cl_path.read_text(encoding='utf-8').splitlines()
    if '## [Unreleased]' not in lines:
        sys.exit('CHANGELOG.md has no [Unreleased] heading')
    idx = lines.index('## [Unreleased]')
    end = idx + 1
    while end < len(lines) and not lines[end].startswith('## ['):
        end += 1
    if not [l for l in lines[idx + 1:end] if l.strip()]:
        sys.exit('Unreleased section is empty; nothing to release')
    header = '## [' + new + '] - ' + datetime.date.today().isoformat()
    out = lines[:idx + 1] + [''] + [header] + lines[idx + 1:end] + lines[end:]
    writes.append((cl_path, chr(10).join(out) + chr(10)))

    for path, content in writes:
        print(('would write ' if dry else 'writing ') + str(path.relative_to(ROOT)))
        if not dry:
            path.write_text(content, encoding='utf-8')
    print('Now run by hand: python3 scripts/check_versions.py')
    print('Then: git add -A && git commit -m "release: v' + new + '"')
    print('After merge to stable-prod: git tag -a v' + new + ' -m "v' + new + '"')


if __name__ == '__main__':
    main()

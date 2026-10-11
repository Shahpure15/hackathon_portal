#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def first(pattern, text, label):
    m = re.search(pattern, text)
    if not m:
        sys.exit('check_versions: cannot find ' + label)
    return m.group(1)


def collect():
    pkg = json.loads(read('frontend/package.json'))
    lock = json.loads(read('frontend/package-lock.json'))
    return {
        'VERSION': read('VERSION').strip(),
        'frontend/package.json': pkg['version'],
        'frontend/package-lock.json': lock['version'],
        'frontend/package-lock.json (root package)': lock['packages']['']['version'],
        'frontend/src/version.js': first(r'APP_VERSION[ ]*=[ ]*"([^"]+)"', read('frontend/src/version.js'), 'APP_VERSION'),
        'backend/app/config.py': first(r'BACKEND_VERSION:[ ]*str[ ]*=[ ]*"([^"]+)"', read('backend/app/config.py'), 'BACKEND_VERSION'),
    }


def main():
    found = collect()
    expected = found['VERSION']
    failed = False
    for name, value in found.items():
        ok = value == expected
        failed = failed or not ok
        print(('OK   ' if ok else 'FAIL ') + name + ' = ' + value)
    if '## [' + expected + ']' not in read('CHANGELOG.md'):
        print('FAIL CHANGELOG.md has no heading for ' + expected)
        failed = True
    if failed:
        sys.exit(1)
    print('Version check passed: ' + expected)


if __name__ == '__main__':
    main()

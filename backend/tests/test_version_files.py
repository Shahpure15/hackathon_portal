import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def test_check_versions_script():
    path = ROOT / 'scripts' / 'check_versions.py'
    res = subprocess.run([sys.executable, str(path)], cwd=str(ROOT), capture_output=True, text=True)
    assert res.returncode == 0, f"check_versions.py failed with:\n{res.stdout}\n{res.stderr}"


def test_health_version(client):
    res = client.get('/health')
    assert res.status_code == 200
    expected = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    assert res.json()['version'] == expected

import hashlib
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values


def test_environment_initializer_never_overwrites_existing_settings(
    tmp_path: Path,
) -> None:
    source = Path(__file__).resolve().parents[1] / "scripts" / "init-local-env.py"
    script = tmp_path / "scripts" / source.name
    script.parent.mkdir()
    script.write_bytes(source.read_bytes())
    subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
    target = tmp_path / ".env.local"
    values = dotenv_values(target)
    for name in ("SECRET_KEY", "FIRST_SUPERUSER_PASSWORD", "POSTGRES_PASSWORD"):
        assert len(values[name] or "") >= 40
    original = hashlib.sha256(target.read_bytes()).digest()
    subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
    assert hashlib.sha256(target.read_bytes()).digest() == original

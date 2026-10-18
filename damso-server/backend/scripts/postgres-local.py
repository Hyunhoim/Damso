"""Run project-local PostgreSQL on Windows without installing a system service."""

import argparse
import hashlib
import os
import socket
import subprocess
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

import psycopg
from dotenv import dotenv_values
from psycopg import sql

BACKEND = Path(__file__).resolve().parents[1]
PROJECT = BACKEND.parents[1]
ROOT = (Path.home() / "AppData" / "Local" / "Temp") / (
    "damso-pg-" + hashlib.sha256(str(PROJECT).encode()).hexdigest()[:12]
)
RUNTIME = ROOT / "tmp" / "postgresql"
DATA = ROOT / "damso-server" / "backend" / "data" / "postgres"
BIN = RUNTIME / "pgsql" / "bin"
URL = "https://sbp.enterprisedb.com/getfile.jsp?fileid=1260609"


def command(*args: str) -> subprocess.CompletedProcess[str]:
    if args[-1] == "start":
        return subprocess.run(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=45,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def main() -> None:
    action = argparse.ArgumentParser()
    action.add_argument("action", choices=["start", "stop", "status"])
    args = action.parse_args()
    if os.name != "nt":
        raise SystemExit("Use compose.backend.yml on non-Windows systems.")
    if ROOT.exists():
        if ROOT.resolve() != PROJECT.resolve():
            raise SystemExit("Existing PostgreSQL path alias has a different target.")
    else:
        # PostgreSQL initdb on Windows cannot reliably handle Korean data paths.
        environment = {
            **os.environ,
            "DAMSO_PG_ALIAS": str(ROOT),
            "DAMSO_PG_PROJECT": str(PROJECT),
        }
        subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-Command",
                "New-Item -ItemType Junction -Path $env:DAMSO_PG_ALIAS -Target $env:DAMSO_PG_PROJECT | Out-Null",
            ],
            env=environment,
            check=True,
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    if args.action != "start":
        if not (BIN / "pg_ctl.exe").exists() or not (DATA / "PG_VERSION").exists():
            raise SystemExit("Project-local PostgreSQL is not initialized.")
        result = command(str(BIN / "pg_ctl.exe"), "-D", str(DATA), args.action)
        print(result.stdout, end="")
        raise SystemExit(result.returncode)
    values = dotenv_values(BACKEND / ".env.local")
    uri = urlsplit(values.get("DATABASE_URL") or "")
    if (uri.hostname, uri.port, uri.username, uri.path) != (
        "127.0.0.1",
        5433,
        "postgres",
        "/app",
    ):
        raise SystemExit(
            "Local helper requires postgres@127.0.0.1:5433/app; external databases are not modified."
        )
    password = unquote(uri.password or "")
    if not password:
        raise SystemExit("Configure a local database password first.")
    if not (BIN / "pg_ctl.exe").exists():
        RUNTIME.mkdir(parents=True, exist_ok=True)
        archive = RUNTIME / "postgresql-18.6.zip"
        if not archive.exists():
            print(
                "Downloading official EDB PostgreSQL 18.6 Windows binaries...",
                flush=True,
            )
            urllib.request.urlretrieve(URL, archive)
        with zipfile.ZipFile(archive) as bundle:
            for item in bundle.infolist():
                if not item.filename.startswith(
                    ("pgsql/bin/", "pgsql/lib/", "pgsql/share/")
                ):
                    continue
                target = (RUNTIME / item.filename).resolve()
                if not target.is_relative_to(RUNTIME.resolve()):
                    raise SystemExit("Unsafe archive path rejected.")
                bundle.extract(item, RUNTIME)
    DATA.parent.mkdir(parents=True, exist_ok=True)
    if not (DATA / "PG_VERSION").exists():
        pwfile = DATA.parent / ".init-password"
        with pwfile.open("x", encoding="utf-8") as handle:
            handle.write(password)
        try:
            result = command(
                str(BIN / "initdb.exe"),
                "-D",
                str(DATA),
                "-U",
                "postgres",
                "--pwfile",
                str(pwfile),
                "--auth=scram-sha-256",
                "--encoding=UTF8",
                "--locale=C",
            )
            if result.returncode:
                raise SystemExit(
                    "initdb failed; existing data was not deleted. "
                    + (result.stderr or "")
                )
        finally:
            pwfile.unlink(missing_ok=True)
    if command(str(BIN / "pg_ctl.exe"), "-D", str(DATA), "status").returncode:
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", 5433)) == 0:
                raise SystemExit(
                    "Port 5433 is occupied; existing process was not stopped."
                )
        result = command(
            str(BIN / "pg_ctl.exe"),
            "-D",
            str(DATA),
            "-l",
            str(DATA.parent / "postgres.log"),
            "-o",
            "-h 127.0.0.1 -p 5433",
            "-w",
            "start",
        )
        if result.returncode:
            raise SystemExit("PostgreSQL start failed. Check data/postgres.log.")
    with psycopg.connect(
        host="127.0.0.1",
        port=5433,
        user="postgres",
        password=password,
        dbname="postgres",
        autocommit=True,
    ) as connection:
        for name in ("app", "damso_test"):
            if (
                connection.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s", (name,)
                ).fetchone()
                is None
            ):
                connection.execute(
                    sql.SQL("CREATE DATABASE {} ENCODING 'UTF8'").format(
                        sql.Identifier(name)
                    )
                )
    print("PostgreSQL ready on 127.0.0.1:5433; app and damso_test databases available.")


if __name__ == "__main__":
    main()

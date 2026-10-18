# Upstream provenance

- Repository: https://github.com/fastapi/full-stack-fastapi-template
- Commit: `b1125d8839482cb7bbae603ddc6d0081bf87532e`
- Source: https://github.com/fastapi/full-stack-fastapi-template/tree/b1125d8839482cb7bbae603ddc6d0081bf87532e/backend
- License: MIT; the upstream copyright notice is retained in `LICENSE`.
- Retrieved: 2026-10-18.

Imported the complete upstream `backend/` directory plus the root license. No frontend code, Bun workspace, root environment file, or upstream Git metadata was imported.

Local adaptations:

1. `app/main.py`: removed built React frontend mounting, keeping API routing and authentication.
2. `app/core/config.py`: load the backend's own `.env.local` with a file-relative path; default web origin is `http://localhost:8081`.
3. `Dockerfile`: backend-only Python build, standalone uv lock, one API worker.
4. `../compose.backend.yml`: local PostgreSQL, migration/initial-data job, API; localhost-only published ports.
5. Added local environment initializer, standalone checks, README, and ignore rules. The original README is retained as `UPSTREAM_README.md`.

The standalone `uv.lock` is generated locally from the imported `pyproject.toml`; it is not the upstream monorepo lock.

Damso additions (2026-10-19): parent/child profiles, rotating sessions, 1:1 family pairing, role-specific daily and custom questions, private audio storage, answer drafts/submission, family story access, comments/reactions/notifications, and disabled STT/LLM processing interfaces. These are local additions, not features supplied by upstream. Demo Item/private routes are not exposed. See `RUNBOOK.md` and `API_CONTRACT.md`. The existing mobile app has not yet been connected.

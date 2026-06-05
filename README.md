# Object Removal

Quality-first image object removal based on `fastapi/full-stack-fastapi-template`, cleaned down to the pieces needed for this project.

## Current Stack

- Backend: FastAPI, SQLModel, PostgreSQL, JWT auth, Alembic.
- Frontend: React, Vite, TanStack Router, Tailwind CSS, shadcn-style components.
- Local orchestration: one Docker Compose file for the local full stack.
- AI tooling: project-scoped MCP configs for opencode, Codex, and Antigravity.

## Cleanup Decisions

- Removed template sample CRUD `items` module.
- Removed local-only `private` route and related tests.
- Removed template docs/assets/CI/copier metadata.
- Kept auth, users, admin UI, Docker Compose, database, and generated client structure.

## Local Environment

Optional: create a local env file from the example if you want to override defaults:

```bash
cp .env.example .env
```

Start the full stack:

```bash
docker compose up --build
```

Useful local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- OpenAPI: `http://localhost:8000/docs`

Default local superuser from `.env.example`:

- Email: `admin@example.com`
- Password: `changethis`

Change these before any non-local deployment.

## Backend Dev

```bash
uv sync --project backend
uv run --project backend fastapi dev app/main.py
```

## Frontend Dev

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

## Model Source Repos

Clone external model repos into ignored `external/`:

```bash
bash scripts/clone-model-repos.sh
```

The script prepares:

- `facebookresearch/sam2` on `sam2.1`
- `advimman/lama`
- `TencentARC/BrushNet`
- `open-mmlab/PowerPaint`

Weights are intentionally not downloaded or committed. Put local checkpoints under ignored `models/`.

## MCP

MCP configs are included for:

- opencode: `.opencode/opencode.json`
- Codex: `.codex/config.toml`
- Antigravity: `mcp/antigravity.mcp.json`

See `docs/MCP_SETUP.md` for details. Restart opencode/Codex after config changes.

## Execution Plan

The production-oriented project plan is in `OBJECT_REMOVAL_EXECUTION_PLAN.md`.

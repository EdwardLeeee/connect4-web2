# Repository Guidelines

## Project Structure & Module Organization

`backend/connect4_app/` contains the FastAPI application. Keep game rules in `domain.py`, anonymous sessions in `sessions.py`, WebSocket room orchestration in `manager.py`, and HTTP/ASGI wiring in `app.py`. Production assets are generated in `frontend/dist/` and must not be edited manually.

## Build, Test, and Development Commands

Create `.venv`, then run `.venv/bin/python -m pip install -e '.[dev]'`; maturin compiles the Rust extension during installation. Start local services with:

```bash
.venv/bin/uvicorn connect4_app.app:app --port 55555 --reload
npm --prefix frontend run dev
```

Use `npm --prefix frontend run build` before serving FastAPI alone. Production must use one Uvicorn worker because rooms and matchmaking are in memory.
Validate production packaging with `podman build --format docker --file Containerfile --tag localhost/connect4-web:test .`.

## Coding Style & Naming Conventions

Python uses four spaces, type hints, Ruff, `snake_case`, and 100-character lines. Keep Python-facing functions small and return `PyResult`. Vue/TypeScript uses two spaces, Prettier, `PascalCase.vue` components, `camelCase` values, and kebab-case CSS classes. Reuse the design tokens in `frontend/src/styles.css`.

## Testing Guidelines

Run Playwright with `npm --prefix frontend run test:e2e` after installing Chromium/WebKit. Preserve the iPhone/Galaxy projects and 0.5% screenshot-diff ceiling. Name tests `test_*.py` or `*.spec.ts`; cover invalid turns and reconnect races as well as happy paths.

## Commit & Pull Request Guidelines

History favors short, focused English or Chinese summaries. Use an imperative subject and avoid bundling unrelated work. `main` is protected: work on a branch in your own worktree (`scripts/dev-worktree.sh <name> [branch]`, branch defaults to `<name>/work`), open a pull request, and merge only when the `backend`, `frontend`, and `container` checks are green. Cut releases with `scripts/release.sh patch|minor`; never edit version numbers by hand. Pull requests should describe protocol or UI changes, link issues, list commands run, and include screenshots for visual changes.

## Security & AI Guarantees

Never trust client-supplied roles, turns, or results. Do not add heuristic or timed AI fallbacks: solver failure must remain explicit. Do not commit secrets, generated builds, browser binaries, or production certificates. Set secure cookies and allowed origins in production.

Exception: in the iOS/Android app, AI games run entirely on the device with connect-four-ai-wasm, the same reply table and the same tie-break. Their moves and results never reach the server, and the server must never accept an AI game result from a client. Every server-hosted game — private rooms, matchmaking and the website's AI games — stays server-authoritative. The on-device engine follows the same no-heuristic, no-timed-fallback rule.

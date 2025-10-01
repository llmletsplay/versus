# Repository Guidelines

## Project Structure & Modules
- `versus-server/`: TypeScript API + game logic. Key dirs: `src/games/`, `src/routes/`, `src/middleware/`, `src/utils/`, tests in `tests/`.
- `versus-client/`: React + Vite UI. Key dirs: `src/components/`, `src/pages/`, `src/services/`.
- Infra and docs: `Makefile`, `docker-compose.simple.yml`, `README.md`, `QUICK_START.md`.

## Build, Test, and Dev
- Local stack: `make start` (DB + server + client). Stop with `make stop`.
- Workspace dev: `npm run dev` (runs server and client via Bun). Server only: `cd versus-server && bun run dev`. Client only: `cd versus-client && bun run dev`.
- Build all: `npm run build`. Server: `npm run build:server`. Client: `npm run build:client`.
- Server tests: `cd versus-server && bun run test` or `bun run test:watch`.

## Coding Style & Naming
- Language: TypeScript, ES modules.
- Formatting (server): Prettier enforced (2 spaces, single quotes, semicolons, width 100). Run `cd versus-server && bun run format` or `format:check`.
- Linting (server): ESLint with TypeScript rules. Run `bun run lint` or `lint:fix`.
- Naming: game files kebab-case (e.g., `src/games/tic-tac-toe.ts`); variables/functions camelCase; React components PascalCase (e.g., `src/components/GameSelector.tsx`).
 - Client style: no linter configured yet—keep 2-space indentation, single quotes, semicolons, and match server conventions. Prefer functional components/hooks, colocate component styles with the component, and avoid default exports for components.

## Testing Guidelines
- Framework: Jest (ts-jest ESM).
- Location: `versus-server/tests/*.test.ts` (e.g., `chess.test.ts`). Shared helpers in `tests/helpers/`.
- Coverage: global 50% thresholds; reports to `coverage/`. Ensure new logic has focused unit tests.
- Test naming: `*.test.ts`; prefer deterministic, pure functions in game rules.

## Commit & Pull Requests
- Commits: follow Conventional Commits. Examples:
  - `feat(server): add go capture logic`
  - `fix(client): sanitize HTML in rules`
- PRs: include clear summary, linked issues (`Closes #123`), screenshots/GIFs for UI, API notes for breaking changes, and checklists showing `lint`, `type-check`, and `test` pass.

## Security & Configuration
- Env: copy `versus-server/env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, Sentry keys, etc. Do not commit secrets.
- Local ports: client `5555`, server `5556`, Postgres `5433`.

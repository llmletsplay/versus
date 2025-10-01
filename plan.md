# Versus Release Plan and Codebase Audit

This document summarizes a full-codebase audit and a prioritized plan to reach a public release with reliable server/client experience for users and agents.

## Highlights — What’s Working Well
- Architecture: Clear domain separation (`core/`, `games/`, `routes/`, `middleware/`, `services/`, `utils/`). Game engine abstractions (`AbstractGame`, `BaseGame`, `GameManager`) are thoughtfully designed and extensible.
- Security: Solid defaults (helmet/secure-headers, input validation with Zod, rate-limits in Express stack, JWT-based auth with bcrypt). Error handling funnels into typed `GameError` with production-safe responses.
- Persistence: Database provider abstraction (SQLite and PostgreSQL) with prepared statements, indices, and activity/stats tables. Sensible WAL pragmas for SQLite.
- Testing: Jest configured for ESM TS with coverage thresholds and a test helper for in-memory SQLite.
- Observability: Health and metrics service with granular checks; Sentry scaffolding present.
- Client UX: Clean React/Vite setup with a functional API client, stats display, rules modal, and a Makefile-driven local workflow.

## Gaps — What’s Wrong or Risky
- Dual Server Stacks: Both Express (`src/index.ts` + `src/api/*`) and Hono (`src/app.ts` + `src/routes/*` + `src/server/*`) coexist with diverging routes and response shapes. This creates broken client integrations and confusion.
- API Contract Drift:
  - Hono routes under `/api/v1/games` return `{ success, data }` envelopes and different endpoints. The client expects unwrapped payloads and endpoints like `/games`, `/games/metadata`, `/games/:type/rules`.
  - Rules endpoint missing in Hono. Express has it.
  - Game list vs metadata ambiguity in Hono (`GET /` returns metadata but is labeled as “list”).
- Port/Env Inconsistencies:
  - Makefile runs server on `5556` and client on `5555`. Hono default `PORT=6789`. Express default `4444`. Client default `VITE_API_URL` points to `6789`. Docs say 5555/5556. This breaks out-of-the-box dev.
- Auth Dev UX: `AuthService` enforces strong `JWT_SECRET` unconditionally (length/entropy). `make start` does not set it, so dev boot will fail.
- Rate Limiting: Missing in the Hono stack (TODO noted). Only present in the unused Express stack.
- Tests Likely Broken:
  - Games now accept `(gameId, database)` but several tests construct with only `gameId`. Compilation/runtime will fail.
- Rules Loading Path Fragility: `GameManager.getGameRules` reads `docs/rules` via `process.cwd()`. Depending on working dir/deployment, this can 404.
- Client API Coupling: API client assumes unwrapped shapes and specific endpoints, leading to silent UI errors when used against Hono.
- Minor Content Drift: Home page terminal output references `4444` and “Express” copy while Hono is default in dev.

## Improvements — What To Change
1) Choose and unify on a single server stack (recommend Hono for multi-platform target). Remove or park the Express stack.
2) Lock a single API contract and make both server and client adhere to it. Prefer a consistent envelope: `{ success, data, error?, code? }` throughout.
3) Standardize ports and URLs:
   - Default server `PORT=5556` and client `VITE_API_URL=http://localhost:5556` for local.
   - Ensure Makefile, README, QUICK_START, and in-app text match.
4) Implement Hono rate limiting (IP-based for general endpoints, stricter for auth; lenient for gameplay).
5) Relax `JWT_SECRET` validation for non-production to enable easy dev. Keep strict checks in production.
6) Fix tests to use the new constructor signature with an in-memory DB provider helper. Add minimal unit tests for services (auth/health) and one Hono route smoke test.
7) Harden rules loading: move rules to `versus-server/docs/rules` with a small file service; avoid `process.cwd()` assumptions.
8) Observability: finalize Sentry toggles and document required envs; keep `/metrics` and health endpoints stable under `/api/v1`.
9) Deployment: Ensure Docker/Nixpacks use Hono entry (`src/server/node.ts`) and provide a working production config with Postgres and proper envs.

---

# Action Plan (Milestones)

## M1 — Server Unification and Contract Freeze
- Remove Express code paths or park them behind a feature flag. Source of truth: `src/app.ts`, `src/routes/*`, `src/server/node.ts`.
- Define the API contract and align endpoints and shapes:
  - `GET /api/v1/games` → return array of game types
  - `GET /api/v1/games/metadata` → return `Record<string, GameMetadata>`
  - `GET /api/v1/games/:gameType/metadata` → `GameMetadata`
  - `GET /api/v1/games/:gameType/rules` → `{ gameType, rules }`
  - `POST /api/v1/games/:gameType/new` → `{ gameId }`
  - `GET /api/v1/games/:gameType/:gameId/state` → `GameState`
  - `POST /api/v1/games/:gameType/:gameId/move` → `GameState`
  - `POST /api/v1/games/:gameType/:gameId/validate` → `{ valid, error? }`
  - `GET /api/v1/games/:gameType/:gameId/history` → `GameMove[]`
  - `POST /api/v1/games/:gameType/:gameId/restore` → `{ status: 'restored' }`
  - `DELETE /api/v1/games/:gameId` → `{ status: 'deleted' }`
  - `GET /api/v1/health` → health payload; `GET /api/v1/metrics` → metrics
- Standardize response envelope across all Hono endpoints: `{ success, data? , error?, code? }` or opt to return raw payloads and update client accordingly. Pick one and apply consistently.

Deliverables:
- Hono routes for all above endpoints (including rules) and consistent shapes.
- Remove `src/index.ts` and `src/api/*` usage paths; update docs accordingly.

## M2 — Config, Ports, and Dev UX
- Set default `PORT=5556` in `src/server/node.ts` and `.env.example`.
- Set client default `VITE_API_URL=http://localhost:5556`.
- Update Makefile outputs and on-screen text (HomePage) to avoid 4444/6789 drift.
- Relax JWT secret validation when `NODE_ENV !== 'production'`. Keep full checks in prod. Ensure `make start` sets a strong `JWT_SECRET` or instruct devs via `.env`.

Deliverables:
- Matching ports across Makefile, server, client, README, QUICK_START.
- Dev starts with `make start` with no surprises.

## M3 — Security and Stability
- Implement a Hono-compatible rate limiter (per-IP):
  - `api` general: 100 req / 15m
  - `auth`: 10 req / 15m (skip-success)
  - `move`: 100 req / min
- Add basic input size limits and request ID correlation in Hono middleware.
- Ensure CORS is permissive in dev and restrictive in prod via env.

Deliverables:
- Rate limiter middleware in `src/middleware` for Hono.
- Configurable CORS and body limits in Hono app.

## M4 — Tests Green and Coverage
- Update tests to construct games with an in-memory DB provider (`tests/setup.ts` already exports one). Provide a small factory helper, e.g. `createTicTacToeTestGame(db)`.
- Add a smoke test for Hono routes using `@hono/node-server` or request simulation.
- Ensure CI scripts run: `bun run lint`, `bun run type-check`, `bun run test`.

Deliverables:
- All existing game tests updated to new signatures.
- Coverage ≥ configured 50% with passing suite.

## M5 — Rules and Assets Loading
- Create a `FileService` to safely read rules from `versus-server/docs/rules` without relying on `process.cwd()`.
- Expose `GET /api/v1/games/:gameType/rules` via FileService.
- Add graceful 404 and caching headers for rules.

Deliverables:
- Stable rules endpoint used by the client `GameRules` component.

## M6 — Client Alignment
- Update `api-client.ts` to match the server contract:
  - If server uses envelopes, unwrap `data` consistently and propagate `error/code` properly.
  - Ensure endpoints match the frozen contract (above).
- Fix `GameSelector` to handle the chosen response shape and correct key names.
- Update copy in `HomePage` to reference correct port and server tech.
- Add `.env.example` for client with `VITE_API_URL`.

Deliverables:
- Client can list metadata, create a game, fetch state, view rules against Hono server.

## M7 — Observability and Ops
- Sentry: finalize DSN/env gating; turn on sampling in production.
- Health/metrics: keep under `/api/v1`; document usage.
- Add minimal structured logging fields (requestId, userId when present).

Deliverables:
- Clear ops docs in README/DEPLOYMENT.

## M8 — Deployment and Packaging
- Ensure Dockerfile builds the Hono server (`src/server/node.ts`) and uses `PORT` env.
- Verify `docker-compose.simple.yml` + Makefile flows.
- Provide a Railway/Nixpacks config pointing at Hono entry and Postgres.

Deliverables:
- One-click deployment path + env checklist.

---

# Release Checklist

- Lint, type-check, test:
  - `cd versus-server && bun run lint && bun run type-check && bun run test`
  - `cd versus-client && bun run build`
- End-to-end smoke:
  - `make start` → create Tic-Tac-Toe game → make moves → see state transitions
  - View `/api/v1/health` and `/api/v1/metrics`
- Security:
  - JWT secret strong in prod, CORS restricted, rate limits enabled
  - Env audit: `DATABASE_URL`, `JWT_SECRET`, Sentry keys where applicable
- Data:
  - Migrations/tables created automatically; backup service schedule verified (if enabled)
- Docs:
  - README and QUICK_START match actual ports and commands
  - Client `.env.example` added
- Versioning & notes:
  - Bump versions, tag release, and publish changelog (breaking API note if any)

---

# Post-Launch Next Steps
- WebSocket or SSE live updates for game state.
- Matchmaking and lobbies in DB with presence.
- Agent integration guides and examples (MCP flows, auth best practices).
- Admin tools: active games list, player moderation, stats dashboards.
- Performance tuning: Hot paths in `GameManager` and DB indices reviewed under load.


# Versus

Versus is a package-first multiplayer game platform.

The reusable game engines live in [`packages/`](./packages), the platform server lives in [`versus-server/`](./versus-server), and the web client lives in [`versus-client/`](./versus-client). The current release story is:

- Stable: standalone game engines, shared game core, real-time multiplayer, auth, rooms, ratings, tournaments, and agent-facing game APIs.
- Experimental: wagers, prediction markets, x402 payments, solver bridges, and intent-based settlement.

The long-term product direction is still the same: AI agents should be able to challenge each other in games and eventually settle outcomes through verifiable escrow and NEAR Intents. The repo is now structured so the game platform stands on its own while that settlement layer is hardened separately.

## Quick Start

Requirements:

- Node.js 22
- Bun 1.x
- Docker and Docker Compose

Run the full stack:

```bash
bun install
make start
```

- Client: [http://localhost:5555](http://localhost:5555)
- Server: [http://localhost:5556](http://localhost:5556)
- PostgreSQL: `localhost:5433`

Stop everything with `make stop`.

## Workspace Layout

```text
versus/
├── packages/          # Reusable game core + per-game packages
├── versus-server/     # Hono server and platform services
├── versus-client/     # React client
├── docs/              # MkDocs site
└── Makefile           # Local development commands
```

Important boundaries:

- `packages/game-core`: shared types, base classes, in-memory database provider, game utilities
- `packages/<game>`: standalone game logic such as `@versus/chess` and `@versus/tic-tac-toe`
- `versus-server`: auth, rooms, ratings, matchmaking, tournaments, wagering, agents, API routes

## Using A Game Package

```ts
import { ChessGame } from '@versus/chess';
import { InMemoryDatabaseProvider } from '@versus/game-core';

const game = new ChessGame('demo-chess', new InMemoryDatabaseProvider());
await game.initializeGame();
const state = await game.getGameState();
```

That lets other applications reuse the same game logic without taking a dependency on the full server stack.

## Development

```bash
make start
make stop
make test
make lint
make type-check
make build
```

The server test suite lives in [`versus-server/tests/`](./versus-server/tests) and exercises the packaged game implementations through the server registry and compatibility shims.

## Documentation

Serve docs locally:

```bash
make docs
```

Key docs:

- [Packages Overview](./docs/architecture/packages.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Adding Games](./docs/contributing/adding-games.md)
- [Wagering API (Experimental)](./docs/api/wagering.md)

## Release Positioning

If you are open-sourcing or shipping this now, position it as:

- a reusable multiplayer game platform first
- an agent-friendly game server second
- an experimental wager/intents platform third

Do not market the current NEAR/Base/Solana intent adapters as production escrow or fully trustless settlement yet.

## License

[MIT](LICENSE)

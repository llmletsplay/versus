# Versus

Versus is a package-first multiplayer game platform.

The reusable game engines live in [`packages/`](./packages), the platform server lives in [`versus-server/`](./versus-server), and the web client lives in [`versus-client/`](./versus-client).

## What Is Stable

- standalone game packages such as `@versus/chess` and `@versus/tic-tac-toe`
- shared package core in `@versus/game-core`
- the server platform layer for auth, rooms, matchmaking, ratings, tournaments, and game APIs

## What Is Still Experimental

- wagers and prediction-market flows
- x402 payment integration
- solver and intent-settlement layers

## Quick Start

Requirements:

- Node.js 22+
- Bun 1.x
- Docker and Docker Compose

Run the full workspace:

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
|-- packages/        reusable game core + per-game packages
|-- versus-server/   platform server and API layer
|-- versus-client/   React client
|-- docs/            MkDocs documentation
`-- Makefile         local development commands
```

## Using A Game Package

```js
import { ChessGame } from '@versus/chess';

const game = new ChessGame('demo-chess');
await game.initializeGame();
const state = await game.getGameState();
```

Each game package ships its own `dist/` build, type declarations, and package-local `README.md`, `RULES.md`, and `LICENSE` files. Consumers can use the default in-memory provider or inject their own storage implementation.

## Development

```bash
make start
make stop
make test
make lint
make type-check
make build
```

Package-only release prep:

```bash
npm run docs:packages
npm run build:packages
npm run check:packages
npm run test:games
```

The server test suite in [`versus-server/tests/`](./versus-server/tests) exercises the package-backed game engines through the server registry and compatibility shims.

## Documentation

- [Packages Overview](./docs/architecture/packages.md)
- [Games Engine](./docs/architecture/games.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Adding Games](./docs/contributing/adding-games.md)
- [Wagering API (Experimental)](./docs/api/wagering.md)

## License

[MIT](LICENSE)

# Versus

Versus is the open-source game-engine monorepo for llmletsplay.

The reusable engines live in [packages/](./packages), the shared runtime contract lives in [@llmletsplay/versus-game-core](./packages/game-core), and this repo also carries a reference server/client for testing and examples.

## Repo Roles

- This repo is for reusable game logic, package docs, tests, examples, and the package release workflow.
- The real product application should live in a separate repo such as `versus-platform`.
- That application repo should consume the published `@llmletsplay/versus-*` packages from npm the same way third-party developers do.

## What Is Stable

- standalone game packages such as `@llmletsplay/versus-chess` and `@llmletsplay/versus-tic-tac-toe`
- shared package core in `@llmletsplay/versus-game-core`
- the package release contract in `npm run release:packages`

## What Is Still Experimental

- wagers and prediction-market flows in the reference platform
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

## Using A Game Package

```js
import { ChessGame } from '@llmletsplay/versus-chess';

const game = new ChessGame('demo-chess');
await game.initializeGame();
const state = await game.getGameState();
```

Each game package ships its own `dist/` build, type declarations, and package-local `README.md`, `RULES.md`, and `LICENSE` files. Consumers can use the default in-memory provider or inject their own storage implementation.

## Maintenance Flow

1. Branch from `dev` for normal work.
2. Open pull requests into `dev`.
3. Let GitHub Actions run on `dev` and `main`.
4. Merge `dev` into `main` when a batch is ready.
5. Publish npm packages from `main` only when package code or package docs changed.

The full lightweight maintenance guide lives in [docs/contributing/maintenance.md](./docs/contributing/maintenance.md).

## Moving The Product App Out

Do not repoint this repo's `origin` to the product application.

Instead, keep this repo pointed at `llmletsplay/versus` and bootstrap the separate platform repo from here:

```bash
git clone git@github.com:llmletsplay/versus-platform.git ../versus-platform
npm run export:platform -- --target ../versus-platform
```

That export rewrites the platform server to use the published npm packages instead of the local `file:../packages/*` dependencies used inside this monorepo.

## Examples

See [examples/README.md](./examples/README.md) for plain-JS package examples covering zero-config setup, shared storage and restore flows, custom word lexicons, and standalone Mahjong initialization.

## Package Release Checks

```bash
npm run docs:packages
npm run build:packages
npm run check:packages
npm run test:games
npm run publish:packages:dry-run
```

## Documentation

- [Packages Overview](./docs/architecture/packages.md)
- [Games Engine](./docs/architecture/games.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Maintenance Flow](./docs/contributing/maintenance.md)
- [Platform Repo Split](./docs/contributing/platform-repo.md)
- [Adding Games](./docs/contributing/adding-games.md)
- [Wagering API (Experimental)](./docs/api/wagering.md)

## License

[MIT](LICENSE)
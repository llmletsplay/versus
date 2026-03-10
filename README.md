# Versus

Versus is a standalone game-engine monorepo for the published
`@llmletsplay/versus-*` npm packages.

This repo owns the reusable rule engines, the shared game core, package
documentation, examples, release tooling, and an internal `package-test-harness/`
workspace that validates the packages through a stable compatibility surface.

## What Lives Here

- 27+ standalone game packages in `packages/*`
- the shared runtime contract in `packages/game-core`
- package-local `README.md`, `RULES.md`, and `LICENSE`
- release checks and npm publish scripts
- examples for downstream app developers
- the internal `package-test-harness/` workspace for package-focused integration tests

## What Does Not Live Here

This repo intentionally does not include host-application concerns such as:

- auth, accounts, or user management
- rooms, matchmaking, and product UI
- wallets, escrow, payments, or settlement rails
- deployment-specific infrastructure or secrets

Those concerns should live in whatever application consumes the packages.

## Install

Install only the games you need:

```bash
npm install @llmletsplay/versus-chess @llmletsplay/versus-game-core
```

```js
import { ChessGame } from '@llmletsplay/versus-chess';

const game = new ChessGame('demo');
await game.initializeGame();
```

## Local Checks

```bash
npm install
npm run build:packages
npm run check:packages
npm run test:games
npm run lint
npm run type-check
```

## Project Structure

```text
versus/
|-- packages/
|-- package-test-harness/
|-- examples/
|-- docs/
`-- scripts/
```

## Read Next

- [Architecture Overview](docs/architecture/overview.md)
- [Packages](docs/architecture/packages.md)
- [Games Engine](docs/architecture/games.md)
- [Contributing Guidelines](docs/contributing/guidelines.md)
- [Maintenance Flow](docs/contributing/maintenance.md)

## License

[MIT](LICENSE)
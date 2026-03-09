# Game Packages

`packages/` is the reusable engine layer of Versus.

## Package Boundary

Reusable packages live here:

- `@llmletsplay/versus-game-core`
- `@llmletsplay/versus-<game>`

Platform-only concerns stay in [`versus-server/`](../versus-server):

- auth
- rooms
- matchmaking
- ratings
- tournaments
- websocket orchestration
- wagering and settlement

## Consumer Experience

Each game package is shaped like a normal npm library:

- `main`, `types`, and `exports` point at `dist/`
- constructors work out of the box with the default in-memory provider
- host applications can inject a storage provider when they want persistence
- every game package ships `README.md`, `RULES.md`, and `LICENSE`

Example:

```js
import { TicTacToeGame } from '@llmletsplay/versus-tic-tac-toe';

const game = new TicTacToeGame('demo');
await game.initializeGame();
```

## Examples

Repository-level examples live in [examples/README.md](../examples/README.md) and show zero-config setup, shared storage and restore, custom lexicon configuration, and standalone Mahjong initialization.

## How The Server Uses Them

- [`versus-server/src/games/index.ts`](../versus-server/src/games/index.ts) registers package classes directly.
- [`versus-server/src/games/*.ts`](../versus-server/src/games) are compatibility shims for legacy imports.
- [`versus-server/src/core/base-game.ts`](../versus-server/src/core/base-game.ts) re-exports the shared core package.

That keeps the packages as the canonical game-logic source while preserving the server's existing import surface.

## Build And Release Checks

Inside any package directory:

```bash
npm run build
npm pack
```

From the repo root you can also run:

```bash
npm run docs:packages
npm run build:packages
npm run check:packages
npm run test:games
npm run publish:packages:dry-run
```

`npm run check:packages` verifies the publish contract so releases only ship built artifacts plus the package docs and license.
`npm run publish:packages` publishes `@llmletsplay/versus-*` in dependency order once npm credentials are available.

## Rules And Tests

- Every game package now ships package-local rules in `RULES.md`.
- Gameplay tests still live in [`versus-server/tests/`](../versus-server/tests), but those tests execute the package implementations through the server-compatible import surface.

## Rule Scope Notes

Most game packages implement the full rule set covered by the current engine tests.

The following packages still have deliberate scope limits and should be documented that way in releases:

- `@llmletsplay/versus-mahjong`: the package now targets Chinese Official scoring with an 8-fan minimum, scored discard/self-draw wins, chi, pon, kan, supplemental draws, multi-hand dealer/prevalent-wind progression, and exhaustive draws, but it still does not cover the full official fan catalog or side-settlement cases such as kong bonuses and exhaustive-draw ready-hand payments.



# Game Packages

`packages/` is the reusable engine layer of Versus.

## Package Boundary

Reusable packages live here:

- `@versus/game-core`
- `@versus/<game>`

Platform-only concerns stay in [`versus-server/`](../versus-server):

- auth
- rooms
- matchmaking
- ratings
- tournaments
- websocket orchestration
- wagering and settlement

## Consumer Experience

Each package is shaped like a normal npm library:

- `main`, `types`, and `exports` point at `dist/`
- `prepack` builds the package before publishing
- constructors work out of the box with the in-memory provider
- consumers can inject a storage provider explicitly when they need one

Example:

```ts
import { TicTacToeGame } from '@versus/tic-tac-toe';

const game = new TicTacToeGame('demo');
await game.initializeGame();
```

## How The Server Uses Them

- [`versus-server/src/games/index.ts`](../versus-server/src/games/index.ts) registers package classes directly.
- [`versus-server/src/games/*.ts`](../versus-server/src/games) are compatibility shims for legacy imports.
- [`versus-server/src/core/base-game.ts`](../versus-server/src/core/base-game.ts) re-exports the shared core package.

That keeps the packages as the canonical game-logic source while preserving the server's existing import surface.

## Build And Publish

Inside any package directory:

```bash
npm run build
npm pack
```

From the repo root you can also run:

```bash
npm run build:packages
npm run test:games
```

Each package uses its own `tsconfig.json` so it emits a package-local `dist/` folder with JavaScript and `.d.ts` files.

## Rules And Tests

Gameplay tests currently live in [`versus-server/tests/`](../versus-server/tests) and rules docs currently live in [`versus-server/docs/rules/`](../versus-server/docs/rules).

That is acceptable because the server now consumes the packages directly, but package-specific tests and rules can still move closer to each package over time.

## Rule Scope Notes

Most game packages implement the full rule set covered by the current engine tests.

The following packages still have deliberate scope limits and should be documented that way in releases:

- @versus/catan: board topology, random discard choice on 7s, and longest-road logic are still simplified.
- @versus/chinese-checkers: board geometry and target-completion logic are simplified.
- @versus/mahjong: the engine covers draw-discard play plus standard-hand and seven-pairs wins, but not calls, scoring, or ruleset-specific yaku systems.



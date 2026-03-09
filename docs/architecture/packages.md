# Packages

Versus separates reusable game engines from platform services so the rule engines can be embedded in other projects without copying code.

## Layers

Reusable packages:

- `@llmletsplay/versus-game-core`
- `@llmletsplay/versus-<game>`

Platform-only code:

- auth
- rooms
- matchmaking
- ratings
- tournaments
- websocket orchestration
- wagering and settlement

## Package Contract

Every standalone package should provide:

- a built `dist/` entrypoint
- type declarations
- a zero-config constructor that works with the in-memory provider
- an optional storage/provider parameter for host applications
- package-local `README.md`, `RULES.md`, and `LICENSE` files
- no dependency on server-only concerns

Example:

```js
import { PokerGame } from '@llmletsplay/versus-poker';

const game = new PokerGame('table-1');
await game.initializeGame();
const state = await game.getGameState();
```

## Using In Your Own App

A host app only needs the package import, a game id, and whatever move data the game expects:

```js
import { ChessGame } from '@llmletsplay/versus-chess';

const game = new ChessGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

For more realistic copy-pasteable snippets, see [examples/README.md](../../examples/README.md).

## How The Server Consumes Packages

- [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts) imports package classes directly.
- [`versus-server/src/games/*.ts`](../../versus-server/src/games) re-export those packages for compatibility.
- [`versus-server/src/core/base-game.ts`](../../versus-server/src/core/base-game.ts) re-exports `@llmletsplay/versus-game-core`.

## Tests, Rules, And Release Checks

- Gameplay tests live in [`versus-server/tests/`](../../versus-server/tests) and exercise the package implementations.
- Rules live beside each published package in `packages/<game>/RULES.md`.
- `npm run check:packages` validates the publish contract so releases stay clean.
- `npm run publish:packages:dry-run` verifies the tarball surface for the `@llmletsplay/versus-*` packages before a real publish.

Because the server uses the packages directly, the shared game suite still verifies the package behavior rather than a separate copy.


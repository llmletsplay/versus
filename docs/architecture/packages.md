# Packages

Versus separates reusable game engines from platform services so the rule engines can be embedded in other projects without copying code.

## Layers

Reusable packages:

- `@versus/game-core`
- `@versus/<game>`

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
- an optional database/provider parameter for host applications
- no dependency on server-only concerns

Example:

```ts
import { PokerGame } from '@versus/poker';

const game = new PokerGame('table-1');
await game.initializeGame();
const state = await game.getGameState();
```

## How The Server Consumes Packages

- [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts) imports package classes directly.
- [`versus-server/src/games/*.ts`](../../versus-server/src/games) re-export those packages for compatibility.
- [`versus-server/src/core/base-game.ts`](../../versus-server/src/core/base-game.ts) re-exports `@versus/game-core`.

## Tests And Rules

- Gameplay tests currently live in [`versus-server/tests/`](../../versus-server/tests).
- Rules docs currently live in [`versus-server/docs/rules/`](../../versus-server/docs/rules).

Because the server uses the packages directly, those tests still exercise the package implementations rather than a separate copy.

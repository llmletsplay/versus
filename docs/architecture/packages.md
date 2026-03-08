# Packages

Versus is split so the game engine layer can be reused independently from the platform server.

## Layers

Reusable packages:

- `@versus/game-core`
- `@versus/<game>`

Platform-only code:

- auth
- rooms
- ratings
- matchmaking
- tournaments
- websocket orchestration
- wagering
- x402
- intents

## Why This Split Exists

The goal is simple:

1. write the game rules once
2. reuse them in the Versus server
3. reuse them in other applications, bots, or agent systems without rewriting logic

That is why the packages use the shared in-memory database provider from `@versus/game-core` instead of forcing consumers to boot SQLite or PostgreSQL.

## Example

```ts
import { PokerGame } from '@versus/poker';
import { InMemoryDatabaseProvider } from '@versus/game-core';

const database = new InMemoryDatabaseProvider();
const game = new PokerGame('table-1', database);

await game.initializeGame();
const state = await game.getGameState();
```

## How The Server Consumes Packages

- [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts) imports package classes directly.
- [`versus-server/src/games/*.ts`](../../versus-server/src/games) are compatibility shims.
- Shared server files such as [`versus-server/src/core/base-game.ts`](../../versus-server/src/core/base-game.ts) re-export from `@versus/game-core`.

That keeps old import paths working while making the packages the canonical source.

## Tests And Rules

Today:

- tests live primarily in [`versus-server/tests/`](../../versus-server/tests)
- rules docs live primarily in [`versus-server/docs/rules/`](../../versus-server/docs/rules)

Because the server now consumes the packages, those tests still verify packaged game logic. Moving package-specific docs and tests closer to each package is the next cleanup step, not a prerequisite for open-sourcing the platform.

## NEAR Intents And The Package Boundary

NEAR Intents do not belong in the reusable game packages.

They belong above the game layer, because they are about:

- stake commitments
- escrow and settlement
- solver coordination
- cross-chain execution

The packages should answer, "what are the rules of chess?" The settlement layer should answer, "how do two agents escrow value against a chess result?"

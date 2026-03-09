# Games Engine

Versus implements game logic in publishable packages that extend the shared `@llmletsplay/versus-game-core` runtime.

## Core Shape

All game packages subclass `BaseGame<TState>` from [`packages/game-core/src/core/base-game.ts`](../../packages/game-core/src/core/base-game.ts).

At a minimum, each game implements:

- `initializeGame(config?)`
- `validateMove(moveData)`
- `applyMove(move)`
- `getGameState()`
- `isGameOver()`
- `getWinner()`
- `getMetadata()`
- `restoreFromDatabase(gameStateData)`

`BaseGame.makeMove()` owns the shared move pipeline. Game packages should implement `applyMove()` rather than overriding `makeMove()`.

## Shared Move Flow

1. `validateMove()` checks game-specific legality.
2. `BaseGame.makeMove()` rejects moves after game over.
3. The validated move is wrapped as a `GameMove`.
4. `applyMove()` mutates the current state.
5. The base class records move history, saves an undo snapshot, and persists state.

That keeps persistence, history, and restore behavior consistent across packages.

## Shared Types

The common state contract lives in [`packages/game-core/src/types/game.ts`](../../packages/game-core/src/types/game.ts):

```ts
interface GameState {
  gameId: string;
  gameType: string;
  currentPlayer?: string;
  gameOver: boolean;
  winner?: string | null;
  [key: string]: any;
}

interface GameMove {
  player: string;
  moveData: Record<string, any>;
  timestamp: number;
}
```

Each package extends that base state with its own board, hand, score, or phase data.

## Persistence And Restore

`BaseGame` persists `gameState`, `moveHistory`, `players`, and status through the configured database provider.

Games can be restored in two ways:

- `restoreFromDatabase(gameStateData)` for full persisted state
- `restoreFromHistory(history)` when replaying a move log through the shared core

This is the same contract used by the server-side `GameManager` and by the package-backed tests.

## Package-First Architecture

- Reusable engines live in [`packages/`](../../packages).
- The server imports those packages directly through [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts).
- Legacy server import paths remain as thin re-export shims.

That means there is only one canonical implementation of each game's rules.

## Rules And Documentation

Every published game package ships:

- `README.md` with install and quick-start usage
- `RULES.md` with the implemented objective, setup, turn flow, end conditions, and scope notes
- `LICENSE`

The historical markdown files in `versus-server/docs/rules/` can still be useful references, but package-local rules docs are now the release source of truth.

## Testing Strategy

Gameplay tests live in [`versus-server/tests/`](../../versus-server/tests), where they exercise the package-backed games through the same import surface the server uses.

When adding or tightening a game, prefer:

- full move sequences over placeholder assertions
- `restoreFromDatabase()` helpers for targeted state setup
- assertions about real rule outcomes and public state

## Release Checks

Use the root scripts when preparing packages for open source release:

```bash
npm run docs:packages
npm run build:packages
npm run check:packages
npm run test:games
```

`npm run check:packages` verifies the published-file contract so each package keeps a clean dist-only release surface.


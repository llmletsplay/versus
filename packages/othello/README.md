# @llmletsplay/versus-othello

Drop-in Othello engine with legal-flip validation and pass handling.

## Install

```bash
npm install @llmletsplay/versus-othello
```

## Quick Start

```js
import { OthelloGame } from '@llmletsplay/versus-othello';

const game = new OthelloGame('demo');
await game.initializeGame();
const state = await game.getGameState();

console.log(state.currentPlayer);
```

## What You Get

- ESM build output from `dist/`
- Type declarations for TS consumers
- In-memory storage by default, with optional database injection when you need persistence
- Package-local rules in [RULES.md](./RULES.md)

## Public API

- `new OthelloGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

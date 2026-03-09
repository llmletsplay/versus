# @versus/go-fish

Drop-in Go Fish engine for rank-asking and book collection.

## Install

```bash
npm install @versus/go-fish
```

## Quick Start

```js
import { GoFishGame } from '@versus/go-fish';

const game = new GoFishGame('demo');
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

- `new GoFishGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

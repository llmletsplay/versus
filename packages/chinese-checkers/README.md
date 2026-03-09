# @versus/chinese-checkers

Drop-in Chinese Checkers engine with the official 121-hole star board and chained jumps.

## Install

```bash
npm install @versus/chinese-checkers
```

## Quick Start

```js
import { ChineseCheckersGame } from '@versus/chinese-checkers';

const game = new ChineseCheckersGame('demo');
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

- `new ChineseCheckersGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

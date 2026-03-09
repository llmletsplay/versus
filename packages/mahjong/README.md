# @versus/mahjong

Drop-in Mahjong engine for 136-tile draw-discard play with discard claims and kan flow.

## Install

```bash
npm install @versus/mahjong
```

## Quick Start

```js
import { MahjongGame } from '@versus/mahjong';

const game = new MahjongGame('demo');
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

- `new MahjongGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Scope Notes

- Scoring and ruleset-specific yaku systems are not implemented.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

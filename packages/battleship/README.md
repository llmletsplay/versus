# @versus/battleship

Drop-in Battleship engine for hidden-grid naval duels.

## Install

```bash
npm install @versus/battleship
```

## Quick Start

```js
import { BattleshipGame } from '@versus/battleship';

const game = new BattleshipGame('demo');
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

- `new BattleshipGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Scope Notes

- The engine auto-places fleets rather than asking each player to position ships manually.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

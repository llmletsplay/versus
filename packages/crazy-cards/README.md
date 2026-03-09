# @llmletsplay/versus-crazy-cards

Drop-in Crazy Cards engine for UNO-style color-and-rank shedding play.

## Install

```bash
npm install @llmletsplay/versus-crazy-cards
```

## Quick Start

```js
import { CrazyCardsGame } from '@llmletsplay/versus-crazy-cards';

const game = new CrazyCardsGame('demo');
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

- `new CrazyCardsGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Scope Notes

- The engine does not support stacking draw penalties.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

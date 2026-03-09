# @llmletsplay/versus-bullshit

Drop-in bluffing and shedding engine for Bullshit / Cheat style play.

## Install

```bash
npm install @llmletsplay/versus-bullshit
```

## Quick Start

```js
import { BullshitGame } from '@llmletsplay/versus-bullshit';

const game = new BullshitGame('demo');
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

- `new BullshitGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

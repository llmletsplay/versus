# @llmletsplay/versus-catan

Drop-in Catan engine with setup, production, building, trading, and development cards.

## Install

```bash
npm install @llmletsplay/versus-catan
```

## Quick Start

```js
import { CatanGame } from '@llmletsplay/versus-catan';

const game = new CatanGame('demo');
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

- `new CatanGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

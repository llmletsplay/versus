# @llmletsplay/versus-chess

Drop-in Chess engine with legal move validation and end-state detection.

## Install

```bash
npm install @llmletsplay/versus-chess
```

## Quick Start

```js
import { ChessGame } from '@llmletsplay/versus-chess';

const game = new ChessGame('demo');
await game.initializeGame();
const state = await game.getGameState();

console.log(state.currentPlayer);
```

## Host App Pattern

Use the engine inside your UI runtime, validate the user move locally, then validate the agent reply against the same instance before committing it.

```js
const userMove = {
  player: 'white',
  from: { row: 6, col: 4 },
  to: { row: 4, col: 4 },
};

await game.validateMove(userMove);
const afterUserMove = await game.makeMove(userMove);

const agentMove = await askAgent(afterUserMove);
await game.validateMove(agentMove);
const afterAgentMove = await game.makeMove(agentMove);
```

For copy-pasteable host examples, see `examples/agent-turn-loop.mjs` and `examples/react-agent-omok.tsx`.

## What You Get

- ESM build output from `dist/`
- Type declarations for TS consumers
- In-memory storage by default, with optional database injection when you need persistence
- Package-local rules in [RULES.md](./RULES.md)

## Public API

- `new ChessGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

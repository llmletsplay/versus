# @llmletsplay/versus-go

Drop-in Go engine with captures, ko tracking, passing, and scoring.

## Install

```bash
npm install @llmletsplay/versus-go
```

## Quick Start

```js
import { GoGame } from '@llmletsplay/versus-go';

const game = new GoGame('demo');
await game.initializeGame();
const state = await game.getGameState();

console.log(state.currentPlayer);
```

## Host App Pattern

The engine is meant to live inside your app runtime, whether that runtime is a browser, server action, or agent worker.

```js
const userMove = {
  player: 'black',
  action: 'place',
  row: 3,
  col: 3,
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

- `new GoGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

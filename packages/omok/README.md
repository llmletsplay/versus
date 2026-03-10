# @llmletsplay/versus-omok

Drop-in Omok engine for five-in-a-row placement play.

## Install

```bash
npm install @llmletsplay/versus-omok
```

## Quick Start

```js
import { OmokGame } from '@llmletsplay/versus-omok';

const game = new OmokGame('demo');
await game.initializeGame();
const state = await game.getGameState();

console.log(state.currentPlayer);
```

## Host App Pattern

This package works well as a local rules engine for React, Vite, Next.js, Bun, or agent-hosted apps.

```js
const userMove = {
  player: 'black',
  row: 7,
  col: 7,
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

- `new OmokGame(gameId, database?)`
- `initializeGame(config?)`
- `validateMove(move)`
- `makeMove(move)`
- `getGameState()`

## Rules

See [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.

## Testing

This package is exercised by the shared game-engine test suite that the server integration layer also consumes.

# @versus/chess

Standalone Versus chess engine package

## Install

```bash
npm install @versus/chess
```

## Usage

```ts
import { ChessGame } from '@versus/chess';

const game = new ChessGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

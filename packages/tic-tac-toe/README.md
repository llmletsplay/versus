# @versus/tic-tac-toe

Standalone Versus tic-tac-toe engine package

## Install

```bash
npm install @versus/tic-tac-toe
```

## Usage

```ts
import { TicTacToeGame } from '@versus/tic-tac-toe';

const game = new TicTacToeGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

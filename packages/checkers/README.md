# @versus/checkers

Standalone Versus checkers engine package

## Install

```bash
npm install @versus/checkers
```

## Usage

```ts
import { CheckersGame } from '@versus/checkers';

const game = new CheckersGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

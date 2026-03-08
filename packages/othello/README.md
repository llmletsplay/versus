# @versus/othello

Standalone Versus othello engine package

## Install

```bash
npm install @versus/othello
```

## Usage

```ts
import { OthelloGame } from '@versus/othello';

const game = new OthelloGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

# @versus/bingo

Standalone Versus bingo engine package

## Install

```bash
npm install @versus/bingo
```

## Usage

```ts
import { BingoGame } from '@versus/bingo';

const game = new BingoGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

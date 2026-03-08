# @versus/cuttle

Standalone Versus cuttle engine package

## Install

```bash
npm install @versus/cuttle
```

## Usage

```ts
import { CuttleGame } from '@versus/cuttle';

const game = new CuttleGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

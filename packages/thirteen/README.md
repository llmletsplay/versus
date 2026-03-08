# @versus/thirteen

Standalone Versus thirteen engine package

## Install

```bash
npm install @versus/thirteen
```

## Usage

```ts
import { ThirteenGame } from '@versus/thirteen';

const game = new ThirteenGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

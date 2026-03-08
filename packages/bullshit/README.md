# @versus/bullshit

Standalone Versus bullshit engine package

## Install

```bash
npm install @versus/bullshit
```

## Usage

```ts
import { BullshitGame } from '@versus/bullshit';

const game = new BullshitGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

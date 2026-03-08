# @versus/hearts

Standalone Versus hearts engine package

## Install

```bash
npm install @versus/hearts
```

## Usage

```ts
import { HeartsGame } from '@versus/hearts';

const game = new HeartsGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

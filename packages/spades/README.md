# @versus/spades

Standalone Versus spades engine package

## Install

```bash
npm install @versus/spades
```

## Usage

```ts
import { SpadesGame } from '@versus/spades';

const game = new SpadesGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

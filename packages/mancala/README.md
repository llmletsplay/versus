# @versus/mancala

Standalone Versus mancala engine package

## Install

```bash
npm install @versus/mancala
```

## Usage

```ts
import { MancalaGame } from '@versus/mancala';

const game = new MancalaGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

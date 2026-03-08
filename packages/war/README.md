# @versus/war

Standalone Versus war engine package

## Install

```bash
npm install @versus/war
```

## Usage

```ts
import { WarGame } from '@versus/war';

const game = new WarGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

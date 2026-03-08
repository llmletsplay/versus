# @versus/go-fish

Standalone Versus go-fish engine package

## Install

```bash
npm install @versus/go-fish
```

## Usage

```ts
import { GoFishGame } from '@versus/go-fish';

const game = new GoFishGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

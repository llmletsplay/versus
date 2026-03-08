# @versus/go

Standalone Versus go engine package

## Install

```bash
npm install @versus/go
```

## Usage

```ts
import { GoGame } from '@versus/go';

const game = new GoGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

# @versus/battleship

Standalone Versus battleship engine package

## Install

```bash
npm install @versus/battleship
```

## Usage

```ts
import { BattleshipGame } from '@versus/battleship';

const game = new BattleshipGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

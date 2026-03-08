# @versus/poker

Standalone Versus poker engine package

## Install

```bash
npm install @versus/poker
```

## Usage

```ts
import { PokerGame } from '@versus/poker';

const game = new PokerGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

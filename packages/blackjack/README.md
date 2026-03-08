# @versus/blackjack

Standalone Versus blackjack engine package

## Install

```bash
npm install @versus/blackjack
```

## Usage

```ts
import { BlackjackGame } from '@versus/blackjack';

const game = new BlackjackGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

# @versus/connect-four

Standalone Versus connect-four engine package

## Install

```bash
npm install @versus/connect-four
```

## Usage

```ts
import { ConnectFourGame } from '@versus/connect-four';

const game = new ConnectFourGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

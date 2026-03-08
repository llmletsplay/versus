# @versus/omok

Standalone Versus omok engine package

## Install

```bash
npm install @versus/omok
```

## Usage

```ts
import { OmokGame } from '@versus/omok';

const game = new OmokGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

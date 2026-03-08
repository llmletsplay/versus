# @versus/word-tiles

Standalone Versus word-tiles engine package

## Install

```bash
npm install @versus/word-tiles
```

## Usage

```ts
import { WordTilesGame } from '@versus/word-tiles';

const game = new WordTilesGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

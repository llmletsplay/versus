# @versus/mahjong

Standalone Versus mahjong engine package

## Install

```bash
npm install @versus/mahjong
```

## Usage

```ts
import { MahjongGame } from '@versus/mahjong';

const game = new MahjongGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

## Rule Scope

This package uses a lightweight 136-tile draw-discard ruleset with standard-hand and seven-pairs win detection. It does not yet model calls, scoring, or ruleset-specific yaku systems.


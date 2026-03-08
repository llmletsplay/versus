# @versus/shogi

Standalone Versus shogi engine package

## Install

```bash
npm install @versus/shogi
```

## Usage

```ts
import { ShogiGame } from '@versus/shogi';

const game = new ShogiGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

## Rule Scope

This package implements standard movement, promotion, drops, check detection, checkmate detection, and pawn-drop mate enforcement for the current engine surface.


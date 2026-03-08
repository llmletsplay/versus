# @versus/chinese-checkers

Standalone Versus chinese-checkers engine package

## Install

```bash
npm install @versus/chinese-checkers
```

## Usage

```ts
import { ChineseCheckersGame } from '@versus/chinese-checkers';

const game = new ChineseCheckersGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

## Rule Scope

This package is playable and covered by the shared game test suite, but it uses a simplified board geometry and simplified target-completion checks compared with the full official game.

# @versus/crazy-cards

Standalone Versus UNO-style shedding-game engine package.

This package is inspired by the public gameplay structure of color-matching shedding games. It is not affiliated with or endorsed by Mattel.

## Install

```bash
npm install @versus/crazy-cards
```

## Usage

```ts
import { CrazyCardsGame } from '@versus/crazy-cards';

const game = new CrazyCardsGame('demo');
await game.initializeGame({ playerCount: 4 });
const state = await game.getGameState();
```

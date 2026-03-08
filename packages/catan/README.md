# @versus/catan

Standalone Versus catan engine package

## Install

```bash
npm install @versus/catan
```

## Usage

```ts
import { CatanGame } from '@versus/catan';

const game = new CatanGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

## Rule Scope

This package is playable and covered by the shared game test suite, but it is not a full official Catan rules implementation yet.

Current simplifications include board topology, random discard choice when a 7 is rolled, and longest-road calculation.


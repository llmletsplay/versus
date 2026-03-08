# @versus/martial-tactics

Standalone Versus martial-tactics engine package

## Install

```bash
npm install @versus/martial-tactics
```

## Usage

```ts
import { MartialTacticsGame } from '@versus/martial-tactics';

const game = new MartialTacticsGame('demo');
await game.initializeGame();
const state = await game.getGameState();
```

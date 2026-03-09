# @llmletsplay/versus-game-core

Shared runtime types and helpers for the standalone Versus game packages.

## Install

```bash
npm install @llmletsplay/versus-game-core
```

## What You Get

- `BaseGame` for shared turn-based flow, persistence hooks, and history handling
- `InMemoryDatabaseProvider` for zero-config local storage
- Shared type contracts such as `GameState`, `GameMove`, and `MoveValidationResult`
- Logging and metadata helpers used by the publishable game packages

## Quick Start

```js
import { BaseGame, InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';

const storage = new InMemoryDatabaseProvider();
console.log(typeof BaseGame, storage.constructor.name);
```

## Notes

This package provides infrastructure rather than a playable game. Consumers normally install it transitively through a game package such as `@llmletsplay/versus-chess` or `@llmletsplay/versus-tic-tac-toe`.

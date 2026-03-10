# @llmletsplay/versus-game-core

Shared runtime types and helpers for the standalone Versus game packages.

This package is headless infrastructure. It does not include any bundled UI components or styling primitives.

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

## Host App Pattern

Most apps should keep a game instance in memory, reflect `getGameState()` into local UI state, and validate both user and agent moves against that same instance.

See:

- `examples/agent-turn-loop.mjs`
- `examples/react-agent-omok.tsx`

## Notes

This package provides infrastructure rather than a playable game. Consumers normally install it transitively through a game package such as `@llmletsplay/versus-chess` or `@llmletsplay/versus-tic-tac-toe`.

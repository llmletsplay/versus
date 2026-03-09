# Architecture Overview

Versus is organized in three layers:

1. reusable game packages
2. the platform server
3. experimental settlement features

## Layer Diagram

```text
+---------------------------------------------+
| Reusable Packages                           |
| @llmletsplay/versus-game-core, @llmletsplay/versus-chess, ...       |
+------------------------+--------------------+
                         |
                         v
+---------------------------------------------+
| Platform Server (versus-server)             |
| auth, rooms, ratings, tournaments, APIs     |
+------------------------+--------------------+
                         |
                         v
+---------------------------------------------+
| Experimental Settlement Layer               |
| wagers, markets, x402, solver workflows     |
+---------------------------------------------+
```

## Reusable Game Layer

The canonical game logic lives in [`packages/`](../../packages).

- `@llmletsplay/versus-game-core` contains shared types, `BaseGame`, storage providers, and utilities.
- `@llmletsplay/versus-<game>` packages contain the actual rules for each game.

Those packages are designed to be usable outside the server.

## Platform Server

[`versus-server/`](../../versus-server) composes the reusable engines with platform concerns such as:

- auth
- rooms
- matchmaking
- ratings
- tournaments
- websocket delivery
- API routing

The server registry in [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts) imports the package classes directly.

## Shared Core Contract

All game packages extend the shared `BaseGame` from `@llmletsplay/versus-game-core` and follow the same lifecycle:

- `initializeGame()` creates the starting state
- `validateMove()` checks a proposed move
- `applyMove()` mutates the state for a validated move
- `getGameState()` returns the current public state
- `restoreFromDatabase()` restores persisted state for reloads and tests

## Stable Vs Experimental

Stable:

- reusable game packages
- shared game core
- server game lifecycle management
- multiplayer APIs and platform services

Experimental:

- wagers and escrow flows
- prediction markets
- x402 payment plumbing
- intent and solver settlement adapters

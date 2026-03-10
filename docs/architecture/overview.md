# Architecture Overview

Versus is organized around one public concern and two consumers:

1. published reusable game packages
2. the internal package test harness in this repo
3. downstream applications, bots, and custom servers

## Layer Diagram

```text
+---------------------------------------------+
| Published Packages                          |
| @llmletsplay/versus-game-core               |
| @llmletsplay/versus-chess, ...              |
+---------------------------------------------+
              |                     |
              v                     v
+---------------------------------------------+
| package-test-harness                        |
| compatibility shims, Jest suites, docs/rules |
+---------------------------------------------+

+---------------------------------------------+
| Downstream Applications                     |
| third-party apps, bots, custom servers      |
+---------------------------------------------+
```

## Reusable Game Layer

The canonical game logic lives in [`packages/`](../../packages).

- `@llmletsplay/versus-game-core` contains shared types, `BaseGame`, storage providers, and utilities.
- `@llmletsplay/versus-<game>` packages contain the actual rules for each game.

Those packages are designed to be usable outside any specific app.

## Internal Test Harness

[`package-test-harness/`](../../package-test-harness) exists so this repo can keep strong
integration coverage without pretending to be a host application. It provides:

- compatibility re-exports in `src/games/`
- the shared package-focused Jest suites in `tests/`
- historical per-game rules markdown in `docs/rules/`
- lightweight internal glue for exercising package behavior through a stable surface

The harness registry in
[`package-test-harness/src/games/index.ts`](../../package-test-harness/src/games/index.ts)
imports the package classes directly.

## Downstream Apps

Host applications should install the published packages from npm and layer their own
auth, persistence, UI, transport, and economic logic on top.

## Shared Core Contract

All game packages extend the shared `BaseGame` from `@llmletsplay/versus-game-core`
and follow the same lifecycle:

- `initializeGame()` creates the starting state
- `validateMove()` checks a proposed move
- `applyMove()` mutates the state for a validated move
- `getGameState()` returns the current public state
- `restoreFromDatabase()` restores persisted state for reloads and tests

## Stable Vs Experimental

Stable:

- reusable game packages
- shared game core
- package release tooling
- package-focused compatibility tests

Experimental:

- any host-application flow outside the package surface
- settlement, wallet, or deployment logic built on top of the packages
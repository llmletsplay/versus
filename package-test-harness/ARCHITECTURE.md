# Package Test Harness Architecture

`package-test-harness/` is an internal workspace that exercises the published game packages through a stable compatibility layer.

## Purpose

The harness exists so the package repo can keep:

- shared Jest suites for package-backed games
- compatibility re-export paths in `src/games/`
- lightweight integration glue such as `GameManager`
- historical per-game rules notes in `docs/rules/`

It is not the canonical application server. The real product app lives in `versus-platform`, and there is intentionally no product route, auth, or deployment layer left in this workspace.

## Main Pieces

- `src/games/`: package imports and thin compatibility shims
- `src/core/`: harness-only lifecycle and persistence glue
- `tests/`: public-API tests that verify the package implementations
- `docs/rules/`: historical rules markdown kept for internal reference

## Design Rule

If logic belongs in a reusable engine, put it in `packages/<game>` or `packages/game-core`.

If logic is only needed to verify packages inside this repo, keep it here.

If logic is product-specific, move it to `versus-platform`.

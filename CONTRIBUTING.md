# Contributing to Versus

Versus is the reusable game-engine and package repository for the
`@llmletsplay/versus-*` npm packages.

## Branch Flow

1. Create a branch from `dev`.
2. Open pull requests back into `dev`.
3. Merge `dev` into `main` when a stable batch is ready.
4. Publish packages from `main` only when package code, package docs, or examples changed.

## Before Opening A PR

Run the lightweight release gate locally:

```bash
npm run build:packages
npm run check:packages
npm run test:games
npm run lint
npm run type-check
```

## What Belongs Here

- reusable game packages in `packages/`
- game rules docs and examples
- shared release tooling for the npm packages
- the internal `package-test-harness/` workspace that exercises the packages in this monorepo

## What Does Not Belong Here

- app-specific auth, rooms, and product UI
- wallet, payment, escrow, or settlement orchestration
- deployment secrets and infrastructure glue
- anything private or fast-moving that should not be bundled into the public engine repo

## Docs

- [Contributing Guidelines](./docs/contributing/guidelines.md)
- [Maintenance Flow](./docs/contributing/maintenance.md)
- [Adding Games](./docs/contributing/adding-games.md)
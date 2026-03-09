# Contributing to Versus

Versus is the reusable game-engine and package repository for llmletsplay. The real product application should live in a separate repo such as `versus-platform` and consume the published npm packages from there.

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
npm --prefix versus-server run lint
npm --prefix versus-server run type-check
npm --prefix versus-client run build
```

## What Belongs Here

- reusable game packages in `packages/`
- game rules docs and examples
- shared release tooling for the npm packages
- the reference server/client that exercises the packages in this monorepo

## What Belongs In versus-platform

- betting and prediction-market product flows
- NEAR intents and settlement integrations you want to ship as a product
- deployment secrets, infrastructure glue, and product-specific UX
- anything private or fast-moving that should not be bundled into the public engine repo

## Docs

- [Contributing Guidelines](./docs/contributing/guidelines.md)
- [Maintenance Flow](./docs/contributing/maintenance.md)
- [Platform Repo Split](./docs/contributing/platform-repo.md)
- [Adding Games](./docs/contributing/adding-games.md)
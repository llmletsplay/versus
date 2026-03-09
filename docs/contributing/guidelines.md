# Contributing Guidelines

## Repo Roles

- `versus` is the public engine and package repo.
- `versus-platform` is the application repo for the betting, intents, markets, and other product-specific flows.

## Branch Flow

1. Branch from `dev`.
2. Open a pull request into `dev`.
3. Merge `dev` into `main` when the batch is ready.
4. Publish npm packages from `main` only when the package surface changed.

## Local Checks

```bash
npm run build:packages
npm run check:packages
npm run test:games
npm --prefix versus-server run lint
npm --prefix versus-server run type-check
npm --prefix versus-client run build
```

## Package Release Flow

1. Land package changes in `dev`.
2. Merge `dev` into `main`.
3. Bump package versions.
4. Run the manual GitHub Action or `npm run publish:packages` from `main`.
5. Only publish when package code, package docs, or examples changed.

## Adding Games

New games should still be package-first:

- add the engine in `packages/<game>`
- expose a clean npm API
- add concise `README.md` and `RULES.md`
- test through `versus-server/tests`
- keep placeholder assertions out of the suite

## Platform Split

Do not replace this repo's `origin` with `versus-platform`.

Instead, clone the new repo separately and export the platform layer from this repo:

```bash
git clone git@github.com:llmletsplay/versus-platform.git ../versus-platform
npm run export:platform -- --target ../versus-platform
```

See [Platform Repo Split](platform-repo.md) for the exact steps.
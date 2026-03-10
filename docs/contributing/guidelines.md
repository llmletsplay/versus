# Contributing Guidelines

## Repo Role

- `versus` is the public engine and package repo.

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
npm run lint
npm run type-check
```

## Package Release Flow

1. Land package changes in `dev`.
2. Merge `dev` into `main`.
3. Bump package versions.
4. Run the manual GitHub Action or `npm run publish:packages` from `main`.
5. Only publish when package code, package docs, or examples changed.

## Adding Games

New games should stay package-first:

- add the engine in `packages/<game>`
- expose a clean npm API
- add concise `README.md` and `RULES.md`
- test through `package-test-harness/tests`
- keep placeholder assertions out of the suite

## Repo Boundary

- `versus` is the public package repo.
- Keep application-specific auth, UI, payment, and deployment code outside this repo.
- Do not reintroduce product app workspaces into this repo.
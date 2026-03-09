# Platform Repo Split

The product application should move into the separate repository `llmletsplay/versus-platform`.

## Important Rule

Do not run `git remote add origin git@github.com:llmletsplay/versus-platform.git` inside this repo.

This repo's `origin` should stay pointed at `llmletsplay/versus`, because this is now the public game-engine and package repository.

## What Stays In This Repo

- `packages/`
- package docs and rules docs
- package examples
- package release tooling
- package-focused CI

## What Moves To versus-platform

- `versus-server/`
- `versus-client/`
- `versus-skill/`
- root runtime files such as `.env.example`, `Makefile`, and `docker-compose.yml`
- product-specific work around betting, intents, escrow, prediction markets, and deployment

## Bootstrap Commands

Clone the new repo beside this one and export the platform layer into it:

```bash
git clone git@github.com:llmletsplay/versus-platform.git ../versus-platform
npm run export:platform -- --target ../versus-platform
```

The export script copies the platform directories and rewrites the server's game-engine dependencies from local `file:../packages/*` links to published `@llmletsplay/versus-*` npm versions.

## After Export

In the new `versus-platform` repo:

```bash
npm install
git add .
git commit -m "feat: bootstrap platform repo from versus"
git push origin main
```

## Recommended Platform Repo Flow

- `dev` deploys to a development or staging environment
- `main` deploys to production
- keep the deploy secrets and environment-specific automation in `versus-platform`, not here

## Why This Split Helps

- the public engine repo stays clean and easy for outside developers to understand
- your application can evolve faster without dragging the package surface around
- your own product becomes a real downstream consumer of the published packages
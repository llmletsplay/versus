# Examples

These examples show how to use the publishable game packages directly in a plain JavaScript or TypeScript app without depending on the Versus server.

## Run From This Repo

```bash
npm run build:packages
node examples/chess-basic.mjs
node examples/shared-storage.mjs
node examples/word-tiles-custom-lexicon.mjs
node examples/mahjong-basic.mjs
```

## In Your Own App

```bash
npm install @versus/chess @versus/mahjong @versus/word-tiles @versus/game-core
```

Each package exposes a normal ESM entrypoint plus type declarations, so the same patterns work in Node, Bun, Vite, Next.js, Hono, and other modern JS runtimes.

## Included Examples

- [chess-basic.mjs](./chess-basic.mjs): initialize a game, validate a move, and apply a legal move.
- [shared-storage.mjs](./shared-storage.mjs): share a storage provider between instances and restore saved state.
- [word-tiles-custom-lexicon.mjs](./word-tiles-custom-lexicon.mjs): supply a custom lexicon for tournament or app-specific word validation.
- [mahjong-basic.mjs](./mahjong-basic.mjs): inspect initialized Chinese Official Mahjong round and session metadata from a standalone package.

Package-local rules still live beside each package in `packages/<game>/RULES.md` and ship with the npm tarball.

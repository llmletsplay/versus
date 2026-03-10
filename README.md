# Versus

Versus is the public engine repository for the `@llmletsplay/versus-*` npm packages.

This repo is intentionally narrower than `versus-platform`. It owns the reusable game engines, shared game core, package documentation, examples, release tooling, and an internal `package-test-harness/` that validates the packages through a stable compatibility surface.

## Embedding Pattern

Versus packages are designed to sit inside your app runtime, not behind a required service. A typical host app:

1. creates a game instance in memory
2. mirrors `getGameState()` into local UI state
3. validates user moves locally before sending them anywhere
4. asks an external agent or backend for the reply move
5. validates that reply against the same engine before applying it

See:

- [examples/agent-turn-loop.mjs](examples/agent-turn-loop.mjs) for a plain JavaScript host loop
- [examples/react-agent-omok.tsx](examples/react-agent-omok.tsx) for a React component pattern

## UI Boundary

Versus is intentionally headless. The packages ship game rules, move validation, state transitions, and persistence helpers, but they do not ship a styled UI kit.

That boundary is deliberate:

- host apps own their rendering, layout, animation, and design system
- packages stay portable across React, vanilla JS, canvas, terminal, server, and agent runtimes
- consumers avoid fighting prebuilt styling opinions they did not ask for

## What Lives Here

- 27+ standalone game packages in `packages/*`
- the shared runtime contract in `packages/game-core`
- package-local `README.md`, `RULES.md`, and `LICENSE`
- release checks and npm publish scripts
- examples for downstream app developers
- the internal `package-test-harness/` workspace for package-focused integration tests

## What Does Not Live Here

The product application moved to [`llmletsplay/versus-platform`](https://github.com/llmletsplay/versus-platform). That repo is the canonical home for:

- the application server and API
- the web client and product UI
- skill and agent integration surfaces
- auth, rooms, betting, prediction markets, intents, and settlement flows
- deployment and environment-specific infrastructure

## Local Checks

```bash
npm install
npm run build:packages
npm run check:packages
npm run test:games
npm run lint
npm run type-check
```

## Project Structure

```text
versus/
|-- packages/
|-- package-test-harness/
|-- examples/
|-- docs/
`-- scripts/
```

## Read Next

- [Architecture Overview](docs/architecture/overview.md)
- [Packages](docs/architecture/packages.md)
- [Games Engine](docs/architecture/games.md)
- [Examples](examples/README.md)
- [Contributing Guidelines](docs/contributing/guidelines.md)
- [Maintenance Flow](docs/contributing/maintenance.md)

## License

[MIT](LICENSE)

# Versus

Versus is the public engine repository for the `@llmletsplay/versus-*` npm packages.

This repo is intentionally narrower than `versus-platform`. It owns the reusable game engines, shared game core, package documentation, examples, release tooling, and an internal `package-test-harness/` that validates the packages through a stable compatibility surface.

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

- [Architecture Overview](architecture/overview.md)
- [Packages](architecture/packages.md)
- [Games Engine](architecture/games.md)
- [Contributing Guidelines](contributing/guidelines.md)
- [Maintenance Flow](contributing/maintenance.md)

## License

[MIT](../LICENSE)

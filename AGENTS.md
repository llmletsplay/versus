# Repository Guidelines

## Project Structure

```text
versus/
|-- packages/             # Publishable npm packages
|   |-- game-core/        # Shared runtime contract
|   `-- <game>/           # Standalone game engines
|-- package-test-harness/ # Internal compatibility + integration test workspace
|   |-- src/
|   |-- tests/
|   `-- docs/rules/
|-- examples/             # Plain JavaScript package examples
|-- docs/                 # MkDocs documentation
`-- scripts/              # Release and documentation utilities
```

## Build, Test, and Development Commands

```bash
# Package checks
npm run build:packages
npm run test:games

# Code quality
npm run lint
npm run type-check
npm run format

# Documentation
npm run dev:docs
```

## Coding Style

- **Language:** TypeScript (strict mode)
- **Indentation:** 2 spaces
- **Quotes:** Single quotes
- **Semicolons:** Required
- **Max line length:** 100 characters
- **File naming:** kebab-case for game files (`tic-tac-toe.ts`)
- **Variables:** camelCase
- **Components:** PascalCase (no default exports)

## Testing

- Gameplay tests live in `package-test-harness/tests/*.test.ts`
- Run: `npm run test:games`
- Broader harness tests run with `npm --prefix package-test-harness run test`
- Coverage threshold: 50%

## Commit Guidelines

Follow Conventional Commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling

Example: `feat(packages): add castling support to chess`

## Repo Boundary

- Keep reusable engines, package docs, examples, and release tooling in this repo.
- Keep the real product application in `llmletsplay/versus-platform`.
- Do not reintroduce `versus-server`, `versus-client`, or `versus-skill` as first-class workspaces here.

## Security

- Never commit secrets
- Use environment variables for publishing and documentation tooling
- Keep package APIs clean and free of product-specific secrets or deployment assumptions

# Contributing Guidelines

Thank you for contributing to Versus!

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## Getting Started

### Prerequisites

- Node.js 22
- Bun 1.x
- Docker and Docker Compose
- Git

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/versus.git
cd versus
bun install
make start
```

## Development Workflow

### Create Branch

```bash
git checkout -b feature/your-feature-name
```

### Make Changes

```bash
make test
make type-check
make lint
make build
```

### Commit Changes

Follow [Conventional Commits](https://conventionalcommits.org/):

```
feat: add new game type
fix: resolve move validation bug
docs: update API documentation
test: add test for chess castling
refactor: simplify game state logic
```

### Submit Pull Request

1. Push to your fork
2. Create PR against `main`
3. Fill out PR template
4. Wait for CI and review

## Code Standards

### TypeScript

- Use strict mode
- Explicit types for functions
- Avoid `any` when possible
- Use interfaces for objects

### Style

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100

### File Organization

```
packages/         # Reusable game packages
versus-server/    # Server/platform code
versus-client/    # React client
docs/             # Documentation
```

## Testing

### Run Tests

```bash
bun run test                # All tests
bun run test -- chess.test.ts  # Specific file
bun run test -- --coverage     # With coverage
```

### Write Tests

```typescript
describe('MyGame', () => {
  let game: MyGame;

  beforeEach(async () => {
    game = new MyGame('test-id', database);
    await game.initializeGame();
  });
  
  test('should initialize correctly', async () => {
    const state = await game.getGameState();
    expect(state.isGameOver).toBe(false);
  });
});
```

## Pull Request Process

1. Tests must pass
2. Code must be linted
3. Types must check
4. Coverage must not decrease
5. Documentation updated
6. New game logic should be package-first unless there is a strong reason not to

## Questions?

- Open an issue for bugs
- Use discussions for questions
- Join our Discord community

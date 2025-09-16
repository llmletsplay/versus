# Contributing to Versus 🤝

Thank you for your interest in contributing to Versus! We welcome contributions from the community and are excited to see what you'll bring to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Adding New Games](#adding-new-games)
- [Reporting Issues](#reporting-issues)

## 📜 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be Respectful**: Treat everyone with respect and kindness
- **Be Inclusive**: Welcome contributors from all backgrounds
- **Be Collaborative**: Work together to improve the project
- **Be Professional**: Keep discussions focused and constructive

## 🚀 Getting Started

1. **Fork the Repository**
   ```bash
   git clone https://github.com/yourusername/versus.git
   cd versus
   ```

2. **Install Dependencies**
   ```bash
   bun install
   bun run setup
   ```

3. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Start Development**
   ```bash
   bun run dev
   ```

## 🎯 How to Contribute

### Types of Contributions

- **🎮 New Games**: Add support for new games
- **🐛 Bug Fixes**: Fix existing issues
- **✨ Features**: Add new features or enhance existing ones
- **📚 Documentation**: Improve or add documentation
- **🧪 Tests**: Add or improve test coverage
- **🎨 UI/UX**: Enhance the user interface
- **🔧 Performance**: Optimize code for better performance

### Where to Start

- Check [open issues](https://github.com/yourusername/versus/issues)
- Look for issues labeled `good first issue` or `help wanted`
- Join our [discussions](https://github.com/yourusername/versus/discussions)
- Review the [roadmap](README.md#roadmap) for planned features

## 💻 Development Setup

### Environment Requirements

- Bun 1.0+ or Node.js 18+
- Git
- Docker (optional)
- VS Code or preferred editor

### Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Docker
- GitLens

### Development Workflow

1. **Start the development environment**
   ```bash
   bun run dev
   ```

2. **Run tests**
   ```bash
   bun test
   ```

3. **Check code quality**
   ```bash
   bun run lint
   bun run type-check
   ```

4. **Format code**
   ```bash
   bun run format
   ```

## 📝 Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Define explicit types for function parameters and returns
- Avoid `any` type unless absolutely necessary
- Use interfaces for object shapes
- Export types when they might be reused

```typescript
// Good
interface GameMove {
  player: string;
  position: number;
}

function makeMove(move: GameMove): GameState {
  // ...
}

// Avoid
function makeMove(move: any) {
  // ...
}
```

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Maximum line length: 100 characters
- Use meaningful variable and function names

### File Organization

```
src/
├── games/          # Game implementations
├── components/     # React components
├── services/       # API services
├── types/          # TypeScript types
├── utils/          # Utility functions
└── tests/          # Test files
```

## 🧪 Testing Guidelines

### Test Requirements

- All new features must include tests
- Maintain or improve existing test coverage
- Test both success and error cases
- Include edge case testing

### Writing Tests

```typescript
describe('GameName', () => {
  it('should initialize with correct state', () => {
    const game = new GameName('test-id');
    const state = await game.initializeGame();
    expect(state.gameOver).toBe(false);
  });

  it('should validate moves correctly', () => {
    // Test move validation
  });

  it('should handle edge cases', () => {
    // Test edge cases
  });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test chess.test.ts

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

## 🔄 Pull Request Process

### Before Submitting

1. **Test Your Changes**
   ```bash
   bun test
   bun run lint
   bun run type-check
   ```

2. **Update Documentation**
   - Update README if needed
   - Add/update code comments
   - Update API documentation

3. **Commit Guidelines**
   ```bash
   # Good commit messages
   git commit -m "feat: add castling support to chess"
   git commit -m "fix: correct scoring in hearts game"
   git commit -m "docs: update API documentation"
   ```

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Build process or auxiliary tool changes

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] PR description clearly explains changes
- [ ] Screenshots included for UI changes
- [ ] No console.log statements left in code
- [ ] No hardcoded values or secrets

### PR Review Process

1. Submit your PR with a clear description
2. Automated checks will run (tests, linting, etc.)
3. CodeRabbit AI will review your code
4. Maintainers will review and provide feedback
5. Make requested changes if needed
6. PR will be merged once approved

## 🎮 Adding New Games

### Game Implementation Steps

1. **Create Game File**
   ```typescript
   // versus-server/src/games/your-game.ts
   export class YourGame extends BaseGame<YourGameState> {
     // Implementation
   }
   ```

2. **Define Game State**
   ```typescript
   interface YourGameState extends GameState {
     // Game-specific state
   }
   ```

3. **Implement Required Methods**
   - `initializeGame()`
   - `validateMove()`
   - `applyMove()`
   - `isGameOver()`
   - `getWinner()`
   - `getMetadata()`

4. **Create Tests**
   ```typescript
   // versus-server/tests/your-game.test.ts
   ```

5. **Add Rules Documentation**
   ```markdown
   // versus-server/docs/rules/your-game.md
   ```

6. **Register Game**
   ```typescript
   // versus-server/src/games/index.ts
   export { YourGame } from './your-game';
   ```

### Game Requirements

- Support 2+ players
- Clear win conditions
- Move validation
- State persistence
- Comprehensive rules documentation
- Full test coverage

## 🐛 Reporting Issues

### Before Reporting

- Check existing issues
- Test with latest version
- Verify it's not a local setup issue

### Issue Template

```markdown
## Description
Clear description of the issue

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., macOS, Windows, Linux]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 1.0.0]

## Screenshots
If applicable
```

## 🎉 Recognition

Contributors will be:
- Listed in our [Contributors](https://github.com/yourusername/versus/contributors) page
- Mentioned in release notes for significant contributions
- Given credit in the code for major features

## 📞 Getting Help

- **Discord**: [Join our server](https://discord.gg/versus)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/versus/discussions)
- **Email**: contribute@versus.dev

## 🙏 Thank You!

Every contribution, no matter how small, helps make Versus better. We appreciate your time and effort in improving this project!

---

**Ready to contribute?** Pick an issue, make your changes, and submit a PR. We're excited to see what you'll build! 🚀
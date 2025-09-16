# Developer Guide & Contributing

This comprehensive guide helps you contribute to and extend the Versus Game Server. Whether you're adding new games, fixing bugs, or improving documentation, this guide has everything you need.

## 🚀 Quick Setup

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (recommended) or Node.js 18+
- TypeScript 5.0+
- Git 2.0+

### Installation

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/versus-server.git
cd versus-server

# Install dependencies
bun install

# Copy environment configuration
cp env.example .env

# Verify setup
bun test  # All tests should pass
bun run lint  # Check code quality
```

## 🎮 Adding a New Game - 5 Steps

### Step 1: Create Your Game Class

Create a new file `src/games/my-game.ts`:

```typescript
import { BaseGame } from '../core/base-game.js';
import type {
  GameConfig,
  GameState,
  GameMove,
  MoveValidationResult,
  GameMetadata,
} from '../types/game.js';

interface MyGameState {
  // Your game-specific state
  board: string[][];
  currentPlayer: string;
  gameOver: boolean;
  winner: string | null;
}

interface MyGameMove {
  player: string;
  action: string;
  position?: { row: number; col: number };
}

export class MyGame extends BaseGame {
  private currentState!: MyGameState;

  constructor(gameId: string) {
    super(gameId, 'my-game');
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    this.currentState = {
      board: Array(3)
        .fill(null)
        .map(() => Array(3).fill('')),
      currentPlayer: 'player1',
      gameOver: false,
      winner: null,
    };

    await this.persistState();
    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as MyGameMove;

      // Basic validation
      if (!move.player || !move.action) {
        return { valid: false, error: 'Player and action are required' };
      }

      if (move.player !== this.currentState.currentPlayer) {
        return { valid: false, error: 'Not your turn' };
      }

      // Add your game-specific validation here

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const gameMove = move.moveData as MyGameMove;

    // Apply the move to your game state
    // Update this.currentState based on the move

    // Check for win conditions
    this.checkWinCondition();
  }

  private checkWinCondition(): void {
    // Implement your win detection logic
    // Set this.currentState.gameOver = true and this.currentState.winner
  }

  async getGameState(): Promise<GameState> {
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: this.currentState.gameOver,
      winner: this.currentState.winner,
      currentPlayer: this.currentState.currentPlayer,
      // Add your game-specific state here
      board: this.currentState.board,
    };
  }

  async isGameOver(): Promise<boolean> {
    return this.currentState.gameOver;
  }

  async getWinner(): Promise<string | null> {
    return this.currentState.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'My Awesome Game',
      description: 'A fun new game',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '15-30 minutes',
      complexity: 'medium',
      categories: ['strategy', 'board'],
    };
  }
}
```

### Step 2: Register Your Game

Add to `src/games/index.ts`:

```typescript
import { MyGame } from './my-game.js';

export function registerGames(gameManager: GameManager): void {
  // ... existing games
  gameManager.registerGame('my-game', MyGame);
}

export {
  // ... existing exports
  MyGame,
};
```

### Step 3: Create Tests

Create `tests/my-game.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { MyGame } from '../src/games/my-game.js';

describe('MyGame', () => {
  let game: MyGame;

  beforeEach(() => {
    game = new MyGame('test-game');
  });

  test('should initialize correctly', async () => {
    await game.initializeGame();
    const state = await game.getGameState();

    expect(state.gameType).toBe('my-game');
    expect(state.gameOver).toBe(false);
  });

  test('should validate moves correctly', async () => {
    await game.initializeGame();

    const result = await game.validateMove({
      player: 'player1',
      action: 'place',
      position: { row: 0, col: 0 },
    });

    expect(result.valid).toBe(true);
  });

  // Add more tests for your game logic
});
```

### Step 4: Test Your Game

```bash
bun test tests/my-game.test.ts  # Test your specific game
bun test                        # Run all tests
```

### Step 5: Verify Integration

```bash
bun run lint                    # Check code quality
bun run dev                     # Start the server
```

## 📋 Game Templates

### Simple Board Game Template

For grid-based games like Tic-Tac-Toe, Connect Four:

```typescript
export class MyBoardGame extends BaseGame {
  private board: string[][];
  private currentPlayer: string;

  protected createBoard(rows: number, cols: number): string[][] {
    return Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(''));
  }

  protected isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < this.board.length && col >= 0 && col < this.board[0].length;
  }

  protected checkWin(player: string): boolean {
    // Implement win detection (lines, patterns, etc.)
    return false;
  }
}
```

### Card Game Template

For deck-based games like Poker, Blackjack:

```typescript
export class MyCardGame extends BaseGame {
  private deck: Card[];
  private hands: Map<string, Card[]>;

  protected createDeck(): Card[] {
    // Create and return your deck
    return [];
  }

  protected shuffleDeck(): void {
    this.deck = this.shuffleArray(this.deck);
  }

  protected dealCards(playerIds: string[], count: number): void {
    // Deal cards to players
  }
}
```

## 🔧 Common Patterns

### Move Validation Pattern

```typescript
async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
  try {
    const move = moveData as YourMoveType;

    // 1. Format validation
    if (!move.player || !move.action) {
      return { valid: false, error: 'Missing required fields' };
    }

    // 2. Game state validation
    if (this.currentState.gameOver) {
      return { valid: false, error: 'Game is over' };
    }

    // 3. Turn validation
    if (move.player !== this.currentState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    // 4. Game-specific validation
    return this.validateGameRules(move);
  } catch {
    return { valid: false, error: 'Invalid move data format' };
  }
}
```

### State Management Pattern

```typescript
protected async applyMove(move: GameMove): Promise<void> {
  const gameMove = move.moveData as YourMoveType;

  // 1. Update game state
  this.updateGameState(gameMove);

  // 2. Check end conditions
  this.checkWinCondition();

  // 3. Advance turn (if needed)
  if (!this.currentState.gameOver) {
    this.nextPlayer();
  }
}
```

## 🧪 Testing Best Practices

### Test Structure

```typescript
describe('YourGame', () => {
  describe('Game Initialization', () => {
    test('should initialize with correct defaults', () => {});
    test('should handle custom configuration', () => {});
  });

  describe('Move Validation', () => {
    test('should accept valid moves', () => {});
    test('should reject invalid moves', () => {});
  });

  describe('Game Mechanics', () => {
    test('should update state correctly', () => {});
    test('should detect win conditions', () => {});
  });

  describe('Error Handling', () => {
    test('should handle malformed input', () => {});
  });
});
```

### Test Coverage Checklist

- ✅ Game initialization
- ✅ Move validation (valid and invalid)
- ✅ Game state updates
- ✅ Win/draw conditions
- ✅ Turn management
- ✅ Error handling
- ✅ Edge cases

## 🤝 Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

- **🐛 Bug fixes** - Fix issues in existing games or core functionality
- **✨ New games** - Implement additional classic games
- **📚 Documentation** - Improve guides, API docs, or code comments
- **🧪 Tests** - Add or improve test coverage
- **⚡ Performance** - Optimize game logic or server performance
- **🔧 Tools** - Improve development experience

### Before You Start

1. **Check existing issues** - Look for related issues or discussions
2. **Create an issue** - For new features or significant changes
3. **Discuss the approach** - Get feedback before implementing
4. **Check dependencies** - Ensure changes don't break existing functionality

### Code Style Guidelines

#### TypeScript Best Practices

- **Strict Mode** - Always use TypeScript strict mode
- **Type Safety** - Prefer explicit types over `any`
- **Interfaces** - Use interfaces for object shapes
- **Null Safety** - Handle null/undefined explicitly

#### Naming Conventions

```typescript
// Classes: PascalCase
class ChessGame extends BaseGame {}

// Functions/Variables: camelCase
const gameManager = new GameManager();
function validateMove() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_PLAYERS = 8;

// Types/Interfaces: PascalCase
interface GameState {}
type PlayerColor = 'white' | 'black';
```

#### Documentation

- **JSDoc Comments** - Document all public methods
- **Inline Comments** - Explain complex logic
- **README Updates** - Update documentation for new features

```typescript
/**
 * Validates a chess move according to standard rules
 * @param moveData - The move to validate
 * @returns Promise resolving to validation result
 */
async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
  // Implementation
}
```

### Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: type(scope): description

# Examples:
git commit -m "feat(chess): add castling support"
git commit -m "fix(api): handle invalid game IDs"
git commit -m "docs(readme): update installation guide"
git commit -m "test(poker): add betting round tests"
```

#### Commit Types

- **feat** - New features
- **fix** - Bug fixes
- **docs** - Documentation changes
- **test** - Test additions/modifications
- **refactor** - Code refactoring
- **perf** - Performance improvements
- **chore** - Maintenance tasks

### Pull Request Process

1. **Create Feature Branch**

   ```bash
   git checkout -b feat/my-awesome-feature
   ```

2. **Make Changes**
   - Follow code style guidelines
   - Add/update tests
   - Update documentation

3. **Test Locally**

   ```bash
   bun test
   bun run lint
   ```

4. **Commit Changes**

   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

5. **Push to Fork**

   ```bash
   git push origin feat/my-awesome-feature
   ```

6. **Create Pull Request**
   - Use descriptive title and description
   - Reference related issues
   - Include testing instructions

### Pull Request Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing

- [ ] Tests pass locally
- [ ] New tests added
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes
```

## 🎯 Tips for Success

### 1. Start Simple

- Begin with basic functionality
- Add complexity incrementally
- Test each feature thoroughly

### 2. Follow Patterns

- Look at existing games (tic-tac-toe.ts is a good start)
- Use consistent naming conventions
- Follow the established architecture

### 3. Comprehensive Testing

- Write tests as you develop
- Test both success and failure cases
- Include edge cases and boundary conditions

### 4. Code Quality

- Run `bun run lint` frequently
- Use TypeScript types effectively
- Add meaningful error messages

### 5. Documentation

- Comment complex game logic
- Update this guide with new patterns
- Include game rules in comments

## 🔍 Debugging Tips

### Common Issues

1. **State not updating**: Check if you're calling `persistState()`
2. **Tests failing**: Verify move validation logic
3. **Type errors**: Ensure interfaces match actual data
4. **Game not registered**: Check `games/index.ts` registration

### Debug Commands

```bash
bun test --watch tests/my-game.test.ts  # Watch mode for development
bun run lint src/games/my-game.ts       # Check specific file
```

## 📚 Examples

Check these games for reference:

- **Simple**: `tic-tac-toe.ts` - Basic board game
- **Medium**: `connect-four.ts` - Drop mechanics
- **Complex**: `chess.ts` - Piece movement rules
- **Card Game**: `poker.ts` - Deck and hand management

## 🏆 Recognition

Contributors are recognized through:

- **Contributors List** - Added to README
- **Release Notes** - Mentioned in releases
- **Special Recognition** - For significant contributions

## 🤝 Getting Help

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and ideas
- **Code Review** - Ask for feedback on draft PRs

## 🚀 Ready to Build?

1. Copy a template above
2. Modify for your game rules
3. Write tests
4. Register the game
5. Test and iterate

Happy coding! 🎮

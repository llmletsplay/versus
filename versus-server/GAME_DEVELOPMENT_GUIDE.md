# Game Development Guide

This guide explains how to add new games to the Versus Game Server, following the established patterns and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Adding a New Game](#adding-a-new-game)
4. [Game Templates](#game-templates)
5. [Validation System](#validation-system)
6. [Testing Guidelines](#testing-guidelines)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

## Architecture Overview

The Versus Game Server follows a modular, extensible architecture with these key components:

```
src/
├── core/
│   ├── base-game.ts         # Abstract base class for all games
│   ├── game-manager.ts      # Game lifecycle management
│   └── stats-service.ts     # Game statistics tracking
├── games/
│   ├── [game-name].ts       # Individual game implementations
│   └── index.ts             # Game registry
├── types/
│   ├── game.ts              # Core game interfaces
│   └── game-types.ts        # Enhanced type definitions
├── utils/
│   ├── game-utils.ts        # Common game utilities
│   ├── card-utils.ts        # Card game helpers
│   ├── validation-helpers.ts # Validation utilities
│   └── game-templates.ts    # Reusable game templates
└── tests/
    └── [game-name].test.ts  # Comprehensive test suites
```

## Core Concepts

### Game State Management

Every game maintains an immutable state object that represents the complete game state:

```typescript
interface GameState {
  gameId: string;
  gameType: string;
  gameOver: boolean;
  winner: string | null;
  currentPlayer: string;
  // Game-specific state properties
}
```

### Move Validation

All games implement a two-phase move system:

1. **Validation**: Check if a move is legal
2. **Application**: Apply the validated move to the game state

### Type Safety

The codebase uses TypeScript extensively with:

- Strong typing for game states and moves
- Generic interfaces for reusable patterns
- Runtime validation for external inputs

## Adding a New Game

### Step 1: Define Game Types

Create interfaces for your game's state and moves:

```typescript
// In src/games/my-game.ts

interface MyGameState {
  // Extend BaseGameState
  gameId: string;
  gameType: string;
  gameOver: boolean;
  winner: string | null;
  currentPlayer: string;

  // Game-specific properties
  board: Cell[][];
  score: Record<string, number>;
  gamePhase: 'setup' | 'playing' | 'finished';
}

interface MyGameMove {
  player: string;
  action: 'place' | 'move' | 'capture';
  position?: Position;
  // Other move-specific properties
}
```

### Step 2: Implement the Game Class

Extend the `BaseGame` class and implement all required methods:

```typescript
import { BaseGame } from '../core/base-game.js';
import type {
  GameConfig,
  GameState,
  GameMove,
  MoveValidationResult,
  GameMetadata,
} from '../types/game.js';

export class MyGame extends BaseGame {
  private currentState: MyGameState;

  constructor(gameId: string) {
    super(gameId, 'my-game');
    this.currentState = this.createInitialState();
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    // Initialize game with optional configuration
    this.currentState = this.createInitialState(config);
    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as MyGameMove;

      // Validate move format
      if (!this.isValidMoveFormat(move)) {
        return { valid: false, error: 'Invalid move format' };
      }

      // Validate game rules
      return this.validateGameRules(move);
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const gameMove = move.moveData as MyGameMove;

    // Apply the move to the game state
    this.updateGameState(gameMove);

    // Check for game end conditions
    this.checkGameEnd();
  }

  async getGameState(): Promise<GameState> {
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: this.currentState.gameOver,
      winner: this.currentState.winner,
      currentPlayer: this.currentState.currentPlayer,
      // Include game-specific state
      ...this.currentState,
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
      name: 'My Game',
      description: 'A fun strategy game',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '15-30 minutes',
      complexity: 'medium',
      categories: ['strategy', 'board'],
    };
  }

  // Private helper methods
  private createInitialState(config?: GameConfig): MyGameState {
    // Create and return initial game state
  }

  private isValidMoveFormat(move: MyGameMove): boolean {
    // Validate move data structure
  }

  private validateGameRules(move: MyGameMove): MoveValidationResult {
    // Implement game-specific validation logic
  }

  private updateGameState(move: MyGameMove): void {
    // Apply move to current state
  }

  private checkGameEnd(): void {
    // Check for win/draw conditions
  }
}
```

### Step 3: Register the Game

Add your game to the game registry in `src/games/index.ts`:

```typescript
import { MyGame } from './my-game.js';

export const GAME_REGISTRY = {
  // ... existing games
  'my-game': MyGame,
} as const;
```

### Step 4: Create Comprehensive Tests

Create a test file `tests/my-game.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';
import { MyGame } from '../src/games/my-game.js';

describe('MyGame', () => {
  let game: MyGame;

  beforeEach(() => {
    game = new MyGame('test-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', async () => {
      const state = await game.getGameState();
      expect(state.gameType).toBe('my-game');
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('My Game');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(4);
    });
  });

  describe('Move Validation', () => {
    test('should accept valid moves', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'place',
        position: { row: 0, col: 0 },
      });
      expect(result.valid).toBe(true);
    });

    test('should reject invalid moves', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Game Mechanics', () => {
    test('should handle basic gameplay flow', async () => {
      await game.makeMove({
        player: 'player1',
        action: 'place',
        position: { row: 0, col: 0 },
      });

      const state = await game.getGameState();
      expect(state.currentPlayer).toBe('player2');
    });
  });

  describe('Win Conditions', () => {
    test('should detect game over', async () => {
      // Set up winning scenario
      // Make moves to trigger win condition
      // Assert game over and winner
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({});
      expect(result.valid).toBe(false);
    });
  });
});
```

## Game Templates

The codebase provides several templates for common game types:

### Board Games

- Use `BoardGameMixin` for grid-based games
- Includes position validation and board utilities
- Examples: Tic-Tac-Toe, Connect Four, Checkers

### Card Games

- Use `CardGameMixin` for deck-based games
- Includes deck management and card utilities
- Examples: Poker, Blackjack, Go Fish

### Turn-Based Games

- Use `TurnBasedMixin` for sequential gameplay
- Includes player rotation and turn validation
- Examples: Most strategy games

## Validation System

### Built-in Validators

The framework provides common validators:

```typescript
import { ValidationBuilder } from '../types/game-types.js';

const moveSchema = new ValidationBuilder<MyGameMove>()
  .require('player', 'action')
  .optional('position')
  .validate('player', player => ['player1', 'player2'].includes(player))
  .custom(data => {
    if (data.action === 'place' && !data.position) {
      return { valid: false, error: 'Position required for place action' };
    }
    return { valid: true };
  })
  .build();
```

### Custom Validation

For complex validation logic, implement custom validators:

```typescript
private validateGameRules(move: MyGameMove): MoveValidationResult {
  // Check turn order
  if (move.player !== this.currentState.currentPlayer) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase
  if (this.currentState.gamePhase !== 'playing') {
    return { valid: false, error: 'Game not in playing phase' };
  }

  // Game-specific rules
  return this.validateSpecificRules(move);
}
```

## Testing Guidelines

### Test Structure

Organize tests into logical groups:

- **Game Initialization**: Setup and metadata
- **Move Validation**: All validation scenarios
- **Game Mechanics**: Core gameplay logic
- **Win Conditions**: End game scenarios
- **Error Handling**: Edge cases and errors

### Test Coverage

Ensure comprehensive coverage:

- ✅ Valid moves and game flow
- ✅ Invalid moves and error messages
- ✅ Win/draw conditions
- ✅ Edge cases and boundary conditions
- ✅ Error handling and recovery

### Test Utilities

Use the provided test helpers:

```typescript
import { GameTester } from './helpers/gameTestHelpers.js';

// Run standardized test scenarios
await GameTester.runTestCase(MyGame, {
  moves: [
    { move: { player: 'player1', action: 'place' }, expectedValid: true },
    { move: { player: 'player2', action: 'place' }, expectedValid: true },
  ],
});
```

## Best Practices

### Code Organization

1. **Single Responsibility**: Each method should have one clear purpose
2. **Immutable State**: Never modify state directly, create new state objects
3. **Type Safety**: Use TypeScript interfaces for all data structures
4. **Error Handling**: Provide clear, actionable error messages

### Performance

1. **Efficient Algorithms**: Use appropriate data structures and algorithms
2. **Lazy Evaluation**: Compute expensive operations only when needed
3. **Memory Management**: Clean up resources and avoid memory leaks

### Maintainability

1. **Clear Naming**: Use descriptive names for variables and methods
2. **Documentation**: Comment complex logic and edge cases
3. **Consistent Style**: Follow the established code patterns
4. **Modular Design**: Break complex logic into smaller, testable functions

### Game Design

1. **Clear Rules**: Implement rules consistently and predictably
2. **Fair Gameplay**: Ensure balanced and fair game mechanics
3. **User Experience**: Provide helpful feedback and clear game states
4. **Extensibility**: Design for future rule variations and expansions

## Examples

### Simple Board Game (Tic-Tac-Toe)

```typescript
export class TicTacToeGame extends BaseGame {
  private currentState: TicTacToeState;

  constructor(gameId: string) {
    super(gameId, 'tic-tac-toe');
    this.currentState = {
      gameId,
      gameType: 'tic-tac-toe',
      board: Array(3)
        .fill(null)
        .map(() => Array(3).fill(null)),
      currentPlayer: 'X',
      gameOver: false,
      winner: null,
    };
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    const { row, col, player } = moveData;

    // Validate format
    if (typeof row !== 'number' || typeof col !== 'number') {
      return { valid: false, error: 'Row and column must be numbers between 0 and 2' };
    }

    // Validate bounds
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return { valid: false, error: 'Row and column must be between 0 and 2' };
    }

    // Validate player
    if (player !== 'X' && player !== 'O') {
      return { valid: false, error: 'Player must be X or O' };
    }

    // Validate turn
    if (player !== this.currentState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    // Validate position
    if (this.currentState.board[row][col] !== null) {
      return { valid: false, error: 'Position already occupied' };
    }

    return { valid: true };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { row, col, player } = move.moveData;

    // Update board
    this.currentState.board[row][col] = player;

    // Check for win
    if (this.checkWin(player)) {
      this.currentState.gameOver = true;
      this.currentState.winner = player;
    } else if (this.isBoardFull()) {
      this.currentState.gameOver = true;
      this.currentState.winner = null; // Draw
    } else {
      // Switch players
      this.currentState.currentPlayer = player === 'X' ? 'O' : 'X';
    }
  }

  private checkWin(player: string): boolean {
    const board = this.currentState.board;

    // Check rows, columns, and diagonals
    for (let i = 0; i < 3; i++) {
      if (board[i].every(cell => cell === player)) return true;
      if (board.every(row => row[i] === player)) return true;
    }

    if (board[0][0] === player && board[1][1] === player && board[2][2] === player) return true;
    if (board[0][2] === player && board[1][1] === player && board[2][0] === player) return true;

    return false;
  }

  private isBoardFull(): boolean {
    return this.currentState.board.every(row => row.every(cell => cell !== null));
  }
}
```

### Card Game (Simple War)

```typescript
export class WarGame extends BaseGame {
  private currentState: WarState;

  constructor(gameId: string) {
    super(gameId, 'war');
    this.currentState = this.createInitialState();
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = config?.playerCount || 2;
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    const players: Record<string, WarPlayer> = {};
    const cardsPerPlayer = Math.floor(deck.length / playerCount);

    for (let i = 0; i < playerCount; i++) {
      const playerId = `player${i + 1}`;
      players[playerId] = {
        hand: deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer),
        cardsWon: [],
      };
    }

    this.currentState = {
      gameId: this.gameId,
      gameType: this.gameType,
      players,
      currentPlayer: 'player1',
      gameOver: false,
      winner: null,
      currentBattle: null,
    };

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    const { player, action } = moveData;

    if (!player || !action) {
      return { valid: false, error: 'Player and action are required' };
    }

    if (!this.currentState.players[player]) {
      return { valid: false, error: 'Invalid player' };
    }

    if (action !== 'play') {
      return { valid: false, error: 'Only "play" action is allowed' };
    }

    if (this.currentState.players[player].hand.length === 0) {
      return { valid: false, error: 'No cards left to play' };
    }

    return { valid: true };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { player } = move.moveData;
    const playerState = this.currentState.players[player];

    // Play top card
    const card = playerState.hand.shift()!;

    if (!this.currentState.currentBattle) {
      this.currentState.currentBattle = {
        cards: [],
        playersInBattle: [],
      };
    }

    this.currentState.currentBattle.cards.push({ player, card });
    this.currentState.currentBattle.playersInBattle.push(player);

    // Check if all players have played
    const activePlayers = Object.keys(this.currentState.players).filter(
      p => this.currentState.players[p].hand.length > 0
    );

    if (this.currentState.currentBattle.playersInBattle.length === activePlayers.length) {
      this.resolveBattle();
    }
  }

  private resolveBattle(): void {
    const battle = this.currentState.currentBattle!;
    const highestValue = Math.max(...battle.cards.map(c => c.card.value));
    const winners = battle.cards.filter(c => c.card.value === highestValue);

    if (winners.length === 1) {
      // Single winner takes all cards
      const winner = winners[0].player;
      const allCards = battle.cards.map(c => c.card);
      this.currentState.players[winner].cardsWon.push(...allCards);
    } else {
      // War! (simplified - just split cards)
      this.splitCards(battle.cards.map(c => c.card));
    }

    this.currentState.currentBattle = null;
    this.checkGameEnd();
  }

  private checkGameEnd(): void {
    const playersWithCards = Object.entries(this.currentState.players).filter(
      ([_, player]) => player.hand.length > 0
    );

    if (playersWithCards.length <= 1) {
      this.currentState.gameOver = true;
      if (playersWithCards.length === 1) {
        this.currentState.winner = playersWithCards[0][0];
      }
    }
  }
}
```

## Conclusion

This guide provides the foundation for adding new games to the Versus Game Server. The architecture is designed to be:

- **Extensible**: Easy to add new game types
- **Consistent**: Common patterns across all games
- **Testable**: Comprehensive testing framework
- **Type-Safe**: Strong TypeScript integration
- **Maintainable**: Clear separation of concerns

For questions or clarifications, refer to existing game implementations as examples or consult the development team.

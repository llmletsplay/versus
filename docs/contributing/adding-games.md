# Adding New Games

Guide to implementing new games for Versus.

## Overview

All games extend `BaseGame<TState>` and implement required methods.

## Step 1: Define State

```typescript
// src/games/my-game.ts
import { BaseGame } from '../core/base-game.js';
import type { GameState, GameMove, GameMetadata } from '../types/game.js';

interface MyGameState extends GameState {
  board: number[];
  currentPlayer: string;
  scores: Record<string, number>;
}
```

## Step 2: Implement Game Class

```typescript
export class MyGame extends BaseGame<MyGameState> {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'my-game', database);
  }
  
  async initializeGame(config?: GameConfig): Promise<void> {
    this.currentState = {
      gameId: this.gameId,
      gameType: 'my-game',
      players: ['player1', 'player2'],
      board: Array(10).fill(0),
      currentPlayer: 'player1',
      scores: { player1: 0, player2: 0 },
      isGameOver: false,
      winner: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await this.persistState();
  }
  
  async validateMove(moveData: { player: string; position: number }): Promise<MoveValidationResult> {
    if (moveData.player !== this.currentState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }
    
    if (moveData.position < 0 || moveData.position >= 10) {
      return { valid: false, error: 'Invalid position' };
    }
    
    if (this.currentState.board[moveData.position] !== 0) {
      return { valid: false, error: 'Position taken' };
    }
    
    return { valid: true };
  }
  
  async applyMove(move: GameMove): Promise<void> {
    const { player, moveData } = move;
    
    this.currentState.board[moveData.position] = player === 'player1' ? 1 : 2;
    this.currentState.currentPlayer = player === 'player1' ? 'player2' : 'player1';
    this.currentState.updatedAt = Date.now();
    
    this.checkWin();
    
    this.history.push({ player, moveData, timestamp: Date.now() });
    await this.persistState();
  }
  
  async getGameState(): Promise<MyGameState> {
    return this.currentState;
  }
  
  isGameOver(): boolean {
    return this.currentState.isGameOver;
  }
  
  getWinner(): string | null {
    return this.currentState.winner;
  }
  
  getMetadata(): GameMetadata {
    return {
      name: 'My Game',
      description: 'A custom game',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: 10,
      difficulty: 'beginner',
      categories: ['custom']
    };
  }
  
  protected getPlayerIds(): string[] {
    return this.currentState.players;
  }
  
  private checkWin(): void {
    // Implement win condition
    // Set this.currentState.isGameOver and this.currentState.winner
  }
}
```

## Step 3: Register Game

```typescript
// src/games/index.ts
import { MyGame } from './my-game.js';

export function registerGames(gameManager: GameManager): void {
  // ... existing games
  gameManager.registerGame('my-game', MyGame);
}
```

## Step 4: Add Rules

Create `docs/rules/my-game.md`:

```markdown
# My Game Rules

## Objective
Describe the goal of the game.

## Setup
Describe initial state.

## Gameplay
1. Player 1 moves first
2. Alternate turns
3. Win condition

## Winning
Describe how to win.
```

## Step 5: Write Tests

```typescript
// tests/my-game.test.ts
import { MyGame } from '../src/games/my-game.js';
import { createDatabaseProvider } from '../src/core/database.js';

describe('MyGame', () => {
  let game: MyGame;
  let database: DatabaseProvider;
  
  beforeEach(async () => {
    database = createDatabaseProvider({ 
      type: 'sqlite', 
      sqlitePath: ':memory:' 
    });
    await database.initialize();
    
    game = new MyGame('test-id', database);
    await game.initializeGame();
  });
  
  test('initializes correctly', async () => {
    const state = await game.getGameState();
    expect(state.isGameOver).toBe(false);
    expect(state.players).toHaveLength(2);
  });
  
  test('validates moves', async () => {
    const result = await game.validateMove({
      player: 'player1',
      position: 0
    });
    expect(result.valid).toBe(true);
  });
  
  test('rejects wrong turn', async () => {
    const result = await game.validateMove({
      player: 'player2',
      position: 0
    });
    expect(result.valid).toBe(false);
  });
  
  test('applies moves', async () => {
    await game.applyMove({
      player: 'player1',
      moveData: { position: 0 }
    });
    
    const state = await game.getGameState();
    expect(state.currentPlayer).toBe('player2');
  });
});
```

## Best Practices

1. **Keep state immutable** - Always create new objects
2. **Validate thoroughly** - Check all edge cases
3. **Handle errors gracefully** - Return clear error messages
4. **Test extensively** - Cover all game states
5. **Document clearly** - Help others understand

## Example Games

Reference existing implementations:

| Game | Complexity | Good For |
|------|------------|----------|
| Tic-Tac-Toe | Simple | Learning basics |
| Connect Four | Medium | State management |
| Chess | Complex | Full featured game |

## Checklist

- [ ] State interface defined
- [ ] Game class implemented
- [ ] All required methods implemented
- [ ] Game registered
- [ ] Rules documented
- [ ] Tests written
- [ ] Tests passing

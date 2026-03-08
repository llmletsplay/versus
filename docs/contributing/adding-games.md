# Adding New Games

Guide to implementing a new reusable game package for Versus.

## Overview

New game logic should live in `packages/<game>`, not directly in the server.

The server should consume the package after the package exists.

## Step 1: Define State

```typescript
// packages/my-game/src/index.ts
import { BaseGame } from '@versus/game-core';
import type { DatabaseProvider, GameState, GameMove, GameMetadata } from '@versus/game-core';

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

## Step 3: Add Package Metadata

Create `packages/my-game/package.json`:

```json
{
  "name": "@versus/my-game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@versus/game-core": "workspace:*"
  }
}
```

## Step 4: Register Game In The Server

```typescript
// versus-server/src/games/index.ts
import { MyGame } from '@versus/my-game';

export function registerGames(gameManager: GameManager): void {
  // ... existing games
  gameManager.registerGame('my-game', MyGame);
}
```

Create a compatibility shim:

```typescript
// versus-server/src/games/my-game.ts
export * from '@versus/my-game';
```

## Step 5: Add Rules

Create `versus-server/docs/rules/my-game.md` for now.

During the package migration, rules docs can stay there. Longer-term they should move next to the game package or into a package README.

## Step 6: Write Tests

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
// versus-server/tests/my-game.test.ts
import { MyGame } from '../src/games/my-game.js';
import { InMemoryDatabaseProvider } from '@versus/game-core';

describe('MyGame', () => {
  let game: MyGame;
  beforeEach(async () => {
    const database = new InMemoryDatabaseProvider();
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

1. **Put canonical game logic in `packages/<game>`**
2. **Keep server files as shims or registration points**
3. **Use `InMemoryDatabaseProvider` for standalone tests**
4. **Validate thoroughly** and return precise errors
5. **Document rules clearly**

## Example Games

Reference existing implementations:

| Game | Complexity | Good For |
|------|------------|----------|
| Tic-Tac-Toe | Simple | Learning basics |
| Connect Four | Medium | State management |
| Chess | Complex | Full featured game |

## Checklist

- [ ] State interface defined
- [ ] Package created in `packages/<game>`
- [ ] Game class implemented
- [ ] All required methods implemented
- [ ] Server registry updated
- [ ] Compatibility shim added
- [ ] Rules documented
- [ ] Tests written
- [ ] Tests passing

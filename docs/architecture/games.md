# Games Engine

The Versus game engine provides a unified abstraction for implementing multiplayer games with state persistence, move validation, and real-time updates.

## Game Interface

All games extend `BaseGame<TState>`:

```typescript
export abstract class BaseGame<TState extends GameState> {
  protected gameId: string;
  protected gameType: string;
  protected database: DatabaseProvider;
  protected currentState: TState;
  protected history: GameMove[];
  
  // Required implementations
  abstract initializeGame(config?: GameConfig): Promise<void>;
  abstract validateMove(moveData: any): Promise<MoveValidationResult>;
  abstract applyMove(move: GameMove): Promise<void>;
  abstract getGameState(): Promise<TState>;
  abstract isGameOver(): boolean;
  abstract getWinner(): string | null;
  abstract getMetadata(): GameMetadata;
  
  // Built-in persistence
  protected async persistState(): Promise<void>;
  protected getPlayerIds(): string[];
}
```

## Game State Types

### Base State

```typescript
interface GameState {
  gameId: string;
  gameType: string;
  players: string[];
  isGameOver: boolean;
  winner: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### Example: Tic-Tac-Toe State

```typescript
interface TicTacToeState extends GameState {
  board: string[][];        // 3x3 grid
  currentPlayer: string;    // 'X' or 'O'
  moveCount: number;
}
```

### Example: Chess State

```typescript
interface ChessState extends GameState {
  board: ChessPiece[][];    // 8x8 board
  currentTurn: 'white' | 'black';
  castlingRights: CastlingRights;
  enPassantSquare: string | null;
  moveHistory: ChessMove[];
  capturedPieces: { white: PieceType[]; black: PieceType[] };
}
```

## Game Metadata

Each game provides metadata for the game selector:

```typescript
interface GameMetadata {
  name: string;              // Display name
  description: string;       // Short description
  minPlayers: number;        // Minimum players
  maxPlayers: number;        // Maximum players
  estimatedDuration: number; // Minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  categories: string[];      // ['strategy', 'card', 'classic']
}
```

## Implementing a New Game

### 1. Define State Interface

```typescript
// src/games/my-game.ts
interface MyGameState extends GameState {
  board: number[];
  currentPlayer: string;
  score: Record<string, number>;
}
```

### 2. Implement Game Class

```typescript
export class MyGame extends BaseGame<MyGameState> {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'my-game', database);
  }
  
  async initializeGame(config?: GameConfig): Promise<void> {
    this.currentState = {
      gameId: this.gameId,
      gameType: 'my-game',
      board: Array(10).fill(0),
      currentPlayer: config?.firstPlayer || 'player1',
      players: ['player1', 'player2'],
      isGameOver: false,
      winner: null,
      score: { player1: 0, player2: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await this.persistState();
  }
  
  async validateMove(moveData: { player: string; position: number }): Promise<MoveValidationResult> {
    // Check player turn
    if (moveData.player !== this.currentState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }
    
    // Check valid position
    if (moveData.position < 0 || moveData.position >= 10) {
      return { valid: false, error: 'Invalid position' };
    }
    
    // Check position not taken
    if (this.currentState.board[moveData.position] !== 0) {
      return { valid: false, error: 'Position already taken' };
    }
    
    return { valid: true };
  }
  
  async applyMove(move: GameMove): Promise<void> {
    const { player, moveData } = move;
    
    // Apply move
    this.currentState.board[moveData.position] = player === 'player1' ? 1 : 2;
    
    // Switch turns
    this.currentState.currentPlayer = player === 'player1' ? 'player2' : 'player1';
    
    // Check win condition
    this.checkGameOver();
    
    // Record history
    this.history.push({ player, moveData, timestamp: Date.now() });
    
    // Persist
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
      description: 'A custom game implementation',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: 10,
      difficulty: 'beginner',
      categories: ['custom', 'strategy']
    };
  }
  
  protected getPlayerIds(): string[] {
    return this.currentState.players;
  }
  
  private checkGameOver(): void {
    // Implement win condition logic
    // Set this.currentState.isGameOver and this.currentState.winner
  }
}
```

### 3. Register Game

```typescript
// src/games/index.ts
import { MyGame } from './my-game.js';

export function registerGames(gameManager: GameManager): void {
  // ... existing games
  gameManager.registerGame('my-game', MyGame);
}
```

## Game Manager

The `GameManager` handles game lifecycle:

```typescript
class GameManager {
  // Create new game
  async createGame(gameType: string, config?: GameConfig): Promise<string>;
  
  // Get existing game
  getGame(gameId: string): BaseGame<any>;
  
  // List available games
  getAvailableGames(): Record<string, GameMetadata>;
  
  // Get game rules
  getGameRules(gameType: string): string | null;
}
```

## Move Validation

All moves go through validation:

```typescript
interface MoveValidationResult {
  valid: boolean;
  error?: string;
  details?: any;
}
```

### Validation Flow

1. Client sends move to `/api/v1/games/:type/:id/move`
2. Route handler calls `game.validateMove(moveData)`
3. If invalid, return 400 with error
4. If valid, call `game.applyMove(move)`
5. Return updated game state

## State Persistence

Games automatically persist state to the database:

```typescript
protected async persistState(): Promise<void> {
  await this.database.saveGameState({
    gameId: this.gameId,
    gameType: this.gameType,
    gameState: this.currentState,
    moveHistory: this.history,
    players: this.getPlayerIds(),
    status: this.isGameOver() ? 'completed' : 'active'
  });
}
```

## Game Rules

Rules are stored as markdown in `versus-server/docs/rules/`:

```
versus-server/docs/rules/
├── tic-tac-toe.md
├── chess.md
├── poker.md
├── go.md
└── ...
```

Accessed via API:

```bash
GET /api/v1/games/:gameType/rules
```

## Testing Games

### Unit Test Template

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
    
    game = new MyGame('test-game', database);
    await game.initializeGame();
  });
  
  test('should initialize correctly', async () => {
    const state = await game.getGameState();
    expect(state.gameType).toBe('my-game');
    expect(state.players).toHaveLength(2);
    expect(state.isGameOver).toBe(false);
  });
  
  test('should validate moves correctly', async () => {
    const result = await game.validateMove({
      player: 'player1',
      position: 0
    });
    expect(result.valid).toBe(true);
  });
  
  test('should reject invalid moves', async () => {
    const result = await game.validateMove({
      player: 'player2',  // Wrong turn
      position: 0
    });
    expect(result.valid).toBe(false);
  });
});
```

## Supported Games

| Game | File | Players | Difficulty |
|------|------|---------|------------|
| Tic-Tac-Toe | `tic-tac-toe.ts` | 2 | Beginner |
| Chess | `chess.ts` | 2 | Advanced |
| Go | `go.ts` | 2 | Advanced |
| Poker | `poker.ts` | 2-8 | Intermediate |
| Blackjack | `blackjack.ts` | 1-7 | Beginner |
| Hearts | `hearts.ts` | 4 | Intermediate |
| Spades | `spades.ts` | 4 | Intermediate |
| Checkers | `checkers.ts` | 2 | Beginner |
| Othello | `othello.ts` | 2 | Beginner |
| Connect Four | `connect-four.ts` | 2 | Beginner |
| Mancala | `mancala.ts` | 2 | Beginner |
| Battleship | `battleship.ts` | 2 | Intermediate |
| Catan | `catan.ts` | 3-4 | Advanced |
| Mahjong | `mahjong.ts` | 4 | Advanced |
| Shogi | `shogi.ts` | 2 | Advanced |
| Cuttle | `cuttle.ts` | 2 | Intermediate |
| Go Fish | `go-fish.ts` | 2-6 | Beginner |
| War | `war.ts` | 2 | Beginner |
| Omok | `omok.ts` | 2 | Beginner |
| Chinese Checkers | `chinese-checkers.ts` | 2-6 | Intermediate |
| Bingo | `bingo.ts` | 1+ | Beginner |
| Word Tiles | `word-tiles.ts` | 2-4 | Intermediate |
| Thirteen | `thirteen.ts` | 4 | Intermediate |
| Bullshit | `bullshit.ts` | 3-10 | Beginner |
| Crazy Cards | `crazy-cards.ts` | 2-4 | Intermediate |
| Against Cards | `against-cards.ts` | 2-4 | Intermediate |
| Martial Tactics | `martial-tactics.ts` | 2 | Intermediate |

## Next Steps

- [Database](database.md) - Data persistence
- [Adding Games](../contributing/adding-games.md) - Full implementation guide

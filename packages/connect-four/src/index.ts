import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';

type Player = 'R' | 'Y'; // Red and Yellow
type Cell = Player | null;
type Board = Cell[][];

interface ConnectFourState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  lastMove?: { row: number; col: number };
}

export class ConnectFourGame extends BaseGame {
  private readonly ROWS = 6;
  private readonly COLS = 7;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'connect-four', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialState: ConnectFourState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: Array(this.ROWS)
        .fill(null)
        .map(() => Array(this.COLS).fill(null)),
      currentPlayer: 'R',
      gameOver: false,
      winner: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const { column, player } = moveData;

      // Validate required fields
      if (typeof column !== 'number') {
        return { valid: false, error: 'Column must be a number' };
      }

      if (typeof player !== 'string' || !['R', 'Y'].includes(player)) {
        return { valid: false, error: 'Player must be R or Y' };
      }

      // Check bounds
      if (column < 0 || column >= this.COLS) {
        return { valid: false, error: `Column must be between 0 and ${this.COLS - 1}` };
      }

      const state = this.currentState as ConnectFourState;

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Check if it's the player's turn
      if (player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Check if column is full
      if (state.board[0]?.[column] !== null) {
        return { valid: false, error: 'Column is full' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { column, player } = move.moveData;
    const state = this.currentState as ConnectFourState;

    // Find the lowest empty row in the column
    let row = this.ROWS - 1;
    while (row >= 0 && state.board[row]?.[column] !== null) {
      row--;
    }

    // Place the piece
    if (state.board[row]) {
      state.board[row]![column] = player as Player;
    }
    state.lastMove = { row, col: column };

    // Check for winner
    if (this.checkWinner(state.board, row, column)) {
      state.gameOver = true;
      state.winner = player as Player;
    } else if (this.isBoardFull(state.board)) {
      state.gameOver = true;
      state.winner = 'draw';
    } else {
      // Switch players
      state.currentPlayer = state.currentPlayer === 'R' ? 'Y' : 'R';
    }

    this.currentState = state;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as ConnectFourState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      lastMove: state.lastMove,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as ConnectFourState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as ConnectFourState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Connect Four',
      description:
        'Drop pieces into a 7x6 grid to get four in a row horizontally, vertically, or diagonally',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '5-15 minutes',
      complexity: 'beginner',
      categories: ['strategy', 'classic', 'family'],
    };
  }

  private checkWinner(board: Board, row: number, col: number): boolean {
    const player = board[row]?.[col];
    if (!player) {
      return false;
    }

    // Check all four directions
    return (
      this.checkDirection(board, row, col, 0, 1, player) || // Horizontal
      this.checkDirection(board, row, col, 1, 0, player) || // Vertical
      this.checkDirection(board, row, col, 1, 1, player) || // Diagonal /
      this.checkDirection(board, row, col, 1, -1, player) // Diagonal \
    );
  }

  private checkDirection(
    board: Board,
    row: number,
    col: number,
    deltaRow: number,
    deltaCol: number,
    player: Player
  ): boolean {
    let count = 1; // Count the current piece

    // Check in positive direction
    let r = row + deltaRow;
    let c = col + deltaCol;
    while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS && board[r]?.[c] === player) {
      count++;
      r += deltaRow;
      c += deltaCol;
    }

    // Check in negative direction
    r = row - deltaRow;
    c = col - deltaCol;
    while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS && board[r]?.[c] === player) {
      count++;
      r -= deltaRow;
      c -= deltaCol;
    }

    return count >= 4;
  }

  private isBoardFull(board: Board): boolean {
    return board[0]?.every((cell) => cell !== null) ?? false;
  }
}

export function createConnectFourGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): ConnectFourGame {
  return new ConnectFourGame(gameId, database);
}

import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Player = 'black' | 'white';
type Cell = Player | null;
type Board = Cell[][];

interface OmokState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  moveCount: number;
}

interface OmokMove {
  row: number;
  col: number;
  player: Player;
}

export class OmokGame extends BaseGame {
  private readonly BOARD_SIZE = 15;
  private readonly WIN_LENGTH = 5;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'omok', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialBoard = this.createInitialBoard();

    const initialState: OmokState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: initialBoard,
      currentPlayer: 'black', // Black goes first in omok
      gameOver: false,
      winner: null,
      moveCount: 0,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): Board {
    return Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as OmokMove;

      if (typeof move.row !== 'number' || typeof move.col !== 'number') {
        return { valid: false, error: 'Row and col must be numbers' };
      }

      if (typeof move.player !== 'string' || !['black', 'white'].includes(move.player)) {
        return { valid: false, error: 'Player must be black or white' };
      }

      // Check bounds
      if (
        move.row < 0 ||
        move.row >= this.BOARD_SIZE ||
        move.col < 0 ||
        move.col >= this.BOARD_SIZE
      ) {
        return { valid: false, error: `Row and col must be between 0 and ${this.BOARD_SIZE - 1}` };
      }

      const state = this.currentState as OmokState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Check if cell is empty
      if (state.board[move.row]?.[move.col] !== null) {
        return { valid: false, error: 'Cell is already occupied' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const omokMove = move.moveData as OmokMove;
    const state = this.currentState as OmokState;

    // Place the stone
    state.board[omokMove.row]![omokMove.col] = omokMove.player;
    state.moveCount++;

    // Check for winner
    const winner = this.checkWinner(omokMove.row, omokMove.col, state.board);
    if (winner) {
      state.gameOver = true;
      state.winner = winner;
    } else if (this.isBoardFull(state.board)) {
      state.gameOver = true;
      state.winner = 'draw';
    } else {
      // Switch players
      state.currentPlayer = state.currentPlayer === 'black' ? 'white' : 'black';
    }

    this.currentState = state;
  }

  private checkWinner(row: number, col: number, board: Board): Player | null {
    const player = board[row]?.[col];
    if (!player) {
      return null;
    }

    // Check all four directions: horizontal, vertical, diagonal-right, diagonal-left
    const directions: Array<[number, number]> = [
      [0, 1], // horizontal
      [1, 0], // vertical
      [1, 1], // diagonal right
      [1, -1], // diagonal left
    ];

    for (const [dRow, dCol] of directions) {
      let count = 1; // Count the current stone

      // Check in positive direction
      let r = row + dRow;
      let c = col + dCol;
      while (
        r >= 0 &&
        r < this.BOARD_SIZE &&
        c >= 0 &&
        c < this.BOARD_SIZE &&
        board[r]?.[c] === player
      ) {
        count++;
        r += dRow;
        c += dCol;
      }

      // Check in negative direction
      r = row - dRow;
      c = col - dCol;
      while (
        r >= 0 &&
        r < this.BOARD_SIZE &&
        c >= 0 &&
        c < this.BOARD_SIZE &&
        board[r]?.[c] === player
      ) {
        count++;
        r -= dRow;
        c -= dCol;
      }

      // Check if we have 5 or more in a row
      if (count >= this.WIN_LENGTH) {
        return player;
      }
    }

    return null;
  }

  private isBoardFull(board: Board): boolean {
    return board.every(row => row?.every(cell => cell !== null) ?? false);
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as OmokState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      moveCount: state.moveCount,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as OmokState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as OmokState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Omok (Five in a Row)',
      description:
        'Korean strategy game where players try to get five stones in a row on a 15x15 board',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '10-30 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'abstract', 'placement'],
    };
  }
}

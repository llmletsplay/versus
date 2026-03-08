import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';
import { BoardGameMixin, GameMetadataBuilder } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';

type Player = 'X' | 'O';
type Cell = Player | null;
type Board = Cell[][];

interface TicTacToeState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
}

export class TicTacToeGame extends BaseGame {
  private static readonly BOARD_SIZE = 3;
  private static readonly WIN_LENGTH = 3;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'tic-tac-toe', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialState: TicTacToeState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: this.createEmptyBoard(),
      currentPlayer: 'X',
      gameOver: false,
      winner: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    const state = this.currentState as TicTacToeState;

    // Check if game is over
    if (state.gameOver) {
      return { valid: false, error: 'Game is already over' };
    }

    // Check row and col first (for invalid data test)
    if (typeof moveData.row !== 'number' || typeof moveData.col !== 'number') {
      return { valid: false, error: 'Row and col must be numbers' };
    }

    // Check required fields
    if (!moveData.player) {
      return { valid: false, error: 'Move must include required fields: player' };
    }

    // Check valid player
    if (!['X', 'O'].includes(moveData.player)) {
      return { valid: false, error: 'Player must be X or O' };
    }

    // Check player turn
    if (moveData.player !== state.currentPlayer) {
      return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
    }

    // Check position bounds
    if (
      moveData.row < 0 ||
      moveData.row >= TicTacToeGame.BOARD_SIZE ||
      moveData.col < 0 ||
      moveData.col >= TicTacToeGame.BOARD_SIZE
    ) {
      return { valid: false, error: 'Row and col must be between 0 and 2' };
    }

    // Check if cell is empty
    if (state.board[moveData.row]?.[moveData.col] !== null) {
      return { valid: false, error: 'Cell is already occupied' };
    }

    return { valid: true };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { row, col, player } = move.moveData;
    const state = this.currentState as TicTacToeState;

    // Place the piece
    state.board[row]![col] = player as Player;

    // Check for winner
    if (this.checkWinner(state.board, player as Player)) {
      state.gameOver = true;
      state.winner = player as Player;
    } else if (this.isBoardFull(state.board)) {
      state.gameOver = true;
      state.winner = 'draw';
    } else {
      // Switch players
      state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    }

    this.currentState = state;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as TicTacToeState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as TicTacToeState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as TicTacToeState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return GameMetadataBuilder.create()
      .name('Tic-Tac-Toe')
      .description('Classic 3x3 grid game where players try to get three in a row')
      .players(2)
      .duration('2-5 minutes')
      .complexity('beginner')
      .categories('strategy', 'classic', 'quick')
      .build();
  }

  private createEmptyBoard(): Board {
    return Array(TicTacToeGame.BOARD_SIZE)
      .fill(null)
      .map(() => Array(TicTacToeGame.BOARD_SIZE).fill(null));
  }

  private checkWinner(board: Board, player: Player): boolean {
    return BoardGameMixin.checkLineWin(board, player, TicTacToeGame.WIN_LENGTH);
  }

  private isBoardFull(board: Board): boolean {
    return BoardGameMixin.isBoardFull(board, null);
  }
}

export function createTicTacToeGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): TicTacToeGame {
  return new TicTacToeGame(gameId, database);
}

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

interface OthelloState extends GameState {
  board: Cell[][];
  currentPlayer: Player;
  gameOver: boolean;
  passCount: number;
  blackScore: number;
  whiteScore: number;
}

interface OthelloMove {
  row: number;
  col: number;
  player: Player;
}

const BOARD_SIZE = 8;
const DIRECTIONS: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export class OthelloGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'othello', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialState: OthelloState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: this.createInitialBoard(),
      currentPlayer: 'black',
      gameOver: false,
      passCount: 0,
      blackScore: 2,
      whiteScore: 2,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): Cell[][] {
    const board: Cell[][] = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null));

    // Place initial pieces in center
    const center = BOARD_SIZE / 2;
    board[center - 1]![center - 1] = 'white';
    board[center - 1]![center] = 'black';
    board[center]![center - 1] = 'black';
    board[center]![center] = 'white';

    return board;
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  private getOpponent(player: Player): Player {
    return player === 'black' ? 'white' : 'black';
  }

  private findFlippablePieces(
    board: Cell[][],
    row: number,
    col: number,
    player: Player
  ): Array<[number, number]> {
    if (board[row]![col] !== null) {
      return [];
    }

    const opponent = this.getOpponent(player);
    const flippable: Array<[number, number]> = [];

    for (const direction of DIRECTIONS) {
      const dr = direction[0];
      const dc = direction[1];
      const lineFlippable: Array<[number, number]> = [];
      let r = row + dr;
      let c = col + dc;

      // Look for opponent pieces in this direction
      while (this.isValidPosition(r, c) && board[r]![c] === opponent) {
        lineFlippable.push([r, c]);
        r += dr;
        c += dc;
      }

      // If we found opponent pieces and ended with our piece, these can be flipped
      if (lineFlippable.length > 0 && this.isValidPosition(r, c) && board[r]![c] === player) {
        flippable.push(...lineFlippable);
      }
    }

    return flippable;
  }

  private isValidMove(board: Cell[][], row: number, col: number, player: Player): boolean {
    if (!this.isValidPosition(row, col) || board[row]![col] !== null) {
      return false;
    }

    return this.findFlippablePieces(board, row, col, player).length > 0;
  }

  private getValidMoves(board: Cell[][], player: Player): Array<[number, number]> {
    const validMoves: Array<[number, number]> = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.isValidMove(board, row, col, player)) {
          validMoves.push([row, col]);
        }
      }
    }

    return validMoves;
  }

  private makeMoveOnBoard(board: Cell[][], row: number, col: number, player: Player): Cell[][] {
    const newBoard = board.map(row => [...row]);
    const flippable = this.findFlippablePieces(board, row, col, player);

    // Place the new piece
    newBoard[row]![col] = player;

    // Flip the captured pieces
    for (const [r, c] of flippable) {
      newBoard[r]![c] = player;
    }

    return newBoard;
  }

  private calculateScores(board: Cell[][]): { blackScore: number; whiteScore: number } {
    let blackScore = 0;
    let whiteScore = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = board[row]![col];
        if (cell === 'black') {
          blackScore++;
        } else if (cell === 'white') {
          whiteScore++;
        }
      }
    }

    return { blackScore, whiteScore };
  }

  private checkGameOver(state: OthelloState): void {
    const blackMoves = this.getValidMoves(state.board, 'black');
    const whiteMoves = this.getValidMoves(state.board, 'white');

    // Game over if no moves for either player or board is full
    const boardFull = state.blackScore + state.whiteScore === BOARD_SIZE * BOARD_SIZE;
    const noMoves = blackMoves.length === 0 && whiteMoves.length === 0;

    if (boardFull || noMoves || state.passCount >= 2) {
      state.gameOver = true;
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const { row, col, player } = moveData;

      if (typeof row !== 'number' || typeof col !== 'number') {
        return { valid: false, error: 'Row and column must be numbers' };
      }

      if (typeof player !== 'string' || !['black', 'white'].includes(player)) {
        return { valid: false, error: 'Player must be "black" or "white"' };
      }

      const state = this.currentState as OthelloState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      if (!this.isValidPosition(row, col)) {
        return { valid: false, error: 'Invalid board position' };
      }

      if (state.board[row]![col] !== null) {
        return { valid: false, error: 'Position is already occupied' };
      }

      if (!this.isValidMove(state.board, row, col, player as Player)) {
        return { valid: false, error: 'Move does not capture any pieces' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { row, col, player } = move.moveData as OthelloMove;
    const state = this.currentState as OthelloState;

    // Make the move
    state.board = this.makeMoveOnBoard(state.board, row, col, player);

    // Update scores
    const scores = this.calculateScores(state.board);
    state.blackScore = scores.blackScore;
    state.whiteScore = scores.whiteScore;

    // Switch to next player
    const nextPlayer = this.getOpponent(state.currentPlayer);

    // Check if next player has valid moves
    const nextPlayerMoves = this.getValidMoves(state.board, nextPlayer);

    if (nextPlayerMoves.length > 0) {
      // Next player can move
      state.currentPlayer = nextPlayer;
      state.passCount = 0;
    } else {
      // Next player must pass, check if current player can move again
      const currentPlayerMoves = this.getValidMoves(state.board, state.currentPlayer);

      if (currentPlayerMoves.length > 0) {
        // Current player continues (opponent passed)
        state.passCount = 1;
      } else {
        // Both players must pass - game over
        state.passCount = 2;
      }
    }

    // Check for game over
    this.checkGameOver(state);

    this.currentState = state;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as OthelloState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      blackScore: state.blackScore,
      whiteScore: state.whiteScore,
      validMoves: this.getValidMoves(state.board, state.currentPlayer),
      passCount: state.passCount,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as OthelloState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as OthelloState;
    if (!state.gameOver) {
      return null;
    }

    if (state.blackScore > state.whiteScore) {
      return 'black';
    }
    if (state.whiteScore > state.blackScore) {
      return 'white';
    }
    return 'draw';
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Othello',
      description:
        'Strategic board game where you flip opponent pieces by trapping them between your pieces',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '15-30 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'board', 'classic', 'abstract'],
    };
  }
}

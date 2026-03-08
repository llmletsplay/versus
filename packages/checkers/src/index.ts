import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';

type Player = 'red' | 'black';
type PieceType = 'man' | 'king';

interface CheckersPiece {
  type: PieceType;
  color: Player;
}

type Cell = CheckersPiece | null;
type Board = Cell[][];

interface CheckersState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  mustJump: boolean;
  jumpingPiece: { row: number; col: number } | null;
}

interface CheckersMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  player: Player;
  captures?: Array<{ row: number; col: number }>;
}

export class CheckersGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'checkers', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialBoard = this.createInitialBoard();

    const initialState: CheckersState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: initialBoard,
      currentPlayer: 'red',
      gameOver: false,
      winner: null,
      mustJump: false,
      jumpingPiece: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): Board {
    const board: Board = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));

    // Black pieces (top 3 rows, only on dark squares)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          // Dark squares only
          board[row]![col] = { type: 'man', color: 'black' };
        }
      }
    }

    // Red pieces (bottom 3 rows, only on dark squares)
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          // Dark squares only
          board[row]![col] = { type: 'man', color: 'red' };
        }
      }
    }

    return board;
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as CheckersMove;

      if (!move.from || !move.to || !move.player) {
        return { valid: false, error: 'Move must include from, to, and player' };
      }

      if (!this.isValidPosition(move.from) || !this.isValidPosition(move.to)) {
        return { valid: false, error: 'Move coordinates must be between 0 and 7' };
      }

      const state = this.currentState as CheckersState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      const piece = state.board[move.from.row]?.[move.from.col];
      if (!piece) {
        return { valid: false, error: 'No piece at the from position' };
      }

      if (piece.color !== move.player) {
        return { valid: false, error: 'You can only move your own pieces' };
      }

      // Check if moving to a dark square
      if ((move.to.row + move.to.col) % 2 === 0) {
        return { valid: false, error: 'Can only move to dark squares' };
      }

      // Check if destination is empty
      if (state.board[move.to.row]?.[move.to.col]) {
        return { valid: false, error: 'Destination square is occupied' };
      }

      // If there's a jumping piece, must continue with that piece
      if (
        state.jumpingPiece &&
        (state.jumpingPiece.row !== move.from.row || state.jumpingPiece.col !== move.from.col)
      ) {
        return { valid: false, error: 'Must continue jumping with the same piece' };
      }

      // Validate the move type (regular move or jump)
      const moveValidation = this.validateMoveType(move, state);
      if (!moveValidation.valid) {
        return moveValidation;
      }

      // If jumps are available, must jump
      if (!state.jumpingPiece && this.hasAvailableJumps(state.currentPlayer, state)) {
        const isJump = Math.abs(move.to.row - move.from.row) === 2;
        if (!isJump) {
          return { valid: false, error: 'Must jump when jumps are available' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private isValidPosition(pos: { row: number; col: number }): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  private validateMoveType(move: CheckersMove, state: CheckersState): MoveValidationResult {
    const piece = state.board[move.from.row]![move.from.col]!;
    const rowDiff = move.to.row - move.from.row;
    const colDiff = Math.abs(move.to.col - move.from.col);

    // Must move diagonally
    if (Math.abs(rowDiff) !== colDiff) {
      return { valid: false, error: 'Must move diagonally' };
    }

    // Regular move (one square)
    if (Math.abs(rowDiff) === 1) {
      // Regular men can only move forward
      if (piece.type === 'man') {
        const forwardDirection = piece.color === 'red' ? -1 : 1;
        if (rowDiff !== forwardDirection) {
          return { valid: false, error: 'Regular pieces can only move forward' };
        }
      }
      return { valid: true };
    }

    // Jump move (two squares)
    if (Math.abs(rowDiff) === 2) {
      return this.validateJump(move, state);
    }

    return { valid: false, error: 'Invalid move distance' };
  }

  private validateJump(move: CheckersMove, state: CheckersState): MoveValidationResult {
    const piece = state.board[move.from.row]![move.from.col]!;
    const rowDiff = move.to.row - move.from.row;

    // Regular men can only jump forward
    if (piece.type === 'man') {
      const forwardDirection = piece.color === 'red' ? -1 : 1;
      if (Math.sign(rowDiff) !== forwardDirection) {
        return { valid: false, error: 'Regular pieces can only jump forward' };
      }
    }

    // Check if there's an opponent piece to jump over
    const middleRow = move.from.row + rowDiff / 2;
    const middleCol = move.from.col + (move.to.col - move.from.col) / 2;
    const jumpedPiece = state.board[middleRow]?.[middleCol];

    if (!jumpedPiece) {
      return { valid: false, error: 'No piece to jump over' };
    }

    if (jumpedPiece.color === piece.color) {
      return { valid: false, error: 'Cannot jump over your own piece' };
    }

    return { valid: true };
  }

  private hasAvailableJumps(player: Player, state: CheckersState): boolean {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.color === player) {
          if (this.getAvailableJumps({ row, col }, state).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private getAvailableJumps(
    from: { row: number; col: number },
    state: CheckersState
  ): Array<{ row: number; col: number }> {
    const piece = state.board[from.row]?.[from.col];
    if (!piece) {
      return [];
    }

    const jumps: Array<{ row: number; col: number }> = [];
    const directions: Array<[number, number]> =
      piece.type === 'king'
        ? [
            [-2, -2],
            [-2, 2],
            [2, -2],
            [2, 2],
          ] // King can jump in all directions
        : piece.color === 'red'
          ? [
              [-2, -2],
              [-2, 2],
            ]
          : [
              [2, -2],
              [2, 2],
            ]; // Regular pieces only forward

    for (const [rowOffset, colOffset] of directions) {
      const toRow = from.row + rowOffset;
      const toCol = from.col + colOffset;

      if (this.isValidPosition({ row: toRow, col: toCol })) {
        const move: CheckersMove = {
          from,
          to: { row: toRow, col: toCol },
          player: piece.color,
        };

        const validation = this.validateJump(move, state);
        if (validation.valid && !state.board[toRow]?.[toCol]) {
          jumps.push({ row: toRow, col: toCol });
        }
      }
    }

    return jumps;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const checkersMove = move.moveData as CheckersMove;
    const state = this.currentState as CheckersState;

    const piece = state.board[checkersMove.from.row]![checkersMove.from.col]!;
    const isJump = Math.abs(checkersMove.to.row - checkersMove.from.row) === 2;

    // Move the piece
    state.board[checkersMove.to.row]![checkersMove.to.col] = piece;
    state.board[checkersMove.from.row]![checkersMove.from.col] = null;

    // Handle captures
    if (isJump) {
      const middleRow = checkersMove.from.row + (checkersMove.to.row - checkersMove.from.row) / 2;
      const middleCol = checkersMove.from.col + (checkersMove.to.col - checkersMove.from.col) / 2;
      state.board[middleRow]![middleCol] = null;
    }

    // Check for king promotion
    this.checkKingPromotion(checkersMove.to, state);

    // Check for additional jumps
    if (isJump) {
      const additionalJumps = this.getAvailableJumps(checkersMove.to, state);
      if (additionalJumps.length > 0) {
        state.jumpingPiece = checkersMove.to;
        state.mustJump = true;
        // Don't switch players yet
        this.currentState = state;
        return;
      }
    }

    // Clear jumping state
    state.jumpingPiece = null;
    state.mustJump = false;

    // Switch players
    state.currentPlayer = state.currentPlayer === 'red' ? 'black' : 'red';

    // Check for game over
    this.checkGameOver(state);

    this.currentState = state;
  }

  private checkKingPromotion(position: { row: number; col: number }, state: CheckersState): void {
    const piece = state.board[position.row]?.[position.col];
    if (!piece || piece.type === 'king') {
      return;
    }

    // Red pieces promote when reaching row 0
    // Black pieces promote when reaching row 7
    if (
      (piece.color === 'red' && position.row === 0) ||
      (piece.color === 'black' && position.row === 7)
    ) {
      piece.type = 'king';
    }
  }

  private checkGameOver(state: CheckersState): void {
    const redPieces = this.countPieces('red', state);
    const blackPieces = this.countPieces('black', state);

    // No pieces left
    if (redPieces === 0) {
      state.gameOver = true;
      state.winner = 'black';
      return;
    }

    if (blackPieces === 0) {
      state.gameOver = true;
      state.winner = 'red';
      return;
    }

    // No legal moves available
    if (!this.hasLegalMoves(state.currentPlayer, state)) {
      state.gameOver = true;
      state.winner = state.currentPlayer === 'red' ? 'black' : 'red';
    }
  }

  private countPieces(color: Player, state: CheckersState): number {
    let count = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.color === color) {
          count++;
        }
      }
    }
    return count;
  }

  private hasLegalMoves(player: Player, state: CheckersState): boolean {
    // If must jump, check for available jumps
    if (this.hasAvailableJumps(player, state)) {
      return true;
    }

    // Check for regular moves
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.color === player) {
          if (this.hasAvailableRegularMoves({ row, col }, state)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private hasAvailableRegularMoves(
    from: { row: number; col: number },
    state: CheckersState
  ): boolean {
    const piece = state.board[from.row]?.[from.col];
    if (!piece) {
      return false;
    }

    const directions: Array<[number, number]> =
      piece.type === 'king'
        ? [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ] // King can move in all directions
        : piece.color === 'red'
          ? [
              [-1, -1],
              [-1, 1],
            ]
          : [
              [1, -1],
              [1, 1],
            ]; // Regular pieces only forward

    for (const [rowOffset, colOffset] of directions) {
      const toRow = from.row + rowOffset;
      const toCol = from.col + colOffset;

      if (
        this.isValidPosition({ row: toRow, col: toCol }) &&
        !state.board[toRow]?.[toCol] &&
        (toRow + toCol) % 2 === 1
      ) {
        // Dark square
        return true;
      }
    }

    return false;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as CheckersState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      mustJump: state.mustJump,
      jumpingPiece: state.jumpingPiece,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as CheckersState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as CheckersState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Checkers',
      description:
        'Classic board game where players move pieces diagonally, jump to capture, and promote to kings',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '15-45 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'classic', 'capture'],
    };
  }
}

export function createCheckersGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): CheckersGame {
  return new CheckersGame(gameId, database);
}

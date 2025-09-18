import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Player = 'white' | 'black';
type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

interface ChessPiece {
  type: PieceType;
  color: Player;
  hasMoved?: boolean; // For castling and pawn double move
}

type Cell = ChessPiece | null;
type Board = Cell[][];

interface ChessState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  inCheck: boolean;
  castlingRights: {
    white: { kingside: boolean; queenside: boolean };
    black: { kingside: boolean; queenside: boolean };
  };
  enPassantTarget: { row: number; col: number } | null;
  halfmoveClock: number; // For 50-move rule
  fullmoveNumber: number;
}

interface ChessMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  player: Player;
  promotion?: PieceType; // For pawn promotion
  castling?: 'kingside' | 'queenside';
}

export class ChessGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'chess', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialBoard = this.createInitialBoard();

    const initialState: ChessState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: initialBoard,
      currentPlayer: 'white',
      gameOver: false,
      winner: null,
      inCheck: false,
      castlingRights: {
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true },
      },
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): Board {
    const board: Board = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));

    // Black pieces (top of board)
    board[0] = [
      { type: 'rook', color: 'black' },
      { type: 'knight', color: 'black' },
      { type: 'bishop', color: 'black' },
      { type: 'queen', color: 'black' },
      { type: 'king', color: 'black' },
      { type: 'bishop', color: 'black' },
      { type: 'knight', color: 'black' },
      { type: 'rook', color: 'black' },
    ];

    board[1] = Array(8)
      .fill(null)
      .map(() => ({ type: 'pawn', color: 'black' }));

    // White pieces (bottom of board)
    board[6] = Array(8)
      .fill(null)
      .map(() => ({ type: 'pawn', color: 'white' }));

    board[7] = [
      { type: 'rook', color: 'white' },
      { type: 'knight', color: 'white' },
      { type: 'bishop', color: 'white' },
      { type: 'queen', color: 'white' },
      { type: 'king', color: 'white' },
      { type: 'bishop', color: 'white' },
      { type: 'knight', color: 'white' },
      { type: 'rook', color: 'white' },
    ];

    return board;
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as ChessMove;

      // Validate required fields
      if (!move.from || !move.to || !move.player) {
        return { valid: false, error: 'Move must include from, to, and player' };
      }

      if (
        typeof move.from.row !== 'number' ||
        typeof move.from.col !== 'number' ||
        typeof move.to.row !== 'number' ||
        typeof move.to.col !== 'number'
      ) {
        return { valid: false, error: 'Move coordinates must be numbers' };
      }

      if (!['white', 'black'].includes(move.player)) {
        return { valid: false, error: 'Player must be white or black' };
      }

      // Check bounds
      if (!this.isValidPosition(move.from) || !this.isValidPosition(move.to)) {
        return { valid: false, error: 'Move coordinates must be between 0 and 7' };
      }

      const state = this.currentState as ChessState;

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Check if it's the player's turn
      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Check if there's a piece at the from position
      const piece = state.board[move.from.row]?.[move.from.col];
      if (!piece) {
        return { valid: false, error: 'No piece at the from position' };
      }

      // Check if the piece belongs to the current player
      if (piece.color !== move.player) {
        return { valid: false, error: 'You can only move your own pieces' };
      }

      // Validate the specific piece movement
      const moveValidation = this.validatePieceMove(move, state);
      if (!moveValidation.valid) {
        return moveValidation;
      }

      // Check if move would leave king in check
      if (this.wouldLeaveKingInCheck(move, state)) {
        return { valid: false, error: 'Move would leave king in check' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private isValidPosition(pos: { row: number; col: number }): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
  }

  private validatePieceMove(move: ChessMove, state: ChessState): MoveValidationResult {
    const piece = state.board[move.from.row]![move.from.col]!;
    const targetPiece = state.board[move.to.row]?.[move.to.col];

    // Can't capture own piece
    if (targetPiece && targetPiece.color === piece.color) {
      return { valid: false, error: 'Cannot capture your own piece' };
    }

    switch (piece.type) {
      case 'pawn':
        return this.validatePawnMove(move, state);
      case 'rook':
        return this.validateRookMove(move, state);
      case 'knight':
        return this.validateKnightMove(move, state);
      case 'bishop':
        return this.validateBishopMove(move, state);
      case 'queen':
        return this.validateQueenMove(move, state);
      case 'king':
        return this.validateKingMove(move, state);
      default:
        return { valid: false, error: 'Unknown piece type' };
    }
  }

  private validatePawnMove(move: ChessMove, state: ChessState): MoveValidationResult {
    const { from, to } = move;
    const piece = state.board[from.row]![from.col]!;
    const targetPiece = state.board[to.row]?.[to.col];
    const direction = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;

    const rowDiff = to.row - from.row;
    const colDiff = Math.abs(to.col - from.col);

    // Forward move
    if (colDiff === 0) {
      if (targetPiece) {
        return { valid: false, error: 'Pawn cannot capture forward' };
      }

      // Single step
      if (rowDiff === direction) {
        return { valid: true };
      }

      // Double step from starting position
      if (from.row === startRow && rowDiff === 2 * direction) {
        return { valid: true };
      }

      return { valid: false, error: 'Invalid pawn move' };
    }

    // Diagonal capture
    if (colDiff === 1 && rowDiff === direction) {
      if (targetPiece && targetPiece.color !== piece.color) {
        return { valid: true };
      }

      // En passant
      if (
        state.enPassantTarget &&
        to.row === state.enPassantTarget.row &&
        to.col === state.enPassantTarget.col
      ) {
        return { valid: true };
      }

      return { valid: false, error: 'Pawn can only capture diagonally' };
    }

    return { valid: false, error: 'Invalid pawn move' };
  }

  private validateRookMove(move: ChessMove, state: ChessState): MoveValidationResult {
    const { from, to } = move;

    // Rook moves horizontally or vertically
    if (from.row !== to.row && from.col !== to.col) {
      return { valid: false, error: 'Rook can only move horizontally or vertically' };
    }

    // Check if path is clear
    if (!this.isPathClear(from, to, state.board)) {
      return { valid: false, error: 'Path is blocked' };
    }

    return { valid: true };
  }

  private validateKnightMove(move: ChessMove, _state: ChessState): MoveValidationResult {
    const { from, to } = move;
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // Knight moves in L-shape
    if ((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2)) {
      return { valid: true };
    }

    return { valid: false, error: 'Knight must move in L-shape' };
  }

  private validateBishopMove(move: ChessMove, state: ChessState): MoveValidationResult {
    const { from, to } = move;
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // Bishop moves diagonally
    if (rowDiff !== colDiff) {
      return { valid: false, error: 'Bishop can only move diagonally' };
    }

    // Check if path is clear
    if (!this.isPathClear(from, to, state.board)) {
      return { valid: false, error: 'Path is blocked' };
    }

    return { valid: true };
  }

  private validateQueenMove(move: ChessMove, state: ChessState): MoveValidationResult {
    // Queen combines rook and bishop moves
    const rookResult = this.validateRookMove(move, state);
    const bishopResult = this.validateBishopMove(move, state);

    if (rookResult.valid || bishopResult.valid) {
      return { valid: true };
    }

    return { valid: false, error: 'Queen can move like a rook or bishop' };
  }

  private validateKingMove(move: ChessMove, state: ChessState): MoveValidationResult {
    const { from, to } = move;
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // Normal king move (one square in any direction)
    if (rowDiff <= 1 && colDiff <= 1) {
      return { valid: true };
    }

    // Castling
    if (rowDiff === 0 && colDiff === 2) {
      return this.validateCastling(move, state);
    }

    return { valid: false, error: 'King can only move one square' };
  }

  private validateCastling(move: ChessMove, state: ChessState): MoveValidationResult {
    const { from, to } = move;
    const piece = state.board[from.row]![from.col]!;

    // King must not have moved
    if (piece.hasMoved) {
      return { valid: false, error: 'King has already moved' };
    }

    // King must not be in check
    if (state.inCheck) {
      return { valid: false, error: 'Cannot castle while in check' };
    }

    const isKingside = to.col > from.col;
    const castlingRights = state.castlingRights[piece.color];

    if (isKingside && !castlingRights.kingside) {
      return { valid: false, error: 'Kingside castling not available' };
    }

    if (!isKingside && !castlingRights.queenside) {
      return { valid: false, error: 'Queenside castling not available' };
    }

    // Check if path is clear and king doesn't pass through check
    const rookCol = isKingside ? 7 : 0;
    const rook = state.board[from.row]![rookCol];

    if (!rook || rook.type !== 'rook' || rook.hasMoved) {
      return { valid: false, error: 'Rook has moved or is not present' };
    }

    // Check squares between king and rook are empty
    const start = Math.min(from.col, rookCol) + 1;
    const end = Math.max(from.col, rookCol);

    for (let col = start; col < end; col++) {
      if (state.board[from.row]![col]) {
        return { valid: false, error: 'Path for castling is blocked' };
      }
    }

    // Check that king doesn't pass through or end in check
    const kingPath = isKingside ? [from.col + 1, from.col + 2] : [from.col - 1, from.col - 2];

    for (const col of kingPath) {
      const testMove: ChessMove = {
        from,
        to: { row: from.row, col },
        player: piece.color,
      };

      if (this.wouldLeaveKingInCheck(testMove, state)) {
        return { valid: false, error: 'King would pass through or end in check' };
      }
    }

    return { valid: true };
  }

  private isPathClear(
    from: { row: number; col: number },
    to: { row: number; col: number },
    board: Board
  ): boolean {
    const rowStep = Math.sign(to.row - from.row);
    const colStep = Math.sign(to.col - from.col);

    let currentRow = from.row + rowStep;
    let currentCol = from.col + colStep;

    while (currentRow !== to.row || currentCol !== to.col) {
      if (board[currentRow]?.[currentCol]) {
        return false;
      }
      currentRow += rowStep;
      currentCol += colStep;
    }

    return true;
  }

  private wouldLeaveKingInCheck(move: ChessMove, state: ChessState): boolean {
    // Create a copy of the board with the move applied
    const testBoard = state.board.map(row => [...row]);
    const piece = testBoard[move.from.row]![move.from.col]!;

    // Apply the move
    testBoard[move.to.row]![move.to.col] = piece;
    testBoard[move.from.row]![move.from.col] = null;

    // Find the king
    const kingPos = this.findKing(move.player, testBoard);
    if (!kingPos) {
      return true;
    } // King not found, something's wrong

    // Check if king is under attack
    return this.isSquareUnderAttack(kingPos, move.player, testBoard);
  }

  private findKing(color: Player, board: Board): { row: number; col: number } | null {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row]?.[col];
        if (piece && piece.type === 'king' && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  private isSquareUnderAttack(
    pos: { row: number; col: number },
    color: Player,
    board: Board
  ): boolean {
    const opponentColor = color === 'white' ? 'black' : 'white';

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row]?.[col];
        if (piece && piece.color === opponentColor) {
          if (this.canPieceAttackSquare(piece, { row, col }, pos, board)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private canPieceAttackSquare(
    piece: ChessPiece,
    piecePos: { row: number; col: number },
    targetPos: { row: number; col: number },
    board: Board
  ): boolean {
    const rowDiff = targetPos.row - piecePos.row;
    const colDiff = targetPos.col - piecePos.col;
    const absRowDiff = Math.abs(rowDiff);
    const absColDiff = Math.abs(colDiff);

    switch (piece.type) {
      case 'pawn':
        const direction = piece.color === 'white' ? -1 : 1;
        return rowDiff === direction && absColDiff === 1;

      case 'rook':
        return (rowDiff === 0 || colDiff === 0) && this.isPathClear(piecePos, targetPos, board);

      case 'knight':
        return (absRowDiff === 2 && absColDiff === 1) || (absRowDiff === 1 && absColDiff === 2);

      case 'bishop':
        return absRowDiff === absColDiff && this.isPathClear(piecePos, targetPos, board);

      case 'queen':
        return (
          (rowDiff === 0 || colDiff === 0 || absRowDiff === absColDiff) &&
          this.isPathClear(piecePos, targetPos, board)
        );

      case 'king':
        return absRowDiff <= 1 && absColDiff <= 1;

      default:
        return false;
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const chessMove = move.moveData as ChessMove;
    const state = this.currentState as ChessState;

    const piece = state.board[chessMove.from.row]![chessMove.from.col]!;
    const capturedPiece = state.board[chessMove.to.row]?.[chessMove.to.col];

    // Apply the move
    state.board[chessMove.to.row]![chessMove.to.col] = piece;
    state.board[chessMove.from.row]![chessMove.from.col] = null;

    // Mark piece as moved
    piece.hasMoved = true;

    // Handle special moves
    this.handleSpecialMoves(chessMove, state);

    // Update castling rights
    this.updateCastlingRights(chessMove, state);

    // Update en passant target
    state.enPassantTarget = this.getEnPassantTarget(chessMove, piece);

    // Update halfmove clock
    if (piece.type === 'pawn' || capturedPiece) {
      state.halfmoveClock = 0;
    } else {
      state.halfmoveClock++;
    }

    // Update fullmove number
    if (state.currentPlayer === 'black') {
      state.fullmoveNumber++;
    }

    // Switch players
    state.currentPlayer = state.currentPlayer === 'white' ? 'black' : 'white';

    // Check for check/checkmate/stalemate
    this.updateGameStatus(state);

    this.currentState = state;
  }

  private handleSpecialMoves(move: ChessMove, state: ChessState): void {
    const piece = state.board[move.to.row]![move.to.col]!;

    // Castling
    if (piece.type === 'king' && Math.abs(move.to.col - move.from.col) === 2) {
      const isKingside = move.to.col > move.from.col;
      const rookFromCol = isKingside ? 7 : 0;
      const rookToCol = isKingside ? 5 : 3;

      const rook = state.board[move.from.row]![rookFromCol]!;
      state.board[move.from.row]![rookToCol] = rook;
      state.board[move.from.row]![rookFromCol] = null;
      rook.hasMoved = true;
    }

    // En passant capture
    if (
      piece.type === 'pawn' &&
      state.enPassantTarget &&
      move.to.row === state.enPassantTarget.row &&
      move.to.col === state.enPassantTarget.col
    ) {
      const capturedPawnRow = piece.color === 'white' ? move.to.row + 1 : move.to.row - 1;
      state.board[capturedPawnRow]![move.to.col] = null;
    }

    // Pawn promotion
    if (piece.type === 'pawn' && (move.to.row === 0 || move.to.row === 7)) {
      piece.type = move.promotion || 'queen';
    }
  }

  private updateCastlingRights(move: ChessMove, state: ChessState): void {
    const piece = state.board[move.to.row]![move.to.col]!;

    // If king moves, lose all castling rights
    if (piece.type === 'king') {
      state.castlingRights[piece.color].kingside = false;
      state.castlingRights[piece.color].queenside = false;
    }

    // If rook moves or is captured, lose corresponding castling rights
    if (piece.type === 'rook' || move.from.col === 0 || move.from.col === 7) {
      if (move.from.row === 0) {
        // Black rooks
        if (move.from.col === 0) {
          state.castlingRights.black.queenside = false;
        }
        if (move.from.col === 7) {
          state.castlingRights.black.kingside = false;
        }
      } else if (move.from.row === 7) {
        // White rooks
        if (move.from.col === 0) {
          state.castlingRights.white.queenside = false;
        }
        if (move.from.col === 7) {
          state.castlingRights.white.kingside = false;
        }
      }
    }
  }

  private getEnPassantTarget(
    move: ChessMove,
    piece: ChessPiece
  ): { row: number; col: number } | null {
    if (piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
      return {
        row: (move.from.row + move.to.row) / 2,
        col: move.from.col,
      };
    }
    return null;
  }

  private updateGameStatus(state: ChessState): void {
    const kingPos = this.findKing(state.currentPlayer, state.board);
    if (!kingPos) {
      return;
    }

    state.inCheck = this.isSquareUnderAttack(kingPos, state.currentPlayer, state.board);

    // Check for checkmate or stalemate
    const hasLegalMoves = this.hasLegalMoves(state.currentPlayer, state);

    if (!hasLegalMoves) {
      state.gameOver = true;
      if (state.inCheck) {
        state.winner = state.currentPlayer === 'white' ? 'black' : 'white';
      } else {
        state.winner = 'draw'; // Stalemate
      }
    }

    // Check for 50-move rule
    if (state.halfmoveClock >= 50) {
      state.gameOver = true;
      state.winner = 'draw';
    }
  }

  private hasLegalMoves(color: Player, state: ChessState): boolean {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.color === color) {
          for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
              const move: ChessMove = {
                from: { row, col },
                to: { row: toRow, col: toCol },
                player: color,
              };

              const validation = this.validatePieceMove(move, state);
              if (validation.valid && !this.wouldLeaveKingInCheck(move, state)) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as ChessState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      inCheck: state.inCheck,
      castlingRights: state.castlingRights,
      enPassantTarget: state.enPassantTarget,
      halfmoveClock: state.halfmoveClock,
      fullmoveNumber: state.fullmoveNumber,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as ChessState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as ChessState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Chess',
      description:
        'Classic strategy game with complex piece movements, check, checkmate, and special moves like castling',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '30-120 minutes',
      complexity: 'advanced',
      categories: ['strategy', 'classic', 'complex'],
    };
  }
}

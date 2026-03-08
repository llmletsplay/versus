import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  DatabaseProvider,
  GameConfig,
  GameMetadata,
  GameMove,
  GameState,
  GameStateData,
  MoveValidationResult,
} from '@versus/game-core';

interface Position {
  row: number;
  col: number;
}

interface ShogiMove {
  from: Position;
  to: Position;
  player: 'sente' | 'gote'; // sente = first player (bottom), gote = second player (top)
  promote?: boolean;
  drop?: string; // piece type when dropping from hand
}

interface ShogiPiece {
  type: string;
  player: 'sente' | 'gote';
  promoted?: boolean;
}

export interface ShogiGameState extends GameState {
  board: (ShogiPiece | null)[][];
  currentPlayer: 'sente' | 'gote';
  gameOver: boolean;
  winner: 'sente' | 'gote' | 'draw' | null;
  capturedPieces: {
    sente: string[];
    gote: string[];
  };
  moveHistory: ShogiMove[];
  inCheck: boolean;
}

export class ShogiGame extends BaseGame<ShogiGameState> {
  private board: (ShogiPiece | null)[][];
  private currentPlayer: 'sente' | 'gote';
  private capturedPieces: { sente: string[]; gote: string[] };
  private moveHistory: ShogiMove[];

  // Piece movement patterns
  private readonly pieceMovements: Record<string, Position[]> = {
    // King (Gyoku/Osho)
    king: [
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    // Rook (Hisha)
    rook: [],
    // Bishop (Kakugyo)
    bishop: [],
    // Gold General (Kinsho)
    gold: [
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
    // Silver General (Ginsho)
    silver: [
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 1 },
    ],
    // Knight (Keima)
    knight: [
      { row: -2, col: -1 },
      { row: -2, col: 1 },
    ],
    // Lance (Kyosha)
    lance: [],
    // Pawn (Fuhyo)
    pawn: [{ row: -1, col: 0 }],
    // Promoted pieces
    'promoted-rook': [
      // Dragon King (Ryuo)
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: -1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    'promoted-bishop': [
      // Dragon Horse (Ryume)
      { row: -1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
    'promoted-silver': [
      // Same as gold
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
    'promoted-knight': [
      // Same as gold
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
    'promoted-lance': [
      // Same as gold
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
    'promoted-pawn': [
      // Same as gold
      { row: -1, col: -1 },
      { row: -1, col: 0 },
      { row: -1, col: 1 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ],
  };

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'shogi', database);
    this.board = this.initializeBoard();
    this.currentPlayer = 'sente';
    this.capturedPieces = { sente: [], gote: [] };
    this.moveHistory = [];
    this.syncCurrentState();
  }

  private getPieceAt(row: number, col: number): ShogiPiece | null {
    // Board is always properly initialized, safe to use non-null assertion
    return this.board[row]![col] ?? null;
  }

  private setPieceAt(row: number, col: number, piece: ShogiPiece | null): void {
    // Board is always properly initialized, safe to use non-null assertion
    this.board[row]![col] = piece;
  }

  private createStateSnapshot(): ShogiGameState {
    const inCheck = this.isInCheck(this.currentPlayer);
    const isCheckmate = inCheck && this.isCheckmate(this.currentPlayer);

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: this.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
      currentPlayer: this.currentPlayer,
      gameOver: isCheckmate,
      winner: isCheckmate ? (this.currentPlayer === 'sente' ? 'gote' : 'sente') : null,
      capturedPieces: {
        sente: [...this.capturedPieces.sente],
        gote: [...this.capturedPieces.gote],
      },
      moveHistory: structuredClone(this.moveHistory),
      inCheck,
      players: ['sente', 'gote'],
      status: isCheckmate ? 'completed' : 'active',
    };
  }

  private syncCurrentState(): ShogiGameState {
    const state = this.createStateSnapshot();
    this.currentState = state;
    return state;
  }

  private hydrateFromState(state: ShogiGameState): void {
    this.board = state.board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
    this.currentPlayer = state.currentPlayer;
    this.capturedPieces = {
      sente: [...state.capturedPieces.sente],
      gote: [...state.capturedPieces.gote],
    };
    this.moveHistory = structuredClone(state.moveHistory);
    this.currentState = structuredClone(state);
  }

  private withSimulation<T>(callback: () => T): T {
    const snapshot = {
      board: this.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
      currentPlayer: this.currentPlayer,
      capturedPieces: {
        sente: [...this.capturedPieces.sente],
        gote: [...this.capturedPieces.gote],
      },
      moveHistory: structuredClone(this.moveHistory),
      currentState: structuredClone(this.currentState),
    };

    try {
      return callback();
    } finally {
      this.board = snapshot.board;
      this.currentPlayer = snapshot.currentPlayer;
      this.capturedPieces = snapshot.capturedPieces;
      this.moveHistory = snapshot.moveHistory;
      this.currentState = snapshot.currentState;
    }
  }

  private wouldLeaveOwnKingInCheck(move: ShogiMove): boolean {
    return this.withSimulation(() => !this.makeShogiMove(structuredClone(move)));
  }

  private initializeBoard(): (ShogiPiece | null)[][] {
    // Create board with proper array initialization to avoid undefined rows
    const board: (ShogiPiece | null)[][] = [];
    for (let i = 0; i < 9; i++) {
      board[i] = Array(9).fill(null);
    }

    // Initialize Gote (top player) pieces
    board[0]![0] = { type: 'lance', player: 'gote' };
    board[0]![1] = { type: 'knight', player: 'gote' };
    board[0]![2] = { type: 'silver', player: 'gote' };
    board[0]![3] = { type: 'gold', player: 'gote' };
    board[0]![4] = { type: 'king', player: 'gote' };
    board[0]![5] = { type: 'gold', player: 'gote' };
    board[0]![6] = { type: 'silver', player: 'gote' };
    board[0]![7] = { type: 'knight', player: 'gote' };
    board[0]![8] = { type: 'lance', player: 'gote' };

    board[1]![1] = { type: 'rook', player: 'gote' };
    board[1]![7] = { type: 'bishop', player: 'gote' };

    for (let col = 0; col < 9; col++) {
      board[2]![col] = { type: 'pawn', player: 'gote' };
    }

    // Initialize Sente (bottom player) pieces
    for (let col = 0; col < 9; col++) {
      board[6]![col] = { type: 'pawn', player: 'sente' };
    }

    board[7]![1] = { type: 'bishop', player: 'sente' };
    board[7]![7] = { type: 'rook', player: 'sente' };

    board[8]![0] = { type: 'lance', player: 'sente' };
    board[8]![1] = { type: 'knight', player: 'sente' };
    board[8]![2] = { type: 'silver', player: 'sente' };
    board[8]![3] = { type: 'gold', player: 'sente' };
    board[8]![4] = { type: 'king', player: 'sente' };
    board[8]![5] = { type: 'gold', player: 'sente' };
    board[8]![6] = { type: 'silver', player: 'sente' };
    board[8]![7] = { type: 'knight', player: 'sente' };
    board[8]![8] = { type: 'lance', player: 'sente' };

    return board;
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < 9 && col >= 0 && col < 9;
  }

  private adjustMoveForPlayer(move: Position, player: 'sente' | 'gote'): Position {
    // Gote pieces move in opposite direction
    if (player === 'gote') {
      return { row: -move.row, col: -move.col };
    }
    return move;
  }

  private getLinearMoves(
    from: Position,
    directions: Position[],
    player: 'sente' | 'gote'
  ): Position[] {
    const moves: Position[] = [];

    for (const direction of directions) {
      const adjustedDir = this.adjustMoveForPlayer(direction, player);
      let currentRow = from.row + adjustedDir.row;
      let currentCol = from.col + adjustedDir.col;

      while (this.isValidPosition(currentRow, currentCol)) {
        const targetPiece = this.board[currentRow]![currentCol];

        if (targetPiece === null) {
          moves.push({ row: currentRow, col: currentCol });
        } else if (targetPiece?.player !== player) {
          moves.push({ row: currentRow, col: currentCol });
          break; // Can't move past an opponent piece
        } else {
          break; // Can't move past own piece
        }

        currentRow += adjustedDir.row;
        currentCol += adjustedDir.col;
      }
    }

    return moves;
  }

  private getPossibleMoves(from: Position): Position[] {
    const piece = this.board[from.row]![from.col];
    if (!piece) {
      return [];
    }

    const moves: Position[] = [];
    const pieceType = piece.promoted ? `promoted-${piece.type}` : piece.type;

    if (piece.type === 'rook' && !piece.promoted) {
      // Rook moves horizontally and vertically
      return this.getLinearMoves(
        from,
        [
          { row: -1, col: 0 },
          { row: 1, col: 0 },
          { row: 0, col: -1 },
          { row: 0, col: 1 },
        ],
        piece.player
      );
    }

    if (piece.type === 'bishop' && !piece.promoted) {
      // Bishop moves diagonally
      return this.getLinearMoves(
        from,
        [
          { row: -1, col: -1 },
          { row: -1, col: 1 },
          { row: 1, col: -1 },
          { row: 1, col: 1 },
        ],
        piece.player
      );
    }

    if (piece.type === 'lance' && !piece.promoted) {
      // Lance moves forward only
      return this.getLinearMoves(from, [{ row: -1, col: 0 }], piece.player);
    }

    if (piece.type === 'rook' && piece.promoted) {
      // Promoted rook (Dragon King) - rook + king moves
      const rookMoves = this.getLinearMoves(
        from,
        [
          { row: -1, col: 0 },
          { row: 1, col: 0 },
          { row: 0, col: -1 },
          { row: 0, col: 1 },
        ],
        piece.player
      );

      const kingMoves = (this.pieceMovements['promoted-rook'] ?? [])
        .map((move) => this.adjustMoveForPlayer(move, piece.player))
        .map((move) => ({ row: from.row + move.row, col: from.col + move.col }))
        .filter((pos) => this.isValidPosition(pos.row, pos.col))
        .filter((pos) => {
          const targetPiece = this.board[pos.row]![pos.col];
          return !targetPiece || targetPiece.player !== piece.player;
        });

      return [...rookMoves, ...kingMoves];
    }

    if (piece.type === 'bishop' && piece.promoted) {
      // Promoted bishop (Dragon Horse) - bishop + king moves
      const bishopMoves = this.getLinearMoves(
        from,
        [
          { row: -1, col: -1 },
          { row: -1, col: 1 },
          { row: 1, col: -1 },
          { row: 1, col: 1 },
        ],
        piece.player
      );

      const kingMoves = (this.pieceMovements['promoted-bishop'] ?? [])
        .map((move) => this.adjustMoveForPlayer(move, piece.player))
        .map((move) => ({ row: from.row + move.row, col: from.col + move.col }))
        .filter((pos) => this.isValidPosition(pos.row, pos.col))
        .filter((pos) => {
          const targetPiece = this.board[pos.row]![pos.col];
          return !targetPiece || targetPiece.player !== piece.player;
        });

      return [...bishopMoves, ...kingMoves];
    }

    // Standard piece movements
    const movements = this.pieceMovements[pieceType] || [];

    for (const movement of movements) {
      const adjustedMove = this.adjustMoveForPlayer(movement, piece.player);
      const newRow = from.row + adjustedMove.row;
      const newCol = from.col + adjustedMove.col;

      if (this.isValidPosition(newRow, newCol)) {
        const targetPiece = this.board[newRow]![newCol];
        if (!targetPiece || targetPiece.player !== piece.player) {
          moves.push({ row: newRow, col: newCol });
        }
      }
    }

    return moves;
  }

  private canPromote(piece: ShogiPiece, from: Position, to: Position): boolean {
    if (piece.promoted || piece.type === 'king' || piece.type === 'gold') {
      return false;
    }

    const promotionZone = piece.player === 'sente' ? [0, 1, 2] : [6, 7, 8];
    return promotionZone.includes(from.row) || promotionZone.includes(to.row);
  }

  private mustPromote(piece: ShogiPiece, to: Position): boolean {
    if (piece.promoted || piece.type === 'king' || piece.type === 'gold') {
      return false;
    }

    // Pawns, lances, and knights must promote in certain positions
    if (piece.player === 'sente') {
      if (piece.type === 'pawn' || piece.type === 'lance') {
        return to.row === 0;
      }
      if (piece.type === 'knight') {
        return to.row <= 1;
      }
    } else {
      if (piece.type === 'pawn' || piece.type === 'lance') {
        return to.row === 8;
      }
      if (piece.type === 'knight') {
        return to.row >= 7;
      }
    }

    return false;
  }

  private isInCheck(player: 'sente' | 'gote'): boolean {
    // Find the king
    let kingPos: Position | null = null;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = this.board[row]![col];
        if (piece && piece.type === 'king' && piece.player === player) {
          kingPos = { row, col };
          break;
        }
      }
      if (kingPos) {
        break;
      }
    }

    if (!kingPos) {
      return false;
    }

    // Check if any opponent piece can attack the king
    const opponent = player === 'sente' ? 'gote' : 'sente';
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = this.board[row]![col];
        if (piece && piece.player === opponent) {
          const possibleMoves = this.getPossibleMoves({ row, col });
          if (
            possibleMoves.some((move) => move.row === kingPos!.row && move.col === kingPos!.col)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private getDropMoves(
    player: 'sente' | 'gote',
    options: { enforcePawnDropMate?: boolean } = {}
  ): Array<{ position: Position; piece: string }> {
    const drops: Array<{ position: Position; piece: string }> = [];
    const capturedByPlayer = this.capturedPieces[player];

    for (const pieceType of capturedByPlayer) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (this.board[row]![col] === null) {
            if (this.isLegalDrop(pieceType, { row, col }, player, options)) {
              drops.push({ position: { row, col }, piece: pieceType });
            }
          }
        }
      }
    }

    return drops;
  }

  private isIllegalPawnDropMate(position: Position, player: 'sente' | 'gote'): boolean {
    const opponent = player === 'sente' ? 'gote' : 'sente';

    return this.withSimulation(() => {
      this.board[position.row]![position.col] = { type: 'pawn', player };
      return this.isInCheck(opponent) && this.isCheckmate(opponent);
    });
  }

  private isLegalDrop(
    pieceType: string,
    position: Position,
    player: 'sente' | 'gote',
    options: { enforcePawnDropMate?: boolean } = {}
  ): boolean {
    // Pawns cannot be dropped in certain situations
    if (pieceType === 'pawn') {
      // Cannot drop pawn on last rank
      if ((player === 'sente' && position.row === 0) || (player === 'gote' && position.row === 8)) {
        return false;
      }

      // Cannot drop pawn in same file as existing pawn
      for (let row = 0; row < 9; row++) {
        const piece = this.board[row]![position.col];
        if (piece && piece.type === 'pawn' && piece.player === player && !piece.promoted) {
          return false;
        }
      }

      if (options.enforcePawnDropMate !== false && this.isIllegalPawnDropMate(position, player)) {
        return false;
      }
    }

    // Lances and knights cannot be dropped on last rank(s) where they cannot move
    if (pieceType === 'lance') {
      if ((player === 'sente' && position.row === 0) || (player === 'gote' && position.row === 8)) {
        return false;
      }
    }

    if (pieceType === 'knight') {
      if ((player === 'sente' && position.row <= 1) || (player === 'gote' && position.row >= 7)) {
        return false;
      }
    }

    return true;
  }

  private makeShogiMove(move: ShogiMove): boolean {
    if (move.player !== this.currentPlayer) {
      return false;
    }

    // Handle piece drops
    if (move.drop) {
      if (this.board[move.to.row]![move.to.col] !== null) {
        return false;
      }

      if (!this.isLegalDrop(move.drop, move.to, move.player)) {
        return false;
      }

      const capturedByPlayer = this.capturedPieces[move.player];
      const pieceIndex = capturedByPlayer.indexOf(move.drop);
      if (pieceIndex === -1) {
        return false;
      }

      // Place the piece and remove from captured pieces
      this.board[move.to.row]![move.to.col] = { type: move.drop, player: move.player };
      capturedByPlayer.splice(pieceIndex, 1);

      this.moveHistory.push(move);
      this.currentPlayer = this.currentPlayer === 'sente' ? 'gote' : 'sente';
      return true;
    }

    // Handle regular moves
    const piece = this.board[move.from.row]![move.from.col];
    if (!piece || piece.player !== move.player) {
      return false;
    }

    const possibleMoves = this.getPossibleMoves(move.from);
    const isValidMove = possibleMoves.some(
      (pos) => pos.row === move.to.row && pos.col === move.to.col
    );

    if (!isValidMove) {
      return false;
    }

    // Check for forced promotion
    if (this.mustPromote(piece, move.to)) {
      move.promote = true;
    }

    // Handle capture
    const capturedPiece = this.board[move.to.row]![move.to.col];
    if (capturedPiece) {
      // Demote captured piece and add to hand
      const basePieceType = capturedPiece.promoted ? capturedPiece.type : capturedPiece.type;
      this.capturedPieces[move.player].push(basePieceType);
    }

    // Move the piece
    this.board[move.to.row]![move.to.col] = piece;
    this.board[move.from.row]![move.from.col] = null;

    // Handle promotion
    if (move.promote && this.canPromote(piece, move.from, move.to)) {
      piece.promoted = true;
    }

    // Check if this move puts own king in check (illegal)
    if (this.isInCheck(move.player)) {
      // Undo the move
      this.board[move.from.row]![move.from.col] = piece;
      this.board[move.to.row]![move.to.col] = capturedPiece ?? null;
      if (capturedPiece) {
        this.capturedPieces[move.player].pop();
      }
      if (move.promote) {
        piece.promoted = false;
      }
      return false;
    }

    this.moveHistory.push(move);
    this.currentPlayer = this.currentPlayer === 'sente' ? 'gote' : 'sente';

    return true;
  }

  private isCheckmate(player: 'sente' | 'gote'): boolean {
    if (!this.isInCheck(player)) {
      return false;
    }

    // Try all possible moves to see if any can escape check
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = this.board[row]![col];
        if (piece && piece.player === player) {
          const possibleMoves = this.getPossibleMoves({ row, col });

          for (const move of possibleMoves) {
            // Simulate the move
            const capturedPiece = this.board[move.row]![move.col];
            this.board[move.row]![move.col] = piece;
            this.board[row]![col] = null;

            const stillInCheck = this.isInCheck(player);

            // Undo the move
            this.board[row]![col] = piece;
            this.board[move.row]![move.col] = capturedPiece ?? null;

            if (!stillInCheck) {
              return false; // Found a move that escapes check
            }
          }
        }
      }
    }

    // Check drop moves
    const dropMoves = this.getDropMoves(player, { enforcePawnDropMate: false });
    for (const drop of dropMoves) {
      // Simulate the drop
      this.board[drop.position.row]![drop.position.col] = { type: drop.piece, player };

      const stillInCheck = this.isInCheck(player);

      // Undo the drop
      this.board[drop.position.row]![drop.position.col] = null;

      if (!stillInCheck) {
        return false; // Found a drop that escapes check
      }
    }

    return true; // No moves can escape check
  }

  private getShogiGameState(): ShogiGameState {
    return this.syncCurrentState();
  }

  getValidMoves(): Array<ShogiMove> {
    const moves: Array<ShogiMove> = [];

    // Regular piece moves
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const piece = this.board[row]![col];
        if (piece && piece.player === this.currentPlayer) {
          const possibleMoves = this.getPossibleMoves({ row, col });

          for (const move of possibleMoves) {
            const baseMove: ShogiMove = {
              from: { row, col },
              to: move,
              player: this.currentPlayer,
            };

            // Check if promotion is possible
            if (this.canPromote(piece, { row, col }, move)) {
              if (this.mustPromote(piece, move)) {
                moves.push({ ...baseMove, promote: true });
              } else {
                // Add both promoted and non-promoted options
                moves.push({ ...baseMove, promote: false });
                moves.push({ ...baseMove, promote: true });
              }
            } else {
              moves.push(baseMove);
            }
          }
        }
      }
    }

    // Drop moves
    const dropMoves = this.getDropMoves(this.currentPlayer);
    for (const drop of dropMoves) {
      moves.push({
        from: { row: -1, col: -1 }, // Invalid position for drops
        to: drop.position,
        player: this.currentPlayer,
        drop: drop.piece,
      });
    }

    return moves;
  }

  reset(): void {
    this.board = this.initializeBoard();
    this.currentPlayer = 'sente';
    this.capturedPieces = { sente: [], gote: [] };
    this.moveHistory = [];
    this.history = [];
    this.stateHistory = [];
    this.currentStateIndex = -1;
    this.syncCurrentState();
  }

  getPlayerList(): string[] {
    return ['sente', 'gote'];
  }

  async initializeGame(_config?: GameConfig): Promise<ShogiGameState> {
    this.reset();
    await this.persistState();
    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as ShogiMove;

      if (!move.player || (move.player !== 'sente' && move.player !== 'gote')) {
        return { valid: false, error: 'Invalid player' };
      }

      if (move.player !== this.currentPlayer) {
        return { valid: false, error: 'Not your turn' };
      }

      if (await this.isGameOver()) {
        return { valid: false, error: 'Game is over' };
      }

      if (move.drop) {
        if (!this.isValidPosition(move.to.row, move.to.col)) {
          return { valid: false, error: 'Invalid position' };
        }
        if (!this.capturedPieces[move.player].includes(move.drop)) {
          return { valid: false, error: 'Piece not in hand' };
        }
        if (this.board[move.to.row]![move.to.col] !== null) {
          return { valid: false, error: 'Target square is occupied' };
        }
        if (!this.isLegalDrop(move.drop, move.to, move.player)) {
          return { valid: false, error: 'Illegal drop' };
        }
      } else {
        if (
          !this.isValidPosition(move.from.row, move.from.col) ||
          !this.isValidPosition(move.to.row, move.to.col)
        ) {
          return { valid: false, error: 'Invalid position' };
        }

        const piece = this.board[move.from.row]![move.from.col];
        if (!piece || piece.player !== move.player) {
          return { valid: false, error: 'No piece or wrong player' };
        }

        const possibleMoves = this.getPossibleMoves(move.from);
        if (!possibleMoves.some((pos) => pos.row === move.to.row && pos.col === move.to.col)) {
          return { valid: false, error: 'Invalid move for piece' };
        }
      }

      if (this.wouldLeaveOwnKingInCheck(move)) {
        return { valid: false, error: 'Move would leave king in check' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Move validation failed' };
    }
  }

  async restoreFromDatabase(gameStateData: GameStateData): Promise<void> {
    if (gameStateData.gameId !== this.gameId || gameStateData.gameType !== this.gameType) {
      throw new Error('Game data mismatch');
    }

    this.history = structuredClone(gameStateData.moveHistory || []);
    this.stateHistory = [];
    this.currentStateIndex = -1;
    this.hydrateFromState(structuredClone(gameStateData.gameState as ShogiGameState));
    await this.saveStateSnapshot();
  }

  async isGameOver(): Promise<boolean> {
    const state = this.getShogiGameState();
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.getShogiGameState();
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Shogi',
      description: 'Japanese chess variant with piece promotion and drops',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '30-60 minutes',
      complexity: 'advanced',
      categories: ['strategy', 'board', 'classic', 'japanese'],
    };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const shogiMove = move.moveData as ShogiMove;
    const success = this.makeShogiMove(shogiMove);

    if (!success) {
      throw new Error('Failed to apply move');
    }

    this.syncCurrentState();
  }

  async getGameState(): Promise<ShogiGameState> {
    return this.syncCurrentState();
  }
}

export function createShogiGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): ShogiGame {
  return new ShogiGame(gameId, database);
}





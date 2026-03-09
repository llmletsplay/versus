import { describe, test, expect, beforeEach } from '@jest/globals';
import { ChessGame } from '../src/games/chess.js';

const createEmptyChessBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));

async function restoreChessState(game: ChessGame, state: Record<string, any>): Promise<void> {
  await game.restoreFromDatabase({
    gameId: 'test-chess-game',
    gameType: 'chess',
    moveHistory: state.moveHistory ?? [],
    players: ['white', 'black'],
    status: state.gameOver ? 'completed' : 'active',
    gameState: {
      gameId: 'test-chess-game',
      gameType: 'chess',
      board: createEmptyChessBoard(),
      currentPlayer: 'white',
      gameOver: false,
      winner: null,
      inCheck: false,
      castlingRights: {
        white: { kingside: false, queenside: false },
        black: { kingside: false, queenside: false },
      },
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
      players: ['white', 'black'],
      status: 'active',
      ...state,
    },
  } as any);
}

describe('ChessGame', () => {
  let game: ChessGame;

  beforeEach(() => {
    game = new ChessGame('test-chess-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct starting position', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-chess-game');
      expect(state.gameType).toBe('chess');
      expect(state.currentPlayer).toBe('white');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check initial board setup
      const board = state.board as any[][];

      // Black pieces
      expect(board[0][0]).toEqual({ type: 'rook', color: 'black' });
      expect(board[0][1]).toEqual({ type: 'knight', color: 'black' });
      expect(board[0][2]).toEqual({ type: 'bishop', color: 'black' });
      expect(board[0][3]).toEqual({ type: 'queen', color: 'black' });
      expect(board[0][4]).toEqual({ type: 'king', color: 'black' });
      expect(board[0][7]).toEqual({ type: 'rook', color: 'black' });

      // Black pawns
      for (let col = 0; col < 8; col++) {
        expect(board[1][col]).toEqual({ type: 'pawn', color: 'black' });
      }

      // White pawns
      for (let col = 0; col < 8; col++) {
        expect(board[6][col]).toEqual({ type: 'pawn', color: 'white' });
      }

      // White pieces
      expect(board[7][0]).toEqual({ type: 'rook', color: 'white' });
      expect(board[7][4]).toEqual({ type: 'king', color: 'white' });
      expect(board[7][7]).toEqual({ type: 'rook', color: 'white' });
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Chess');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('advanced');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('classic');
    });
  });

  describe('Basic Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid pawn moves', async () => {
      // Single step forward
      const result1 = await game.validateMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'white',
      });
      expect(result1.valid).toBe(true);

      // Double step from starting position
      const result2 = await game.validateMove({
        from: { row: 6, col: 3 },
        to: { row: 4, col: 3 },
        player: 'white',
      });
      expect(result2.valid).toBe(true);
    });

    test('should reject invalid moves', async () => {
      // Wrong player turn
      const result1 = await game.validateMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain("It's white's turn");

      // No piece at from position
      const result2 = await game.validateMove({
        from: { row: 4, col: 4 },
        to: { row: 5, col: 4 },
        player: 'white',
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('No piece at the from position');

      // Moving opponent's piece
      const result3 = await game.validateMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'white',
      });
      expect(result3.valid).toBe(false);
      expect(result3.error).toContain('You can only move your own pieces');
    });

    test('should reject out of bounds moves', async () => {
      const result = await game.validateMove({
        from: { row: 6, col: 0 },
        to: { row: 8, col: 0 },
        player: 'white',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 7');
    });
  });

  describe('Piece Movement Rules', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate knight moves correctly', async () => {
      // Valid L-shaped move
      const result1 = await game.validateMove({
        from: { row: 7, col: 1 },
        to: { row: 5, col: 2 },
        player: 'white',
      });
      expect(result1.valid).toBe(true);

      // Invalid move for knight
      const result2 = await game.validateMove({
        from: { row: 7, col: 1 },
        to: { row: 5, col: 1 },
        player: 'white',
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('L-shape');
    });

    test('should validate rook moves correctly', async () => {
      // First clear the path by moving pawns
      await game.makeMove({
        from: { row: 6, col: 0 },
        to: { row: 4, col: 0 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 0 },
        to: { row: 3, col: 0 },
        player: 'black',
      });

      // Valid horizontal move
      const result1 = await game.validateMove({
        from: { row: 7, col: 0 },
        to: { row: 5, col: 0 },
        player: 'white',
      });
      expect(result1.valid).toBe(true);
    });

    test('should validate bishop moves correctly', async () => {
      // First clear the path
      await game.makeMove({
        from: { row: 6, col: 3 },
        to: { row: 4, col: 3 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });

      // Valid diagonal move
      const result = await game.validateMove({
        from: { row: 7, col: 2 },
        to: { row: 5, col: 4 },
        player: 'white',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Pawn Special Rules', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow pawn capture diagonally', async () => {
      // Set up capture scenario
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 3 },
        to: { row: 3, col: 3 },
        player: 'black',
      });

      // White pawn captures black pawn
      const result = await game.validateMove({
        from: { row: 4, col: 4 },
        to: { row: 3, col: 3 },
        player: 'white',
      });
      expect(result.valid).toBe(true);
    });

    test('should reject pawn moving backward', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 2, col: 4 },
        player: 'black',
      });

      // Try to move pawn backward
      const result = await game.validateMove({
        from: { row: 5, col: 4 },
        to: { row: 6, col: 4 },
        player: 'white',
      });
      expect(result.valid).toBe(false);
    });

    test('should reject pawn capturing forward', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });

      // Try to capture forward (invalid)
      const result = await game.validateMove({
        from: { row: 4, col: 4 },
        to: { row: 3, col: 4 },
        player: 'white',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot capture forward');
    });
  });

  describe('Check and Checkmate', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect scholar\'s mate as checkmate', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });
      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });
      await game.makeMove({
        from: { row: 7, col: 3 },
        to: { row: 3, col: 7 },
        player: 'white',
      });
      await game.makeMove({
        from: { row: 0, col: 1 },
        to: { row: 2, col: 2 },
        player: 'black',
      });
      await game.makeMove({
        from: { row: 7, col: 5 },
        to: { row: 4, col: 2 },
        player: 'white',
      });
      await game.makeMove({
        from: { row: 0, col: 6 },
        to: { row: 2, col: 5 },
        player: 'black',
      });
      const state = await game.makeMove({
        from: { row: 3, col: 7 },
        to: { row: 1, col: 5 },
        player: 'white',
      });

      expect(state.inCheck).toBe(true);
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('white');
    });

    test('should prevent moves that leave king in check', async () => {
      const board = createEmptyChessBoard();
      board[0][7] = { type: 'king', color: 'black' };
      board[0][4] = { type: 'rook', color: 'black' };
      board[6][4] = { type: 'rook', color: 'white' };
      board[7][4] = { type: 'king', color: 'white' };

      await restoreChessState(game, {
        board,
        currentPlayer: 'white',
      });

      const result = await game.validateMove({
        from: { row: 6, col: 4 },
        to: { row: 6, col: 3 },
        player: 'white',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('leave king in check');
    });
  });

  describe('Castling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow kingside castling when conditions are met', async () => {
      const board = createEmptyChessBoard();
      board[0][4] = { type: 'king', color: 'black' };
      board[7][4] = { type: 'king', color: 'white' };
      board[7][7] = { type: 'rook', color: 'white' };

      await restoreChessState(game, {
        board,
        currentPlayer: 'white',
        castlingRights: {
          white: { kingside: true, queenside: false },
          black: { kingside: false, queenside: false },
        },
      });

      const validation = await game.validateMove({
        from: { row: 7, col: 4 },
        to: { row: 7, col: 6 },
        player: 'white',
      });
      expect(validation.valid).toBe(true);

      const state = await game.makeMove({
        from: { row: 7, col: 4 },
        to: { row: 7, col: 6 },
        player: 'white',
      });
      const boardAfterCastle = state.board as any[][];

      expect(boardAfterCastle[7][6]).toEqual({ type: 'king', color: 'white', hasMoved: true });
      expect(boardAfterCastle[7][5]).toEqual({ type: 'rook', color: 'white', hasMoved: true });
      expect(boardAfterCastle[7][4]).toBeNull();
      expect(boardAfterCastle[7][7]).toBeNull();
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should alternate players correctly', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });

      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('black');

      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });

      state = await game.getGameState();
      expect(state.currentPlayer).toBe('white');
    });

    test('should update board correctly after moves', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });

      const state = await game.getGameState();
      const board = state.board as any[][];

      expect(board[4][4]).toEqual({ type: 'pawn', color: 'white', hasMoved: true });
      expect(board[6][4]).toBeNull();
    });

    test('should handle captures correctly', async () => {
      // Set up a capture
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });

      await game.makeMove({
        from: { row: 1, col: 3 },
        to: { row: 3, col: 3 },
        player: 'black',
      });

      await game.makeMove({
        from: { row: 4, col: 4 },
        to: { row: 3, col: 3 },
        player: 'white',
      });

      const state = await game.getGameState();
      const board = state.board as any[][];

      expect(board[3][3]).toEqual({ type: 'pawn', color: 'white', hasMoved: true });
      expect(board[4][4]).toBeNull();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move must include from, to, and player');
    });

    test('should reject moves after game over', async () => {
      await game.makeMove({
        from: { row: 6, col: 5 },
        to: { row: 5, col: 5 },
        player: 'white',
      });
      await game.makeMove({
        from: { row: 1, col: 4 },
        to: { row: 3, col: 4 },
        player: 'black',
      });
      await game.makeMove({
        from: { row: 6, col: 6 },
        to: { row: 4, col: 6 },
        player: 'white',
      });
      await game.makeMove({
        from: { row: 0, col: 3 },
        to: { row: 4, col: 7 },
        player: 'black',
      });

      const result = await game.validateMove({
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 },
        player: 'white',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already over');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          from: { row: -1, col: 0 },
          to: { row: 0, col: 0 },
          player: 'white',
        })
      ).rejects.toThrow();
    });
  });
});


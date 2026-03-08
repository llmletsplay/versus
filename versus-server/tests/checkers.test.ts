import { describe, test, expect, beforeEach } from '@jest/globals';
import { CheckersGame } from '../src/games/checkers.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('CheckersGame', () => {
  let game: CheckersGame;

  beforeEach(() => {
    game = new CheckersGame('test-checkers-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct starting position', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-checkers-game');
      expect(state.gameType).toBe('checkers');
      expect(state.currentPlayer).toBe('red');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check initial board setup
      const board = state.board as any[][];

      // Black pieces should be on the first 3 rows
      expect(board[0][1]).toEqual({ color: 'black', type: 'man' });
      expect(board[0][3]).toEqual({ color: 'black', type: 'man' });
      expect(board[0][5]).toEqual({ color: 'black', type: 'man' });
      expect(board[0][7]).toEqual({ color: 'black', type: 'man' });

      // Red pieces should be on the last 3 rows
      expect(board[7][0]).toEqual({ color: 'red', type: 'man' });
      expect(board[7][2]).toEqual({ color: 'red', type: 'man' });
      expect(board[7][4]).toEqual({ color: 'red', type: 'man' });
      expect(board[7][6]).toEqual({ color: 'red', type: 'man' });

      // Middle rows should be empty
      expect(board[3][1]).toBeNull();
      expect(board[4][2]).toBeNull();
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Checkers');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('classic');
    });
  });

  describe('Basic Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid diagonal moves', async () => {
      const result = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });
      expect(result.valid).toBe(true);
    });

    test('should reject non-diagonal moves', async () => {
      const result = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 0 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dark squares');
    });

    test('should reject moves to occupied squares', async () => {
      const result = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 6, col: 1 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('occupied');
    });

    test('should reject wrong player moves', async () => {
      const result = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'black',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's red's turn");
    });

    test('should reject moving opponent pieces', async () => {
      const result = await game.validateMove({
        from: { row: 1, col: 0 },
        to: { row: 2, col: 1 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('own pieces');
    });

    test('should reject out of bounds moves', async () => {
      const result = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: -1 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 7');
    });
  });

  describe('Piece Movement Rules', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow regular pieces to move forward only', async () => {
      // Red piece moving forward (up the board, decreasing row numbers)
      const result1 = await game.validateMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });
      expect(result1.valid).toBe(true);

      // Make the move and switch to black
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      // Black piece moving forward (down the board, increasing row numbers)
      const result2 = await game.validateMove({
        from: { row: 2, col: 1 },
        to: { row: 3, col: 2 },
        player: 'black',
      });
      expect(result2.valid).toBe(true);
    });

    test('should reject backward moves for regular pieces', async () => {
      // First move a piece forward to create space
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      // Switch to black player
      await game.makeMove({
        from: { row: 2, col: 1 },
        to: { row: 3, col: 2 },
        player: 'black',
      });

      // Now try to move the red piece backward to the original empty square
      const result = await game.validateMove({
        from: { row: 4, col: 1 },
        to: { row: 5, col: 0 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('forward');
    });
  });

  describe('Jumping Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow capturing opponent pieces', async () => {
      // Set up a capture scenario by moving pieces into position
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      await game.makeMove({
        from: { row: 2, col: 3 },
        to: { row: 3, col: 2 },
        player: 'black',
      });

      // Now red can capture the black piece
      const result = await game.validateMove({
        from: { row: 4, col: 1 },
        to: { row: 2, col: 3 },
        player: 'red',
      });
      expect(result.valid).toBe(true);
    });

  });

  describe('King Promotion', () => {
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should alternate players correctly', async () => {
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('black');

      await game.makeMove({
        from: { row: 2, col: 1 },
        to: { row: 3, col: 2 },
        player: 'black',
      });

      state = await game.getGameState();
      expect(state.currentPlayer).toBe('red');
    });

    test('should update board correctly after moves', async () => {
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      const state = await game.getGameState();
      const board = state.board as any[][];

      expect(board[4][1]).toEqual({ type: 'man', color: 'red' });
      expect(board[5][0]).toBeNull();
    });

    test('should remove captured pieces', async () => {
      // Set up and execute a capture
      await game.makeMove({
        from: { row: 5, col: 0 },
        to: { row: 4, col: 1 },
        player: 'red',
      });

      await game.makeMove({
        from: { row: 2, col: 3 },
        to: { row: 3, col: 2 },
        player: 'black',
      });

      await game.makeMove({
        from: { row: 4, col: 1 },
        to: { row: 2, col: 3 },
        player: 'red',
      });

      const state = await game.getGameState();
      const board = state.board as any[][];

      // The captured piece should be removed
      expect(board[3][2]).toBeNull();
      // The capturing piece should be in the new position
      expect(board[2][3]).toEqual({ type: 'man', color: 'red' });
    });
  });


  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject moves after game over', async () => {
      await restoreGameState(game, { gameOver: true, winner: 'red' });

      const result = await game.validateMove({
        from: { row: 2, col: 1 },
        to: { row: 3, col: 2 },
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('over');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          from: { row: -1, col: 0 },
          to: { row: 0, col: 1 },
          player: 'red',
        })
      ).rejects.toThrow();
    });
  });
});




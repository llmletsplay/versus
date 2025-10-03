import { describe, test, expect, beforeEach } from '@jest/globals';
import { TicTacToeGame } from '../src/games/tic-tac-toe.js';
import { createMockDatabase } from './helpers/gameTestHelpers.js';

describe('TicTacToeGame', () => {
  let game: TicTacToeGame;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = await createMockDatabase();
    game = new TicTacToeGame('test-game', mockDb);
  });

  describe('Game Initialization', () => {
    test('should initialize with empty board and X as first player', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-game');
      expect(state.gameType).toBe('tic-tac-toe');
      expect(state.currentPlayer).toBe('X');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.board).toEqual([
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Tic-Tac-Toe');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('beginner');
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid moves', async () => {
      const result = await game.validateMove({ row: 0, col: 0, player: 'X' });
      expect(result.valid).toBe(true);
    });

    test('should reject moves with invalid coordinates', async () => {
      const result1 = await game.validateMove({ row: -1, col: 0, player: 'X' });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('between 0 and 2');

      const result2 = await game.validateMove({ row: 3, col: 0, player: 'X' });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('between 0 and 2');
    });

    test('should reject moves with invalid player', async () => {
      const result = await game.validateMove({ row: 0, col: 0, player: 'Z' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player must be X or O');
    });

    test('should reject moves when not player turn', async () => {
      const result = await game.validateMove({ row: 0, col: 0, player: 'O' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's X's turn");
    });

    test('should reject moves to occupied cells', async () => {
      // Make first move
      await game.makeMove({ row: 0, col: 0, player: 'X' });

      // Try to move to same cell
      const result = await game.validateMove({ row: 0, col: 0, player: 'O' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already occupied');
    });

    test('should reject moves when game is over', async () => {
      // Create winning condition for X
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 1, col: 0, player: 'O' });
      await game.makeMove({ row: 0, col: 1, player: 'X' });
      await game.makeMove({ row: 1, col: 1, player: 'O' });
      await game.makeMove({ row: 0, col: 2, player: 'X' }); // X wins

      const result = await game.validateMove({ row: 2, col: 0, player: 'O' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already over');
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should alternate players correctly', async () => {
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('O');

      await game.makeMove({ row: 0, col: 1, player: 'O' });
      state = await game.getGameState();
      expect(state.currentPlayer).toBe('X');
    });

    test('should update board correctly', async () => {
      await game.makeMove({ row: 1, col: 1, player: 'X' });
      const state = await game.getGameState();

      expect(state.board[1]![1]).toBe('X');
      expect(state.board[0]![0]).toBeNull();
    });
  });

  describe('Win Conditions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect horizontal win', async () => {
      // X wins top row
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 1, col: 0, player: 'O' });
      await game.makeMove({ row: 0, col: 1, player: 'X' });
      await game.makeMove({ row: 1, col: 1, player: 'O' });
      await game.makeMove({ row: 0, col: 2, player: 'X' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('X');
    });

    test('should detect vertical win', async () => {
      // O wins left column
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 0, col: 1, player: 'O' });
      await game.makeMove({ row: 1, col: 0, player: 'X' });
      await game.makeMove({ row: 1, col: 1, player: 'O' });
      await game.makeMove({ row: 0, col: 2, player: 'X' });
      await game.makeMove({ row: 2, col: 1, player: 'O' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('O');
    });

    test('should detect diagonal win', async () => {
      // X wins main diagonal
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 0, col: 1, player: 'O' });
      await game.makeMove({ row: 1, col: 1, player: 'X' });
      await game.makeMove({ row: 0, col: 2, player: 'O' });
      await game.makeMove({ row: 2, col: 2, player: 'X' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('X');
    });

    test('should detect anti-diagonal win', async () => {
      // O wins anti-diagonal
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 0, col: 2, player: 'O' });
      await game.makeMove({ row: 0, col: 1, player: 'X' });
      await game.makeMove({ row: 1, col: 1, player: 'O' });
      await game.makeMove({ row: 1, col: 0, player: 'X' });
      await game.makeMove({ row: 2, col: 0, player: 'O' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('O');
    });

    test('should detect draw', async () => {
      // Fill board without winner
      await game.makeMove({ row: 0, col: 0, player: 'X' });
      await game.makeMove({ row: 0, col: 1, player: 'O' });
      await game.makeMove({ row: 0, col: 2, player: 'X' });
      await game.makeMove({ row: 1, col: 0, player: 'O' });
      await game.makeMove({ row: 1, col: 1, player: 'X' });
      await game.makeMove({ row: 2, col: 0, player: 'O' });
      await game.makeMove({ row: 1, col: 2, player: 'X' });
      await game.makeMove({ row: 2, col: 2, player: 'O' });
      await game.makeMove({ row: 2, col: 1, player: 'X' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('draw');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Row and col must be numbers');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(game.makeMove({ row: -1, col: 0, player: 'X' })).rejects.toThrow(
        'Row and col must be between 0 and 2'
      );
    });
  });
});

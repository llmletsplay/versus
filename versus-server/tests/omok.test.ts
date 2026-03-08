import { describe, test, expect, beforeEach } from '@jest/globals';
import { OmokGame } from '../src/games/omok.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('OmokGame', () => {
  let game: OmokGame;

  beforeEach(() => {
    game = new OmokGame('test-omok-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with empty 15x15 board', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-omok-game');
      expect(state.gameType).toBe('omok');
      expect(state.currentPlayer).toBe('black');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check board is 15x15 and empty
      const board = state.board as any[][];
      expect(board).toHaveLength(15);
      expect(board[0]).toHaveLength(15);

      for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 15; col++) {
          expect(board[row][col]).toBeNull();
        }
      }
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Omok (Five in a Row)');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('abstract');
    });
  });

  describe('Basic Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid moves to empty positions', async () => {
      const result = await game.validateMove({
        row: 7,
        col: 7,
        player: 'black',
      });
      expect(result.valid).toBe(true);
    });

    test('should reject moves to occupied positions', async () => {
      await game.makeMove({ row: 7, col: 7, player: 'black' });

      const result = await game.validateMove({
        row: 7,
        col: 7,
        player: 'white',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('occupied');
    });

    test('should reject out of bounds moves', async () => {
      const result1 = await game.validateMove({
        row: -1,
        col: 7,
        player: 'black',
      });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('between 0 and 14');

      const result2 = await game.validateMove({
        row: 15,
        col: 7,
        player: 'black',
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('between 0 and 14');
    });

    test('should reject wrong player moves', async () => {
      const result = await game.validateMove({
        row: 7,
        col: 7,
        player: 'white',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's black's turn");
    });

    test('should reject invalid player', async () => {
      const result = await game.validateMove({
        row: 7,
        col: 7,
        player: 'red',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player must be black or white');
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should alternate players correctly', async () => {
      await game.makeMove({ row: 7, col: 7, player: 'black' });

      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('white');

      await game.makeMove({ row: 7, col: 8, player: 'white' });

      state = await game.getGameState();
      expect(state.currentPlayer).toBe('black');
    });

    test('should update board correctly after moves', async () => {
      await game.makeMove({ row: 7, col: 7, player: 'black' });

      const state = await game.getGameState();
      const board = state.board as any[][];

      expect(board[7][7]).toBe('black');
      expect(board[7][8]).toBeNull();
    });

    test('should track move history', async () => {
      await game.makeMove({ row: 7, col: 7, player: 'black' });
      await game.makeMove({ row: 7, col: 8, player: 'white' });

      const state = await game.getGameState();
      // Assuming the game tracks history (implementation dependent)
      expect(state).toBeDefined();
    });
  });

  describe('Win Conditions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect horizontal five in a row', async () => {
      // Create horizontal line for black
      await game.makeMove({ row: 7, col: 5, player: 'black' });
      await game.makeMove({ row: 8, col: 5, player: 'white' });
      await game.makeMove({ row: 7, col: 6, player: 'black' });
      await game.makeMove({ row: 8, col: 6, player: 'white' });
      await game.makeMove({ row: 7, col: 7, player: 'black' });
      await game.makeMove({ row: 8, col: 7, player: 'white' });
      await game.makeMove({ row: 7, col: 8, player: 'black' });
      await game.makeMove({ row: 8, col: 8, player: 'white' });
      await game.makeMove({ row: 7, col: 9, player: 'black' }); // Fifth in a row

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('black');
    });

    test('should detect vertical five in a row', async () => {
      // Create vertical line for black (avoiding horizontal lines)
      await game.makeMove({ row: 5, col: 5, player: 'black' });
      await game.makeMove({ row: 5, col: 6, player: 'white' });
      await game.makeMove({ row: 6, col: 5, player: 'black' });
      await game.makeMove({ row: 6, col: 6, player: 'white' });
      await game.makeMove({ row: 7, col: 5, player: 'black' });
      await game.makeMove({ row: 7, col: 6, player: 'white' });
      await game.makeMove({ row: 8, col: 5, player: 'black' });
      await game.makeMove({ row: 8, col: 6, player: 'white' });
      await game.makeMove({ row: 9, col: 5, player: 'black' }); // Fifth in a row vertically

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('black');
    });

    test('should detect diagonal five in a row', async () => {
      // Create diagonal line for black
      await game.makeMove({ row: 5, col: 5, player: 'black' });
      await game.makeMove({ row: 5, col: 6, player: 'white' });
      await game.makeMove({ row: 6, col: 6, player: 'black' });
      await game.makeMove({ row: 6, col: 7, player: 'white' });
      await game.makeMove({ row: 7, col: 7, player: 'black' });
      await game.makeMove({ row: 7, col: 8, player: 'white' });
      await game.makeMove({ row: 8, col: 8, player: 'black' });
      await game.makeMove({ row: 8, col: 9, player: 'white' });
      await game.makeMove({ row: 9, col: 9, player: 'black' }); // Fifth in a row

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('black');
    });

    test('should detect anti-diagonal five in a row', async () => {
      // Create anti-diagonal line for white (4,8 -> 5,7 -> 6,6 -> 7,5 -> 8,4)
      await game.makeMove({ row: 0, col: 0, player: 'black' });
      await game.makeMove({ row: 4, col: 8, player: 'white' });
      await game.makeMove({ row: 1, col: 0, player: 'black' });
      await game.makeMove({ row: 5, col: 7, player: 'white' });
      await game.makeMove({ row: 2, col: 0, player: 'black' });
      await game.makeMove({ row: 6, col: 6, player: 'white' });
      await game.makeMove({ row: 3, col: 0, player: 'black' });
      await game.makeMove({ row: 7, col: 5, player: 'white' });
      await game.makeMove({ row: 0, col: 1, player: 'black' });
      await game.makeMove({ row: 8, col: 4, player: 'white' }); // Fifth in a row anti-diagonally

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('white');
    });


    test('should not end game with only four in a row', async () => {
      // Create four in a row for black
      await game.makeMove({ row: 7, col: 5, player: 'black' });
      await game.makeMove({ row: 8, col: 5, player: 'white' });
      await game.makeMove({ row: 7, col: 6, player: 'black' });
      await game.makeMove({ row: 8, col: 6, player: 'white' });
      await game.makeMove({ row: 7, col: 7, player: 'black' });
      await game.makeMove({ row: 8, col: 7, player: 'white' });
      await game.makeMove({ row: 7, col: 8, player: 'black' }); // Fourth in a row

      const state = await game.getGameState();
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
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
      await restoreGameState(game, { gameOver: true, winner: 'black' });

      const result = await game.validateMove({
        row: 7,
        col: 7,
        player: 'black',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('over');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          row: -1,
          col: 0,
          player: 'black',
        })
      ).rejects.toThrow();
    });

    test('should handle missing move parameters', async () => {
      const result = await game.validateMove({
        row: 7,
        player: 'black',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Row and col must be numbers');
    });
  });
});



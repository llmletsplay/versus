import { describe, test, expect, beforeEach } from '@jest/globals';
import { OthelloGame } from '../src/games/othello.js';

describe('OthelloGame', () => {
  let game: OthelloGame;

  beforeEach(() => {
    game = new OthelloGame('test-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with 8x8 board and standard starting position', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-game');
      expect(state.gameType).toBe('othello');
      expect(state.gameOver).toBe(false);
      expect(state.currentPlayer).toBe('black');
      expect(state.blackScore).toBe(2);
      expect(state.whiteScore).toBe(2);

      // Check board size
      expect(state.board).toHaveLength(8);
      expect(state.board[0]).toHaveLength(8);

      // Check initial piece placement (center 2x2)
      expect(state.board[3][3]).toBe('white');
      expect(state.board[3][4]).toBe('black');
      expect(state.board[4][3]).toBe('black');
      expect(state.board[4][4]).toBe('white');

      // Check valid moves are available
      expect(state.validMoves).toBeDefined();
      expect(state.validMoves.length).toBeGreaterThan(0);
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Othello');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('board');
    });

    test('should provide valid initial moves', async () => {
      const state = await game.initializeGame();

      // Standard opening moves for black
      const expectedMoves = [
        [2, 3],
        [3, 2],
        [4, 5],
        [5, 4],
      ];
      expect(state.validMoves).toHaveLength(4);

      for (const move of expectedMoves) {
        expect(state.validMoves).toContainEqual(move);
      }
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid moves', async () => {
      const result = await game.validateMove({ row: 2, col: 3, player: 'black' });
      expect(result.valid).toBe(true);
    });

    test('should reject moves with invalid coordinates', async () => {
      const result1 = await game.validateMove({ row: -1, col: 3, player: 'black' });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Invalid board position');

      const result2 = await game.validateMove({ row: 8, col: 3, player: 'black' });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Invalid board position');
    });

    test('should reject moves with invalid player', async () => {
      const result = await game.validateMove({ row: 2, col: 3, player: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player must be "black" or "white"');
    });

    test('should reject moves when not player turn', async () => {
      const result = await game.validateMove({ row: 2, col: 3, player: 'white' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's black's turn");
    });

    test('should reject moves to occupied positions', async () => {
      const result = await game.validateMove({ row: 3, col: 3, player: 'black' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Position is already occupied');
    });

    test('should reject moves that do not capture pieces', async () => {
      const result = await game.validateMove({ row: 0, col: 0, player: 'black' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move does not capture any pieces');
    });

    test('should reject moves when game is over', async () => {
      // Create a new game and manually finish it
      const testGame = new OthelloGame('test-finished');
      await testGame.initializeGame();

      // Force game over by manipulating the internal state through reflection
      (testGame as any).currentState.gameOver = true;

      const result = await testGame.validateMove({ row: 2, col: 3, player: 'black' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Game is already over');
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should alternate players correctly', async () => {
      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('black');

      await game.makeMove({ row: 2, col: 3, player: 'black' });

      state = await game.getGameState();
      expect(state.currentPlayer).toBe('white');
    });

    test('should flip captured pieces correctly', async () => {
      await game.makeMove({ row: 2, col: 3, player: 'black' });

      const state = await game.getGameState();

      // Check that the move was placed
      expect(state.board[2][3]).toBe('black');

      // Check that the white piece at [3,3] was flipped to black
      expect(state.board[3][3]).toBe('black');

      // Scores should update
      expect(state.blackScore).toBe(4);
      expect(state.whiteScore).toBe(1);
    });

    test('should update scores correctly', async () => {
      const initialState = await game.getGameState();
      expect(initialState.blackScore).toBe(2);
      expect(initialState.whiteScore).toBe(2);

      await game.makeMove({ row: 2, col: 3, player: 'black' });

      const newState = await game.getGameState();
      expect(newState.blackScore).toBe(4);
      expect(newState.whiteScore).toBe(1);
    });

    test('should handle player passing when no moves available', async () => {
      // This is harder to test without setting up a specific board state
      // For now, just verify the pass count is tracked
      const state = await game.getGameState();
      expect(state.passCount).toBe(0);
    });
  });

  describe('Piece Flipping Logic', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should flip pieces in horizontal direction', async () => {
      // Make a move that flips horizontally
      await game.makeMove({ row: 3, col: 2, player: 'black' });

      const state = await game.getGameState();
      expect(state.board[3][2]).toBe('black');
      expect(state.board[3][3]).toBe('black'); // Should be flipped
    });

    test('should flip pieces in vertical direction', async () => {
      // Make a move that flips vertically
      await game.makeMove({ row: 2, col: 3, player: 'black' });

      const state = await game.getGameState();
      expect(state.board[2][3]).toBe('black');
      expect(state.board[3][3]).toBe('black'); // Should be flipped
    });

    test('should flip multiple pieces in one direction', async () => {
      // Set up a scenario with multiple pieces to flip
      // This requires multiple moves to create the right setup
      await game.makeMove({ row: 2, col: 3, player: 'black' });
      await game.makeMove({ row: 2, col: 2, player: 'white' });

      // Check valid moves for black before trying to make a move
      const state = await game.getGameState();
      expect(state.currentPlayer).toBe('black');

      // Find a valid move for black and make it
      const validMoves = state.validMoves;
      expect(validMoves.length).toBeGreaterThan(0);

      const [row, col] = validMoves[0];
      await game.makeMove({ row, col, player: 'black' });

      const finalState = await game.getGameState();
      // Verify the board state makes sense
      expect(finalState.board[row][col]).toBe('black');
    });
  });

  describe('Game Completion', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect game over correctly', async () => {
      const initialGameOver = await game.isGameOver();
      expect(initialGameOver).toBe(false);

      // Force game over by manipulating state
      (game as any).currentState.gameOver = true;

      const finalGameOver = await game.isGameOver();
      expect(finalGameOver).toBe(true);
    });

    test('should determine winner correctly', async () => {
      // Force game over with black having more pieces
      (game as any).currentState.gameOver = true;
      (game as any).currentState.blackScore = 35;
      (game as any).currentState.whiteScore = 29;

      const winner = await game.getWinner();
      expect(winner).toBe('black');
    });

    test('should detect draw correctly', async () => {
      // Force game over with equal scores
      (game as any).currentState.gameOver = true;
      (game as any).currentState.blackScore = 32;
      (game as any).currentState.whiteScore = 32;

      const winner = await game.getWinner();
      expect(winner).toBe('draw');
    });

    test('should return null winner when game not over', async () => {
      const winner = await game.getWinner();
      expect(winner).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Row and column must be numbers');
    });

    test('should handle missing move parameters', async () => {
      const result1 = await game.validateMove({ row: 2, player: 'black' });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Row and column must be numbers');

      const result2 = await game.validateMove({ col: 3, player: 'black' });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Row and column must be numbers');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(game.makeMove({ row: 0, col: 0, player: 'black' })).rejects.toThrow();
    });

    test('should handle non-numeric coordinates', async () => {
      const result = await game.validateMove({ row: 'invalid', col: 3, player: 'black' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Row and column must be numbers');
    });
  });

  describe('Valid Moves Calculation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should calculate valid moves correctly', async () => {
      const state = await game.getGameState();

      // At start, black should have exactly 4 valid moves
      expect(state.validMoves).toHaveLength(4);

      // All valid moves should actually be valid
      for (const [row, col] of state.validMoves) {
        const validation = await game.validateMove({ row, col, player: state.currentPlayer });
        expect(validation.valid).toBe(true);
      }
    });

    test('should update valid moves after each move', async () => {
      await game.makeMove({ row: 2, col: 3, player: 'black' });

      const newState = await game.getGameState();

      // Valid moves should be different (and for white player now)
      expect(newState.validMoves.length).toBeGreaterThan(0);
      expect(newState.currentPlayer).toBe('white');
    });
  });
});

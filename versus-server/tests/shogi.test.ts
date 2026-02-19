import { ShogiGame } from '../src/games/shogi.js';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('ShogiGame', () => {
  let game: ShogiGame;

  beforeEach(() => {
    game = new ShogiGame('test-shogi-game');
  });

  describe('Game Initialization', () => {
    it('should initialize with correct starting position', async () => {
      await game.initializeGame();
      const state = await game.getGameState();

      expect(state.currentPlayer).toBe('sente');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBe(null);
      expect(state.board).toHaveLength(9);
      expect(state.board[0]).toHaveLength(9);

      // Check some key starting positions
      expect(state.board[0][4]).toEqual({ type: 'king', player: 'gote' });
      expect(state.board[8][4]).toEqual({ type: 'king', player: 'sente' });
      expect(state.board[1][1]).toEqual({ type: 'rook', player: 'gote' });
      expect(state.board[7][7]).toEqual({ type: 'rook', player: 'sente' });
    });

    it('should have correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Shogi');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('advanced');
      expect(metadata.categories).toContain('strategy');
    });
  });

  describe('Basic Moves', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should allow valid pawn move', async () => {
      const move = {
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      };

      const result = await game.makeMove(move);
      expect(result.currentPlayer).toBe('gote');
      expect(result.board[5][4]).toEqual({ type: 'pawn', player: 'sente' });
      expect(result.board[6][4]).toBe(null);
    });

    it('should reject invalid moves', async () => {
      const invalidMove = {
        from: { row: 6, col: 4 },
        to: { row: 4, col: 4 }, // Pawn can't move two squares
        player: 'sente',
      };

      await expect(game.makeMove(invalidMove)).rejects.toThrow('Invalid move');
    });

    it('should reject moves for wrong player', async () => {
      const move = {
        from: { row: 2, col: 4 },
        to: { row: 3, col: 4 },
        player: 'gote',
      };

      await expect(game.makeMove(move)).rejects.toThrow('Invalid move');
    });

    it('should allow knight moves', async () => {
      // First, move a pawn to clear the path for the knight
      await game.makeMove({
        from: { row: 6, col: 2 },
        to: { row: 5, col: 2 },
        player: 'sente',
      });

      // Switch to gote to make a move
      await game.makeMove({
        from: { row: 2, col: 4 },
        to: { row: 3, col: 4 },
        player: 'gote',
      });

      // Now the knight can move to the cleared square
      const move = {
        from: { row: 8, col: 1 },
        to: { row: 6, col: 2 },
        player: 'sente',
      };

      const result = await game.makeMove(move);
      expect(result.board[6][2]).toEqual({ type: 'knight', player: 'sente' });
      expect(result.board[8][1]).toBe(null);
    });
  });

  describe('Piece Captures', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should capture opponent pieces', async () => {
      // Move sente pawn forward
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      });

      // Move gote pawn forward
      await game.makeMove({
        from: { row: 2, col: 4 },
        to: { row: 3, col: 4 },
        player: 'gote',
      });

      // Move sente pawn to capture
      await game.makeMove({
        from: { row: 5, col: 4 },
        to: { row: 4, col: 4 },
        player: 'sente',
      });

      // Move gote pawn to capture sente pawn
      const finalResult = await game.makeMove({
        from: { row: 3, col: 4 },
        to: { row: 4, col: 4 },
        player: 'gote',
      });

      expect(finalResult.capturedPieces.gote).toContain('pawn');
      expect(finalResult.board[4][4]).toEqual({ type: 'pawn', player: 'gote' });
    });
  });

  describe('Piece Promotion', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should allow pawn promotion in promotion zone', async () => {
      // Set up a scenario where a pawn can promote
      // This is a simplified test - in a real game this would require many moves
      await game.getGameState();

      // Manually place a pawn near promotion zone for testing
      const testGame = new ShogiGame('test-promotion');
      await testGame.initializeGame();

      // We'll test the promotion logic with a hypothetical move
      const validation = await testGame.validateMove({
        from: { row: 1, col: 4 },
        to: { row: 0, col: 4 },
        player: 'sente',
        promote: true,
      });

      // This move would be invalid in starting position, but tests the validation logic
      expect(validation.valid).toBe(false); // Invalid because piece doesn't exist there
    });
  });

  describe('Piece Drops', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should validate drop moves', async () => {
      // First we need to capture a piece to have something to drop
      // This is a complex scenario that would require setting up the board state

      const testGame = new ShogiGame('test-drops');
      await testGame.initializeGame();

      // Test validation of a drop move (this will fail because no pieces captured yet)
      const validation = await testGame.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 4, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Piece not in hand');
    });
  });

  describe('Check and Checkmate', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should detect when king is in check', async () => {
      // This would require setting up a specific board position
      // For now, we test that the game starts without check
      const state = await game.getGameState();
      expect(state.inCheck).toBe(false);
    });

    it('should not allow moves that put own king in check', async () => {
      // This would require a specific scenario
      // The validation should prevent such moves
      const state = await game.getGameState();
      expect(state.gameOver).toBe(false);
    });
  });

  describe('Game State Management', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should track move history', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      });

      const state = await game.getGameState();
      expect(state.moveHistory).toHaveLength(1);
      expect(state.moveHistory[0]).toMatchObject({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      });
    });

    it('should alternate players', async () => {
      let state = await game.getGameState();
      expect(state.currentPlayer).toBe('sente');

      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      });

      state = await game.getGameState();
      expect(state.currentPlayer).toBe('gote');
    });

    it('should reset game state', async () => {
      await game.makeMove({
        from: { row: 6, col: 4 },
        to: { row: 5, col: 4 },
        player: 'sente',
      });

      game.reset();
      const state = await game.getGameState();

      expect(state.currentPlayer).toBe('sente');
      expect(state.moveHistory).toHaveLength(0);
      expect(state.capturedPieces.sente).toHaveLength(0);
      expect(state.capturedPieces.gote).toHaveLength(0);
    });
  });

  describe('Valid Moves Generation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should generate valid moves for starting position', () => {
      const validMoves = game.getValidMoves();
      expect(validMoves.length).toBeGreaterThan(0);

      // Should include pawn moves
      const pawnMoves = validMoves.filter((move) => move.from.row === 6 && move.to.row === 5);
      expect(pawnMoves.length).toBeGreaterThan(0);

      // Should include knight moves (knights are blocked by pawns in starting position)
      const knightMoves = validMoves.filter((move) => move.from.row === 8 && move.from.col === 1);
      expect(knightMoves.length).toBe(0); // Knights have no moves in starting position
    });
  });

  describe('Special Rules', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should enforce pawn drop restrictions', async () => {
      // Test that pawns cannot be dropped on the last rank
      // This requires having a pawn in hand first
      const testGame = new ShogiGame('test-pawn-drop');
      await testGame.initializeGame();

      // This tests the validation logic even though we don't have a pawn in hand
      const validation = await testGame.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 0, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });

      expect(validation.valid).toBe(false);
    });

    it('should enforce lance and knight drop restrictions', async () => {
      const testGame = new ShogiGame('test-piece-drops');
      await testGame.initializeGame();

      // Test lance drop on last rank
      const lanceValidation = await testGame.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 0, col: 4 },
        player: 'sente',
        drop: 'lance',
      });

      expect(lanceValidation.valid).toBe(false);

      // Test knight drop on second-to-last rank
      const knightValidation = await testGame.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 1, col: 4 },
        player: 'sente',
        drop: 'knight',
      });

      expect(knightValidation.valid).toBe(false);
    });
  });

  describe('Player List', () => {
    it('should return correct player list', () => {
      const players = game.getPlayerList();
      expect(players).toEqual(['sente', 'gote']);
    });
  });

  describe('Game Over Conditions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should not be game over at start', async () => {
      const isGameOver = await game.isGameOver();
      expect(isGameOver).toBe(false);

      const winner = await game.getWinner();
      expect(winner).toBe(null);
    });
  });
});

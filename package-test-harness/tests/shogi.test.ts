import { ShogiGame } from '../src/games/shogi.js';
import { describe, it, expect, beforeEach } from '@jest/globals';

const createEmptyShogiBoard = () => Array.from({ length: 9 }, () => Array(9).fill(null));

async function restoreShogiState(game: ShogiGame, state: Record<string, any>): Promise<void> {
  await game.restoreFromDatabase({
    gameId: 'test-shogi-game',
    gameType: 'shogi',
    moveHistory: state.moveHistory ?? [],
    players: ['sente', 'gote'],
    status: state.gameOver ? 'completed' : 'active',
    gameState: {
      gameId: 'test-shogi-game',
      gameType: 'shogi',
      board: createEmptyShogiBoard(),
      currentPlayer: 'sente',
      gameOver: false,
      winner: null,
      capturedPieces: { sente: [], gote: [] },
      moveHistory: [],
      inCheck: false,
      players: ['sente', 'gote'],
      status: 'active',
      ...state,
    },
  } as any);
}

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

      await expect(game.makeMove(move)).rejects.toThrow('Not your turn');
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
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[3][4] = { type: 'pawn', player: 'sente' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
      });

      const validation = await game.validateMove({
        from: { row: 3, col: 4 },
        to: { row: 2, col: 4 },
        player: 'sente',
        promote: true,
      });
      expect(validation.valid).toBe(true);

      const state = await game.makeMove({
        from: { row: 3, col: 4 },
        to: { row: 2, col: 4 },
        player: 'sente',
        promote: true,
      });

      expect(state.board[2][4]).toEqual({ type: 'pawn', player: 'sente', promoted: true });
      expect(state.board[3][4]).toBe(null);
    });
  });

  describe('Piece Drops', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should allow legal drop moves from hand', async () => {
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
        capturedPieces: { sente: ['pawn'], gote: [] },
      });

      const validation = await game.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 4, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });
      expect(validation.valid).toBe(true);

      const state = await game.makeMove({
        from: { row: -1, col: -1 },
        to: { row: 4, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });

      expect(state.board[4][4]).toEqual({ type: 'pawn', player: 'sente' });
      expect(state.capturedPieces.sente).toHaveLength(0);
      expect(state.currentPlayer).toBe('gote');
    });
  });

  describe('Check and Checkmate', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    it('should detect when king is in check', async () => {
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[4][4] = { type: 'rook', player: 'gote' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
      });

      const state = await game.getGameState();
      expect(state.inCheck).toBe(true);
      expect(state.gameOver).toBe(false);
    });

    it('should not allow moves that put own king in check', async () => {
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[4][4] = { type: 'rook', player: 'gote' };
      board[7][4] = { type: 'gold', player: 'sente' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
      });

      const validation = await game.validateMove({
        from: { row: 7, col: 4 },
        to: { row: 7, col: 3 },
        player: 'sente',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('leave king in check');
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
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
        capturedPieces: { sente: ['pawn'], gote: [] },
      });

      const validation = await game.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 0, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Illegal drop');
    });

    it('should reject a pawn drop that gives immediate checkmate', async () => {
      const board = createEmptyShogiBoard();
      board[0][4] = { type: 'king', player: 'gote' };
      board[2][1] = { type: 'bishop', player: 'sente' };
      board[2][4] = { type: 'gold', player: 'sente' };
      board[2][7] = { type: 'bishop', player: 'sente' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
        capturedPieces: { sente: ['pawn'], gote: [] },
      });

      const validation = await game.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 1, col: 4 },
        player: 'sente',
        drop: 'pawn',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Illegal drop');
    });

    it('should enforce lance and knight drop restrictions', async () => {
      const board = createEmptyShogiBoard();
      board[0][8] = { type: 'king', player: 'gote' };
      board[8][4] = { type: 'king', player: 'sente' };

      await restoreShogiState(game, {
        board,
        currentPlayer: 'sente',
        capturedPieces: { sente: ['lance', 'knight'], gote: [] },
      });

      const lanceValidation = await game.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 0, col: 4 },
        player: 'sente',
        drop: 'lance',
      });
      expect(lanceValidation.valid).toBe(false);
      expect(lanceValidation.error).toBe('Illegal drop');

      const knightValidation = await game.validateMove({
        from: { row: -1, col: -1 },
        to: { row: 1, col: 4 },
        player: 'sente',
        drop: 'knight',
      });
      expect(knightValidation.valid).toBe(false);
      expect(knightValidation.error).toBe('Illegal drop');
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




import { describe, test, expect, beforeEach } from '@jest/globals';
import { BaseGame } from '../src/core/base-game.js';
import { InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';
import { TicTacToeGame } from '../src/games/tic-tac-toe.js';
import { ChessGame } from '../src/games/chess.js';

describe('Core Game Engine', () => {
  let mockDb: InMemoryDatabaseProvider;

  beforeEach(async () => {
    mockDb = new InMemoryDatabaseProvider();
    await mockDb.initialize();
  });

  describe('BaseGame', () => {
    test('should initialize with correct gameId and gameType', async () => {
      const game = new TicTacToeGame('test-game', mockDb);
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-game');
      expect(state.gameType).toBe('tic-tac-toe');
      expect(state.gameOver).toBe(false);
    });

    test('should have working metadata', () => {
      const game = new TicTacToeGame('test-game', mockDb);
      const metadata = game.getMetadata();

      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('minPlayers');
      expect(metadata).toHaveProperty('maxPlayers');
    });
  });

  describe('TicTacToeGame', () => {
    test('should initialize with empty 3x3 board', async () => {
      const game = new TicTacToeGame('test-game', mockDb);
      const state = await game.initializeGame();

      expect(state.board).toEqual([
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);
      expect(state.currentPlayer).toBe('X');
    });

    test('should handle basic moves', async () => {
      const game = new TicTacToeGame('test-game', mockDb);
      await game.initializeGame();

      const result = await game.validateMove({ row: 0, col: 0, player: 'X' });
      expect(result.valid).toBe(true);

      await game.makeMove({ row: 0, col: 0, player: 'X' });
      const state = await game.getGameState();
      expect(state.board[0][0]).toBe('X');
      expect(state.currentPlayer).toBe('O');
    });

    test('should detect wins', async () => {
      const game = new TicTacToeGame('test-game', mockDb);
      await game.initializeGame();

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
  });

  describe('ChessGame', () => {
    test('should initialize with correct piece placement', async () => {
      const game = new ChessGame('test-chess', mockDb);
      const state = await game.initializeGame();

      expect(state.board).toHaveLength(8);
      expect(state.board[0]).toHaveLength(8);
      expect(state.currentPlayer).toBe('white');

      // Check black rook in corner
      expect(state.board[0][0]).toEqual({ type: 'rook', color: 'black' });
      // Check white rook in corner
      expect(state.board[7][0]).toEqual({ type: 'rook', color: 'white' });
    });

    test('should have working metadata', () => {
      const game = new ChessGame('test-chess', mockDb);
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Chess');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
    });
  });
});

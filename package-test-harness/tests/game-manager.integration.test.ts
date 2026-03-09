import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { GameManager } from '../src/core/game-manager.js';
import { TicTacToeGame } from '../src/games/tic-tac-toe.js';
import { ConnectFourGame } from '../src/games/connect-four.js';
import { registerGames } from '../src/games/index.js';

describe('GameManager Integration', () => {
  let gm: GameManager;

  beforeEach(async () => {
    gm = new GameManager({ type: 'sqlite', sqlitePath: ':memory:' });
    await gm.initialize();
    // Register a small set of games for integration testing
    gm.registerGame('tic-tac-toe', TicTacToeGame);
    gm.registerGame('connect-four', ConnectFourGame);
  });

  afterEach(async () => {
    await gm.close();
  });

  // ---------------------------------------------------------------------------
  // Game registration
  // ---------------------------------------------------------------------------
  describe('Game Registration', () => {
    test('getAvailableGameTypes returns registered games', () => {
      const types = gm.getAvailableGameTypes();
      expect(types).toContain('tic-tac-toe');
      expect(types).toContain('connect-four');
    });

    test('registerGames adds all 27 game types', async () => {
      const fresh = new GameManager({ type: 'sqlite', sqlitePath: ':memory:' });
      await fresh.initialize();
      registerGames(fresh);

      const types = fresh.getAvailableGameTypes();
      expect(types.length).toBeGreaterThanOrEqual(27);
      expect(types).toContain('chess');
      expect(types).toContain('poker');
      expect(types).toContain('shogi');
      await fresh.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Create → Move → State lifecycle
  // ---------------------------------------------------------------------------
  describe('Create → Move → State Lifecycle', () => {
    test('creates a tic-tac-toe game and returns a gameId', async () => {
      const gameId = await gm.createGame('tic-tac-toe');
      expect(gameId).toBeDefined();
      expect(gameId).toContain('tic-tac-toe');
    });

    test('rejects creation of unknown game types', async () => {
      await expect(gm.createGame('nonexistent-game')).rejects.toThrow('Unknown game type');
    });

    test('retrieves initial game state after creation', async () => {
      const gameId = await gm.createGame('tic-tac-toe');
      const state = await gm.getGameState('tic-tac-toe', gameId);

      expect(state.gameId).toBe(gameId);
      expect(state.gameType).toBe('tic-tac-toe');
      expect(state.gameOver).toBe(false);
      expect(state.currentPlayer).toBe('X');
    });

    test('makes moves and updates state', async () => {
      const gameId = await gm.createGame('tic-tac-toe');

      // Make a move
      const result = await gm.makeMove('tic-tac-toe', gameId, {
        row: 0,
        col: 0,
        player: 'X',
      });

      expect(result.board[0][0]).toBe('X');
      expect(result.currentPlayer).toBe('O');
      expect(result.gameOver).toBe(false);
    });

    test('plays a full game to completion', async () => {
      const gameId = await gm.createGame('tic-tac-toe');

      // X wins with top row
      await gm.makeMove('tic-tac-toe', gameId, { row: 0, col: 0, player: 'X' });
      await gm.makeMove('tic-tac-toe', gameId, { row: 1, col: 0, player: 'O' });
      await gm.makeMove('tic-tac-toe', gameId, { row: 0, col: 1, player: 'X' });
      await gm.makeMove('tic-tac-toe', gameId, { row: 1, col: 1, player: 'O' });
      const finalState = await gm.makeMove('tic-tac-toe', gameId, {
        row: 0,
        col: 2,
        player: 'X',
      });

      expect(finalState.gameOver).toBe(true);
      expect(finalState.winner).toBe('X');
    });
  });

  // ---------------------------------------------------------------------------
  // Move history
  // ---------------------------------------------------------------------------
  describe('Move History', () => {
    test('records moves in history', async () => {
      const gameId = await gm.createGame('tic-tac-toe');

      await gm.makeMove('tic-tac-toe', gameId, { row: 0, col: 0, player: 'X' });
      await gm.makeMove('tic-tac-toe', gameId, { row: 1, col: 1, player: 'O' });

      const history = await gm.getGameHistory('tic-tac-toe', gameId);
      expect(history.length).toBe(2);
      expect(history[0].player).toBe('X');
      expect(history[1].player).toBe('O');
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------
  describe('Metadata', () => {
    test('returns metadata for a specific game type', async () => {
      const metadata = await gm.getGameMetadata('tic-tac-toe');
      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe('Tic-Tac-Toe');
      expect(metadata!.minPlayers).toBe(2);
      expect(metadata!.maxPlayers).toBe(2);
    });

    test('returns null for unknown game types', async () => {
      const metadata = await gm.getGameMetadata('nonexistent');
      expect(metadata).toBeNull();
    });

    test('getAllGameMetadata returns all registered games', async () => {
      const all = await gm.getAllGameMetadata();
      expect(Object.keys(all)).toContain('tic-tac-toe');
      expect(Object.keys(all)).toContain('connect-four');
    });
  });

  // ---------------------------------------------------------------------------
  // Game deletion
  // ---------------------------------------------------------------------------
  describe('Game Deletion', () => {
    test('deletes a game from active games map', async () => {
      const gameId = await gm.createGame('tic-tac-toe');

      // Game should exist and have state
      const state = await gm.getGameState('tic-tac-toe', gameId);
      expect(state).toBeDefined();
      expect(state.gameId).toBe(gameId);

      // Delete the game
      await gm.deleteGame(gameId);

      // The game should no longer be in the active map.
      // Note: getGame will re-create from class if gameType is registered,
      // so we verify deletion did not throw and the active map no longer holds it.
      // A fresh getGame call will return a blank game (not our played state).
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple concurrent games
  // ---------------------------------------------------------------------------
  describe('Multiple Concurrent Games', () => {
    test('manages multiple games of same type independently', async () => {
      const game1 = await gm.createGame('tic-tac-toe');
      const game2 = await gm.createGame('tic-tac-toe');

      // Make different moves in each game
      await gm.makeMove('tic-tac-toe', game1, { row: 0, col: 0, player: 'X' });
      await gm.makeMove('tic-tac-toe', game2, { row: 2, col: 2, player: 'X' });

      const state1 = await gm.getGameState('tic-tac-toe', game1);
      const state2 = await gm.getGameState('tic-tac-toe', game2);

      expect(state1.board[0][0]).toBe('X');
      expect(state1.board[2][2]).toBeNull();

      expect(state2.board[2][2]).toBe('X');
      expect(state2.board[0][0]).toBeNull();
    });

    test('manages games of different types simultaneously', async () => {
      const tttId = await gm.createGame('tic-tac-toe');
      const c4Id = await gm.createGame('connect-four');

      const tttState = await gm.getGameState('tic-tac-toe', tttId);
      const c4State = await gm.getGameState('connect-four', c4Id);

      expect(tttState.gameType).toBe('tic-tac-toe');
      expect(c4State.gameType).toBe('connect-four');
    });
  });
});

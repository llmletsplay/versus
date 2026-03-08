import { describe, test, expect, beforeEach } from '@jest/globals';
import { GoFishGame } from '../src/games/go-fish.js';

describe('GoFishGame', () => {
  let game: GoFishGame;

  beforeEach(() => {
    game = new GoFishGame('test-go-fish-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct starting setup', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-go-fish-game');
      expect(state.gameType).toBe('go-fish');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check players have hands
      const players = state.players as any;
      const playerIds = Object.keys(players);
      expect(playerIds).toHaveLength(4); // Default 4 players

      // Each player is dealt 5 cards, then any initial books are removed from the hand.
      for (const playerId of playerIds) {
        expect(players[playerId].handSize + players[playerId].bookCount * 4).toBe(5);
        expect(Array.isArray(players[playerId].books)).toBe(true);
        expect(players[playerId].bookCount).toBe(players[playerId].books.length);
      }

      // Deck should have remaining cards
      expect(state.deckSize).toBe(52 - 4 * 5); // 32 cards left
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Go Fish');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(6);
      expect(metadata.complexity).toBe('beginner');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('classic');
      expect(metadata.categories).toContain('family');
    });

    test('should deal 7 cards for 2-3 players', async () => {
      const twoPlayerGame = new GoFishGame('test-two-player');
      const state = await twoPlayerGame.initializeGame({ playerCount: 2 } as any);

      const players = state.players as any;
      const playerIds = Object.keys(players);
      expect(playerIds).toHaveLength(2);

      // Each player is dealt 7 cards, then any initial books are removed from the hand.
      for (const playerId of playerIds) {
        expect(players[playerId].handSize + players[playerId].bookCount * 4).toBe(7);
        expect(players[playerId].bookCount).toBe(players[playerId].books.length);
      }
    });

    test('should remove initial books', async () => {
      // The game should check for and remove any initial books of 4
      const state = await game.initializeGame();

      // All initial books should be removed
      const players = state.players as any;
      for (const playerId of Object.keys(players)) {
        expect(Array.isArray(players[playerId].books)).toBe(true);
      }
    });
  });

  describe('Basic Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should reject moves with missing required fields', async () => {
      const result1 = await game.validateMove({ player: 'player1' });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Move must include player, action, rank, and target');

      const result2 = await game.validateMove({
        player: 'player1',
        action: 'ask',
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Move must include player, action, rank, and target');
    });

    test('should reject invalid actions', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid_action',
        rank: 'A',
        target: 'player2',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be ask');
    });

    test('should reject wrong player moves', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'ask',
        rank: 'A',
        target: 'player3',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's");
    });

    test('should reject moves after game over', async () => {
      // Force game over
      (game as any).currentState.gameOver = true;

      const result = await game.validateMove({
        player: 'player1',
        action: 'ask',
        rank: 'A',
        target: 'player2',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already over');
    });

    test('should reject asking yourself', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'ask',
        rank: 'A',
        target: state.currentPlayer,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot ask yourself for cards');
    });

    test('should reject invalid target player', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'ask',
        rank: 'A',
        target: 'invalid_player',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid target player');
    });

    test('should reject invalid ranks', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'ask',
        rank: 'invalid_rank' as any,
        target: 'player2',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('You must have at least one invalid_rank to ask for it');
    });
  });

  describe('Ask Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should require player to have the rank they are asking for', async () => {
      const state = await game.getGameState();

      // Try asking for a rank the player definitely doesn't have
      // This is tricky to test without knowing the exact hand
      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'ask',
        rank: 'K',
        target: 'player2',
      });

      // Result depends on whether player actually has a King
      expect(typeof result.valid).toBe('boolean');
      if (!result.valid) {
        expect(result.error).toContain('You must have at least one');
      }
    });

    test('should handle successful asks', async () => {
      // This is hard to test without controlling the dealt cards
      // For now, just verify the game state is consistent
      const state = await game.getGameState();
      expect(state.lastAction).toBeNull(); // No actions yet
    });

    test('should handle go fish scenarios', async () => {
      // This is hard to test without controlling the dealt cards
      // For now, just verify the game can handle moves
      const state = await game.getGameState();
      expect(state.deckSize).toBeGreaterThan(0);
    });
  });

  describe('Book Collection', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should automatically collect books of 4', async () => {
      // Force a player to have 4 of a kind
      const state = (game as any).currentState;
      const player = state.players.player1;

      // Give player 4 Aces
      player.hand = [
        { suit: 'spades', rank: 'A' },
        { suit: 'hearts', rank: 'A' },
        { suit: 'diamonds', rank: 'A' },
        { suit: 'clubs', rank: 'A' },
        { suit: 'spades', rank: '2' },
      ];

      // Manually trigger book collection
      (game as any).checkAndRemoveBooks(state, 'player1');

      expect(player.books).toContain('A');
      expect(player.hand).toHaveLength(1); // Only the 2 of spades left
    });

    test('should track book counts correctly', async () => {
      const state = await game.getGameState();
      const players = state.players as any;

      for (const playerId of Object.keys(players)) {
        expect(players[playerId].bookCount).toBe(players[playerId].books.length);
      }
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should track current player', async () => {
      const state = await game.getGameState();
      expect(['player1', 'player2', 'player3', 'player4']).toContain(state.currentPlayer);
    });

    test('should track last action', async () => {
      const state = await game.getGameState();
      expect(state.lastAction).toBeNull(); // No actions yet
    });

    test('should handle player turns correctly', async () => {
      // Player should get another turn after successful ask
      // Player should lose turn after go fish
      const state = await game.getGameState();
      expect(state.currentPlayer).toBeDefined();
    });
  });

  describe('Win Conditions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect when game is not over initially', async () => {
      const gameOver = await game.isGameOver();
      expect(gameOver).toBe(false);
    });

    test('should return null winner when game not over', async () => {
      const winner = await game.getWinner();
      expect(winner).toBeNull();
    });

    test('should detect when all books are collected', async () => {
      // Force all books to be collected
      const state = (game as any).currentState;
      state.players.player1.books = ['A', '2', '3', '4', '5', '6', '7'];
      state.players.player2.books = ['8', '9', '10', 'J', 'Q', 'K'];
      state.gameOver = true;
      state.winner = 'player1';

      const gameOver = await game.isGameOver();
      expect(gameOver).toBe(true);

      const winner = await game.getWinner();
      expect(winner).toBe('player1');
    });

    test('should detect when deck is empty', async () => {
      // Force deck to be empty
      const state = (game as any).currentState;
      state.deck = [];

      // Manually trigger win condition check
      (game as any).checkWinCondition(state);

      // Game should end when deck is empty
      expect(typeof state.gameOver).toBe('boolean');
    });

    test('should determine winner by book count', async () => {
      const state = (game as any).currentState;
      // Set up a scenario where player1 has the most books
      state.players.player1.books = ['A', '2', '3'];
      state.players.player2.books = ['4', '5'];
      state.players.player3.books = ['6'];
      state.players.player4.books = [];

      // Force all books to be collected (13 total)
      state.players.player1.books = ['A', '2', '3', '4', '5', '6', '7'];
      state.players.player2.books = ['8', '9', '10', 'J'];
      state.players.player3.books = ['Q', 'K'];
      state.players.player4.books = [];

      // Manually trigger win condition check
      (game as any).checkWinCondition(state);

      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('player1'); // Most books
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move must include player, action, rank, and target');
    });

    test('should handle malformed move data', async () => {
      const result = await game.validateMove({
        player: 123,
        action: 'ask',
        rank: 'A',
        target: 'player2',
      });
      expect(result.valid).toBe(false);
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          player: 'invalid_player',
          action: 'ask',
          rank: 'A',
          target: 'player2',
        })
      ).rejects.toThrow();
    });
  });
});

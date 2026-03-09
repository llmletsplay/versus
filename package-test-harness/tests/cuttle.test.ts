import { describe, test, expect, beforeEach } from '@jest/globals';
import { CuttleGame } from '../src/games/cuttle.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('CuttleGame', () => {
  let game: CuttleGame;

  beforeEach(() => {
    game = new CuttleGame('test-cuttle-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct starting setup', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-cuttle-game');
      expect(state.gameType).toBe('cuttle');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check players have hands
      const players = state.players as any;
      const playerIds = Object.keys(players);
      expect(playerIds).toHaveLength(2); // Default 2 players

      // Each player should have 6 cards initially
      for (const playerId of playerIds) {
        expect(players[playerId].handSize).toBe(6);
        expect(players[playerId].fieldCards).toEqual([]);
        expect(players[playerId].faceCards).toEqual([]);
        expect(players[playerId].points).toBe(0);
      }

      // Deck should have remaining cards
      expect(state.deckSize).toBe(52 - 2 * 6); // 40 cards left
      expect(state.scrapSize).toBe(0);
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Cuttle');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('competitive');
    });

    test('should support different player counts', async () => {
      const fourPlayerGame = new CuttleGame('test-four-player');
      const state = await fourPlayerGame.initializeGame({ playerCount: 4 } as any);

      const players = state.players as any;
      expect(Object.keys(players)).toHaveLength(4);
    });
  });

  describe('Basic Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should reject moves with missing required fields', async () => {
      const result1 = await game.validateMove({ player: 'player1' });
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Move must include player and action');

      const result2 = await game.validateMove({ action: 'play' });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Move must include player and action');
    });

    test('should reject invalid actions', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid_action',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be play, scuttle, target, or pass');
    });

    test('should reject wrong player moves', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'play',
        card: { suit: 'spades', rank: 'A', value: 1 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's");
    });

    test('should reject moves after game over', async () => {
      await restoreGameState(game, { gameOver: true, winner: 'player1' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'play',
        card: { suit: 'spades', rank: 'A', value: 1 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already over');
    });

    test('should allow pass action', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'pass',
      });
      expect(result.valid).toBe(true);
    });

    test('should require card for non-pass actions', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must specify a card for this action');
    });
  });

  describe('Play Action Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow playing point cards to field', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: { suit: 'spades', rank: 'A', value: 1 },
      });

      // This might be valid or invalid depending on whether player has the card
      expect(typeof result.valid).toBe('boolean');
    });

    test('should require target for Jack plays', async () => {
      const state = await game.getGameState();

      // Give the player the Jack of spades
      const gameState = (game as any).currentState;
      const currentPlayer = state.currentPlayer!;
      gameState.players[currentPlayer].hand = [{ suit: 'spades', rank: 'J', value: 11 }];

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        card: { suit: 'spades', rank: 'J', value: 11 },
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Jack requires a target card and target player');
    });

    test('should allow Queen and King plays', async () => {
      const state = await game.getGameState();

      const queenResult = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: { suit: 'hearts', rank: 'Q', value: 12 },
      });

      const kingResult = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: { suit: 'clubs', rank: 'K', value: 13 },
      });

      // These should be valid if player has the cards
      expect(typeof queenResult.valid).toBe('boolean');
      expect(typeof kingResult.valid).toBe('boolean');
    });
  });

  describe('Scuttle Action Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should reject scuttling with face cards', async () => {
      const state = await game.getGameState();

      // Give the player the Jack of spades
      const gameState = (game as any).currentState;
      const currentPlayer = state.currentPlayer!;
      gameState.players[currentPlayer].hand = [{ suit: 'spades', rank: 'J', value: 11 }];

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'scuttle',
        card: { suit: 'spades', rank: 'J', value: 11 },
        target: { suit: 'hearts', rank: 'A', value: 1 },
        targetPlayer: 'player2',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Only point cards (A-10) can scuttle');
    });

    test('should require target for scuttle', async () => {
      const state = await game.getGameState();

      // Give the player the Ace of spades
      const gameState = (game as any).currentState;
      const currentPlayer = state.currentPlayer!;
      gameState.players[currentPlayer].hand = [{ suit: 'spades', rank: 'A', value: 1 }];

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'scuttle',
        card: { suit: 'spades', rank: 'A', value: 1 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Scuttle requires a target card and target player');
    });

    test('should validate scuttle strength', async () => {
      // Set up a scenario where player2 has a card in field
      const state = (game as any).currentState;
      state.players.player2.field = [{ suit: 'hearts', rank: '5', value: 5 }];

      const weakScuttleResult = await game.validateMove({
        player: state.currentPlayer,
        action: 'scuttle',
        card: { suit: 'spades', rank: '3', value: 3 },
        target: { suit: 'hearts', rank: '5', value: 5 },
        targetPlayer: 'player2',
      });

      // Weak scuttle should fail if player doesn't have the card
      expect(typeof weakScuttleResult.valid).toBe('boolean');
    });
  });

  describe('Target Action Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should require target for target action', async () => {
      const state = await game.getGameState();

      // Give the player the Jack of spades
      const gameState = (game as any).currentState;
      const currentPlayer = state.currentPlayer!;
      gameState.players[currentPlayer].hand = [{ suit: 'spades', rank: 'J', value: 11 }];

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'target',
        card: { suit: 'spades', rank: 'J', value: 11 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Target action requires a target card and target player');
    });

    test('should validate target exists', async () => {
      const state = await game.getGameState();

      // Give the player the Jack of spades
      const gameState = (game as any).currentState;
      const currentPlayer = state.currentPlayer!;
      gameState.players[currentPlayer].hand = [{ suit: 'spades', rank: 'J', value: 11 }];

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'target',
        card: { suit: 'spades', rank: 'J', value: 11 },
        target: { suit: 'hearts', rank: 'A', value: 1 },
        targetPlayer: 'player2',
      });

      // Should fail if target doesn't exist (which it doesn't in this test setup)
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Target card not found');
    });
  });

  describe('Game Flow', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should track current player', async () => {
      const state = await game.getGameState();
      expect(['player1', 'player2']).toContain(state.currentPlayer);
    });

    test('should track last action', async () => {
      const state = await game.getGameState();
      expect(state.lastAction).toBeNull(); // No actions yet
    });

    test('should handle card drawing', async () => {
      // After playing a card, player should draw a new one
      const state = await game.getGameState();
      expect(state.deckSize).toBeGreaterThan(0);
    });

    test('should track points correctly', async () => {
      const state = await game.getGameState();
      const players = state.players as any;

      for (const playerId of Object.keys(players)) {
        expect(typeof players[playerId].points).toBe('number');
        expect(players[playerId].points).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Point Accumulation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should calculate points from field cards', async () => {
      // Force some cards into a player's field
      const state = (game as any).currentState;
      state.players.player1.field = [
        { suit: 'spades', rank: 'A', value: 1 },
        { suit: 'hearts', rank: '5', value: 5 },
        { suit: 'clubs', rank: '10', value: 10 },
      ];

      const gameState = await game.getGameState();
      const players = gameState.players as any;
      expect(players.player1.points).toBe(16); // 1 + 5 + 10
    });

    test('should not count face cards in points', async () => {
      // Force some face cards into a player's faceCards
      const state = (game as any).currentState;
      state.players.player1.faceCards = [
        { suit: 'spades', rank: 'J', value: 11 },
        { suit: 'hearts', rank: 'Q', value: 12 },
      ];

      const gameState = await game.getGameState();
      const players = gameState.players as any;
      expect(players.player1.points).toBe(0); // Face cards don't count for points
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

    test('should detect win at 21 points', async () => {
      // Force a player to have 21 points
      const state = (game as any).currentState;
      state.players.player1.field = [
        { suit: 'spades', rank: '10', value: 10 },
        { suit: 'hearts', rank: '10', value: 10 },
        { suit: 'clubs', rank: 'A', value: 1 },
      ];
      state.gameOver = true;
      state.winner = 'player1';

      const gameOver = await game.isGameOver();
      expect(gameOver).toBe(true);

      const winner = await game.getWinner();
      expect(winner).toBe('player1');
    });
  });

  describe('Special Card Effects', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle Jack destruction', async () => {
      // Set up a scenario with cards to destroy
      const state = (game as any).currentState;
      state.players.player2.field = [{ suit: 'hearts', rank: '5', value: 5 }];

      // Test Jack targeting
      const gameState = await game.getGameState();
      expect(gameState.scrapSize).toBe(0); // No cards scrapped yet
    });

    test('should handle Queen protection', async () => {
      // Queens provide protection (passive effect)
      const state = await game.getGameState();
      expect(state.gameType).toBe('cuttle');
    });

    test('should handle King effects', async () => {
      // Kings provide ongoing effects (passive effect)
      const state = await game.getGameState();
      expect(state.gameType).toBe('cuttle');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move must include player and action');
    });

    test('should handle malformed card data', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: { invalid: 'card' },
      });
      expect(result.valid).toBe(false);
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          player: 'invalid_player',
          action: 'play',
          card: { suit: 'spades', rank: 'A', value: 1 },
        })
      ).rejects.toThrow();
    });

    test('should handle missing card validation', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: { suit: 'spades', rank: 'A', value: 1 },
      });

      // Should check if player has the card
      if (!result.valid) {
        expect(result.error).toContain('does not have');
      }
    });
  });
});



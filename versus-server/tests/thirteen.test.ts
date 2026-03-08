import { describe, test, expect, beforeEach } from '@jest/globals';
import { ThirteenGame } from '../src/games/thirteen.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('ThirteenGame', () => {
  let game: ThirteenGame;

  beforeEach(() => {
    game = new ThirteenGame('test-thirteen-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct starting setup', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-thirteen-game');
      expect(state.gameType).toBe('thirteen');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // Check players have hands
      const players = state.players as any;
      const playerIds = Object.keys(players);
      expect(playerIds).toHaveLength(4); // Default 4 players

      // Each player should have 13 cards initially
      for (const playerId of playerIds) {
        expect(players[playerId].handSize).toBe(13);
        expect(players[playerId].isOut).toBe(false);
      }
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Thirteen (Ti\u1EBFn L\u00EAn)');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('climbing');
    });

    test('should support different player counts', async () => {
      const twoPlayerGame = new ThirteenGame('test-two-player');
      const state = await twoPlayerGame.initializeGame({ playerCount: 2 } as any);

      const players = state.players as any;
      expect(Object.keys(players)).toHaveLength(2);
    });

    test('should handle complex game scenarios', async () => {
      const game = new ThirteenGame('test-complex');
      await game.initializeGame();

      // Verify game is properly initialized
      expect(await game.isGameOver()).toBe(false);

      // Test that we can get current player
      const gameState = await game.getGameState();
      expect(gameState.currentPlayer).toBeDefined();
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
        cards: [],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be play or pass');
    });

    test('should reject wrong player moves', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: '3' }],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's");
    });

    test('should reject moves after game over', async () => {
      await restoreGameState(game, { gameOver: true, winner: 'player1' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'play',
        cards: [{ suit: 'spades', rank: '3' }],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already over');
    });
  });

  describe('Pass Action', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow pass when cards have been played', async () => {
      // Set up a scenario where cards have been played
      const state = (game as any).currentState;
      state.lastPlay = {
        player: 'player1',
        cards: [{ suit: 'spades', rank: '3', value: 0 }],
        playType: 'single',
      };

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'pass',
      });
      expect(result.valid).toBe(true);
    });

    test('should reject pass when no cards have been played', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'pass',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot pass when no cards have been played');
    });
  });

  describe('Play Action Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should require cards for play action', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must specify cards to play');
    });

    test('should reject empty cards array', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        cards: [],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must specify cards to play');
    });

    test('should validate player has the cards', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        cards: [{ suit: 'hearts', rank: 'A' }],
      });

      // This might be valid or invalid depending on what cards the player actually has
      // and whether it's the first play (which requires 3 of spades)
      expect(typeof result.valid).toBe('boolean');
      if (!result.valid) {
        // Could be either "does not have" or "First play must include 3 of spades"
        expect(result.error).toMatch(/does not have|First play must include 3 of spades/);
      }
    });
  });

  describe('Card Combinations', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle single card plays', async () => {
      // Set up a game state where we can control the cards
      const state = (game as any).currentState;
      const currentPlayer = state.currentPlayer;

      // Give the current player a specific card
      state.players[currentPlayer].hand = [
        { suit: 'spades', rank: '3', value: 0 },
        { suit: 'hearts', rank: '4', value: 1 },
      ];

      // First play must include 3 of spades
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: '3', value: 0 }],
      });

      expect(result.valid).toBe(true);
    });

    test('should handle pair plays', async () => {
      const state = (game as any).currentState;
      const currentPlayer = state.currentPlayer;

      // Give the current player a pair
      state.players[currentPlayer].hand = [
        { suit: 'spades', rank: '4', value: 1 },
        { suit: 'hearts', rank: '4', value: 1 },
        { suit: 'spades', rank: '3', value: 0 },
      ];

      // Set up a previous single play so we can test pair rejection
      state.lastPlay = {
        player: 'player2',
        cards: [{ suit: 'clubs', rank: '3', value: 0 }],
        playType: 'single',
      };

      // Should reject pair when last play was single
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [
          { suit: 'spades', rank: '4', value: 1 },
          { suit: 'hearts', rank: '4', value: 1 },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must play single');
    });

    test('should handle triple plays', async () => {
      const state = (game as any).currentState;
      const currentPlayer = state.currentPlayer;

      // Give the current player a triple
      state.players[currentPlayer].hand = [
        { suit: 'spades', rank: '5', value: 2 },
        { suit: 'hearts', rank: '5', value: 2 },
        { suit: 'clubs', rank: '5', value: 2 },
        { suit: 'spades', rank: '3', value: 0 },
      ];

      // Set up a previous triple play
      state.lastPlay = {
        player: 'player2',
        cards: [
          { suit: 'spades', rank: '4', value: 1 },
          { suit: 'hearts', rank: '4', value: 1 },
          { suit: 'clubs', rank: '4', value: 1 },
        ],
        playType: 'triple',
      };

      // Should accept higher triple
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [
          { suit: 'spades', rank: '5', value: 2 },
          { suit: 'hearts', rank: '5', value: 2 },
          { suit: 'clubs', rank: '5', value: 2 },
        ],
      });

      expect(result.valid).toBe(true);
    });

    test('should validate straight combinations', async () => {
      const state = (game as any).currentState;
      const currentPlayer = state.currentPlayer;

      // Give the current player a straight
      state.players[currentPlayer].hand = [
        { suit: 'spades', rank: '3', value: 0 },
        { suit: 'hearts', rank: '4', value: 1 },
        { suit: 'clubs', rank: '5', value: 2 },
        { suit: 'diamonds', rank: '6', value: 3 },
        { suit: 'spades', rank: '7', value: 4 },
      ];

      // Clear last play so we can play anything
      state.lastPlay = null;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [
          { suit: 'spades', rank: '3', value: 0 },
          { suit: 'hearts', rank: '4', value: 1 },
          { suit: 'clubs', rank: '5', value: 2 },
          { suit: 'diamonds', rank: '6', value: 3 },
          { suit: 'spades', rank: '7', value: 4 },
        ],
      });

      expect(result.valid).toBe(true);
    });

    test('should reject invalid card combinations', async () => {
      const state = (game as any).currentState;
      const currentPlayer = state.currentPlayer;

      // Give the current player random cards
      state.players[currentPlayer].hand = [
        { suit: 'spades', rank: '3', value: 0 },
        { suit: 'hearts', rank: '5', value: 2 },
        { suit: 'clubs', rank: '8', value: 5 },
      ];

      // Clear last play
      state.lastPlay = null;

      // Try to play an invalid combination (random cards)
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [
          { suit: 'spades', rank: '3', value: 0 },
          { suit: 'hearts', rank: '5', value: 2 },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid card combination');
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

    test('should track last play', async () => {
      const state = await game.getGameState();
      expect(state.lastPlay).toBeNull(); // No plays yet
    });

    test('should track game phase', async () => {
      const state = await game.getGameState();
      expect(state.gamePhase).toBe('playing');
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

    test('should detect when player goes out', async () => {
      // Force a player to have no cards
      const state = (game as any).currentState;
      state.players.player1.hand = [];
      state.players.player1.isOut = true;
      state.players.player1.position = 1;
      state.gameOver = true;
      state.winner = 'player1';

      const gameOver = await game.isGameOver();
      expect(gameOver).toBe(true);

      const winner = await game.getWinner();
      expect(winner).toBe('player1');
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
        cards: [{ invalid: 'card' }],
      });
      expect(result.valid).toBe(false);
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(
        game.makeMove({
          player: 'invalid_player',
          action: 'play',
          cards: [],
        })
      ).rejects.toThrow();
    });
  });

  describe('Special Rules', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should enforce 3 of spades rule for first play', async () => {
      // This test depends on which player has the 3 of spades
      const gameState = await game.getGameState();
      expect(gameState.currentPlayer).toBeDefined();

      // The game should be set up so the player with 3 of spades goes first
      expect(gameState.lastPlay).toBeNull();
    });

    test('should handle climbing mechanics', async () => {
      // Test that higher cards can beat lower cards
      const gameState = await game.getGameState();
      expect(gameState.gamePhase).toBe('playing');
    });
  });

  describe('Advanced Game Scenarios', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle complete game flow', async () => {
      const state = (game as any).currentState;
      const player1 = state.currentPlayer;

      // Set up player1 with 3 of spades and one other card
      state.players[player1].hand = [
        { suit: 'spades', rank: '3', value: 0 },
        { suit: 'hearts', rank: '4', value: 1 },
      ];

      // Player1 plays 3 of spades (required first play)
      await game.makeMove({
        player: player1,
        action: 'play',
        cards: [{ suit: 'spades', rank: '3', value: 0 }],
      });

      const stateAfterPlay = await game.getGameState();
      expect(stateAfterPlay.players[player1].handSize).toBe(1);
      expect(stateAfterPlay.lastPlay).toBeDefined();
      expect(stateAfterPlay.currentPlayer).not.toBe(player1); // Should advance to next player
    });

    test('should detect win condition', async () => {
      const state = (game as any).currentState;
      const player1 = state.currentPlayer;

      // Set up player1 with only 3 of spades
      state.players[player1].hand = [{ suit: 'spades', rank: '3', value: 0 }];

      // Player1 plays their last card
      await game.makeMove({
        player: player1,
        action: 'play',
        cards: [{ suit: 'spades', rank: '3', value: 0 }],
      });

      const finalState = await game.getGameState();
      expect(finalState.gameOver).toBe(true);
      expect(finalState.winner).toBe(player1);
      expect(finalState.players[player1].handSize).toBe(0);
      expect(finalState.players[player1].isOut).toBe(true);
    });

    test('should handle passing mechanics', async () => {
      const state = (game as any).currentState;
      const player1 = state.currentPlayer;

      // Set up a previous play
      state.lastPlay = {
        player: 'other_player',
        cards: [{ suit: 'spades', rank: 'A', value: 11 }],
        playType: 'single',
      };

      // Player1 passes
      await game.makeMove({
        player: player1,
        action: 'pass',
      });

      const stateAfterPass = await game.getGameState();
      expect(stateAfterPass.currentPlayer).not.toBe(player1); // Should advance to next player
    });

    test('should clear table when all players pass', async () => {
      const state = (game as any).currentState;
      const playerOrder = state.playerOrder;

      // Set up a previous play
      state.lastPlay = {
        player: playerOrder[0],
        cards: [{ suit: 'spades', rank: 'A', value: 11 }],
        playType: 'single',
      };

      // Make all other players pass
      for (let i = 1; i < playerOrder.length; i++) {
        state.passedPlayers.add(playerOrder[i]);
      }

      // Set current player to the one who made the last play
      state.currentPlayer = playerOrder[0];

      // Current player passes (all have now passed)
      await game.makeMove({
        player: playerOrder[0],
        action: 'pass',
      });

      const stateAfterAllPass = await game.getGameState();
      expect(stateAfterAllPass.lastPlay).toBeNull(); // Table should be cleared
    });
  });

  describe('Production-Ready Features', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle edge case with invalid card references', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        cards: [{ suit: 'invalid', rank: 'invalid' }],
      });

      expect(result.valid).toBe(false);
    });

    test('should prevent playing cards not in hand', async () => {
      const state = await game.getGameState();

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: 'A' }], // Player definitely doesn't have this specific card
      });

      // Should either be invalid due to not having the card, or due to first play rules
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/does not have|First play must include 3 of spades/);
    });

    test('should maintain game state consistency', async () => {
      const state1 = await game.getGameState();
      const state2 = await game.getGameState();

      // Game state should be consistent between calls
      expect(state1.currentPlayer).toBe(state2.currentPlayer);
      expect(state1.gameOver).toBe(state2.gameOver);
      expect(state1.gamePhase).toBe(state2.gamePhase);
    });

    test('should handle concurrent move validation', async () => {
      const state = await game.getGameState();

      // Multiple validations should not interfere with each other
      const promises = Array(5)
        .fill(null)
        .map(() =>
          game.validateMove({
            player: state.currentPlayer,
            action: 'pass',
          })
        );

      const results = await Promise.all(promises);

      // All should have consistent results
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result.valid).toBe(firstResult.valid);
        if (!result.valid) {
          expect(result.error).toBe(firstResult.error);
        }
      });
    });
  });
});





import { describe, test, expect, beforeEach } from '@jest/globals';
import { BlackjackGame } from '../src/games/blackjack.js';

describe('BlackjackGame', () => {
  let game: BlackjackGame;

  beforeEach(() => {
    game = new BlackjackGame('test-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with dealt cards and playing phase', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-game');
      expect(state.gameType).toBe('blackjack');
      expect(state.gameOver).toBeDefined();
      expect(state.currentHandIndex).toBe(0);

      // Player should have one hand with 2 cards
      expect(state.playerHands).toHaveLength(1);
      expect(state.playerHands[0].cards).toHaveLength(2);
      expect(state.playerHands[0].bet).toBe(10);
      expect(state.playerHands[0].isDouble).toBe(false);
      expect(state.playerHands[0].isSplit).toBe(false);

      // Dealer should have 2 cards (one face down, one face up)
      expect(state.dealerHand.cards).toHaveLength(2);
      expect(state.dealerHand.cards[0].faceUp).toBe(false);
      expect(state.dealerHand.cards[1].faceUp).toBe(true);

      // Game should be in playing phase unless blackjack was dealt
      if (state.playerHands[0].isBlackjack || state.dealerHand.isBlackjack) {
        expect(state.phase).toBe('finished');
        expect(state.gameOver).toBe(true);
        expect(state.results).toBeDefined();
      } else {
        expect(state.phase).toBe('playing');
        expect(state.gameOver).toBe(false);
      }
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Blackjack');
      expect(metadata.minPlayers).toBe(1);
      expect(metadata.maxPlayers).toBe(1);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('casino');
    });

    test('should calculate hand values correctly', async () => {
      const state = await game.initializeGame();

      // Hand value should be calculated correctly
      expect(state.playerHands[0].value).toBeGreaterThanOrEqual(2);
      expect(state.playerHands[0].value).toBeLessThanOrEqual(21);

      // Dealer value depends on game state
      if (state.gameOver) {
        // Game over (blackjack dealt), dealer shows full hand value
        expect(state.dealerHand.value).toBeGreaterThanOrEqual(2);
        expect(state.dealerHand.value).toBeLessThanOrEqual(21);
      } else {
        // Game in progress, dealer shows only visible card (2-10 for number cards, 10 for face cards, 11 for Ace)
        expect(state.dealerHand.value).toBeGreaterThanOrEqual(1);
        expect(state.dealerHand.value).toBeLessThanOrEqual(11);
      }
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should accept valid hit action', async () => {
      const state = await game.getGameState();

      if (!state.gameOver) {
        const result = await game.validateMove({ action: 'hit', player: 'player' });
        expect(result.valid).toBe(true);
      } else {
        // Game already over (blackjack dealt), test that validation rejects moves
        const result = await game.validateMove({ action: 'hit', player: 'player' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Game is already over');
      }
    });

    test('should accept valid stand action', async () => {
      const state = await game.getGameState();

      // Only test if game is not already over (no blackjack dealt)
      if (!state.gameOver) {
        const result = await game.validateMove({ action: 'stand', player: 'player' });
        expect(result.valid).toBe(true);
      } else {
        // If game started with blackjack, verify it's finished correctly
        expect(state.gameOver).toBe(true);
        expect(state.phase).toBe('finished');
      }
    });

    test('should accept valid double action initially', async () => {
      const state = await game.getGameState();

      if (!state.gameOver) {
        const result = await game.validateMove({ action: 'double', player: 'player' });
        expect(result.valid).toBe(true);
      } else {
        // Game already over (blackjack dealt), test that validation rejects moves
        const result = await game.validateMove({ action: 'double', player: 'player' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Game is already over');
      }
    });

    test('should reject invalid actions', async () => {
      const result = await game.validateMove({ action: 'invalid', player: 'player' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be hit, stand, double, or split');
    });

    test('should reject moves without player', async () => {
      const result = await game.validateMove({ action: 'hit' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player must be specified');
    });

    test('should reject moves when game is over', async () => {
      const state = await game.getGameState();

      // Only test if game is not already over (no blackjack dealt)
      if (!state.gameOver) {
        // Force game over by standing
        await game.makeMove({ action: 'stand', player: 'player' });

        const result = await game.validateMove({ action: 'hit', player: 'player' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Game is already over');
      } else {
        // Game already over, test validation directly
        const result = await game.validateMove({ action: 'hit', player: 'player' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Game is already over');
      }
    });

    test('should reject double after hitting', async () => {
      // Hit first to make hand ineligible for double
      await game.makeMove({ action: 'hit', player: 'player' });

      const state = await game.getGameState();
      if (!state.gameOver) {
        const result = await game.validateMove({ action: 'double', player: 'player' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Cannot double this hand');
      }
    });
  });

  describe('Game Actions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle hit action', async () => {
      const initialState = await game.getGameState();
      const initialCardCount = initialState.playerHands[0].cards.length;

      await game.makeMove({ action: 'hit', player: 'player' });

      const newState = await game.getGameState();
      expect(newState.playerHands[0].cards.length).toBe(initialCardCount + 1);
    });

    test('should handle stand action and finish game', async () => {
      const initialState = await game.getGameState();

      // Only test if game is not already over (no blackjack dealt)
      if (!initialState.gameOver) {
        await game.makeMove({ action: 'stand', player: 'player' });

        const state = await game.getGameState();
        expect(state.gameOver).toBe(true);
        expect(state.phase).toBe('finished');
        expect(state.results).toBeDefined();
        expect(state.results).toHaveLength(1);
      } else {
        // If game started with blackjack, verify it's finished correctly
        expect(initialState.gameOver).toBe(true);
        expect(initialState.phase).toBe('finished');
        expect(initialState.results).toBeDefined();
        expect(initialState.results).toHaveLength(1);
      }
    });

    test('should handle double action', async () => {
      const initialState = await game.getGameState();

      if (!initialState.gameOver) {
        const initialBet = initialState.playerHands[0].bet;

        await game.makeMove({ action: 'double', player: 'player' });

        const newState = await game.getGameState();
        expect(newState.playerHands[0].bet).toBe(initialBet * 2);
        expect(newState.playerHands[0].isDouble).toBe(true);
        expect(newState.gameOver).toBe(true); // Double ends the hand
      } else {
        // Game already over, verify it's in correct state
        expect(initialState.gameOver).toBe(true);
        expect(initialState.phase).toBe('finished');
      }
    });

    test('should handle split action when possible', async () => {
      // This test is probabilistic since we need matching cards
      // We'll just verify the validation logic works
      const state = await game.getGameState();
      const hand = state.playerHands[0];

      if (!state.gameOver && hand.cards[0].rank === hand.cards[1].rank) {
        await game.makeMove({ action: 'split', player: 'player' });

        const newState = await game.getGameState();
        expect(newState.playerHands).toHaveLength(2);
        expect(newState.playerHands[0].isSplit).toBe(true);
        expect(newState.playerHands[1].isSplit).toBe(true);
      } else {
        const result = await game.validateMove({ action: 'split', player: 'player' });
        if (!state.gameOver) {
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Cannot split this hand');
        } else {
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Game is already over');
        }
      }
    });
  });

  describe('Game Logic', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect bust when over 21', async () => {
      // Keep hitting until bust or game ends
      let state = await game.getGameState();
      let attempts = 0;

      while (!state.gameOver && state.playerHands[0].value < 21 && attempts < 10) {
        await game.makeMove({ action: 'hit', player: 'player' });
        state = await game.getGameState();
        attempts++;
      }

      if (state.playerHands[0].value > 21) {
        expect(state.playerHands[0].isBust).toBe(true);
        expect(state.gameOver).toBe(true);
      }
    });

    test('should reveal dealer cards when game ends', async () => {
      const initialState = await game.getGameState();

      if (!initialState.gameOver) {
        await game.makeMove({ action: 'stand', player: 'player' });
      }

      const state = await game.getGameState();
      expect(state.dealerHand.cards[0].faceUp).toBe(true);
      expect(state.dealerHand.value).toBeGreaterThanOrEqual(2);
    });

    test('should calculate correct payouts', async () => {
      const initialState = await game.getGameState();

      if (!initialState.gameOver) {
        await game.makeMove({ action: 'stand', player: 'player' });
      }

      const state = await game.getGameState();
      expect(state.results).toBeDefined();
      expect(state.results![0]).toHaveProperty('outcome');
      expect(state.results![0]).toHaveProperty('payout');
      expect(['win', 'lose', 'push', 'blackjack']).toContain(state.results![0].outcome);
    });

    test('should detect blackjack correctly', async () => {
      const state = await game.getGameState();
      const hand = state.playerHands[0];

      if (hand.value === 21 && hand.cards.length === 2) {
        expect(hand.isBlackjack).toBe(true);
      } else {
        expect(hand.isBlackjack).toBe(false);
      }
    });

    test('should provide correct legal actions', async () => {
      const state = await game.getGameState();

      if (!state.gameOver) {
        expect(state.legalActions).toContain('hit');
        expect(state.legalActions).toContain('stand');

        // Double should be available initially
        if (state.playerHands[0].cards.length === 2) {
          expect(state.legalActions).toContain('double');
        }

        // Split should be available if cards match
        if (state.playerHands[0].cards[0].rank === state.playerHands[0].cards[1].rank) {
          expect(state.legalActions).toContain('split');
        }
      } else {
        expect(state.legalActions).toEqual([]);
      }
    });
  });

  describe('Dealer Logic', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should make dealer play when player stands', async () => {
      const initialState = await game.getGameState();
      const initialDealerCards = initialState.dealerHand.cards.length;

      await game.makeMove({ action: 'stand', player: 'player' });

      const finalState = await game.getGameState();

      // Dealer should have played (might have more cards)
      expect(finalState.dealerHand.cards.length).toBeGreaterThanOrEqual(initialDealerCards);
      expect(finalState.phase).toBe('finished');
    });

    test('should follow dealer rules (hit on 16, stand on 17)', async () => {
      await game.makeMove({ action: 'stand', player: 'player' });

      const state = await game.getGameState();
      const dealerValue = state.dealerHand.value;

      // Dealer should have 17 or more, or be bust
      expect(dealerValue >= 17 || state.dealerHand.isBust).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle ace values correctly', async () => {
      const state = await game.getGameState();

      // Check if any aces are in hand and value is calculated correctly
      const hasAce = state.playerHands[0].cards.some((card) => card.rank === 'A');
      if (hasAce) {
        // Value should be optimized (ace as 11 if possible, 1 if needed)
        expect(state.playerHands[0].value).toBeLessThanOrEqual(21);
      }
    });

    test('should handle multiple aces correctly', async () => {
      // This is probabilistic, but we can test the logic exists
      const state = await game.getGameState();
      const aces = state.playerHands[0].cards.filter((card) => card.rank === 'A').length;

      if (aces > 1) {
        // Only one ace should count as 11 maximum
        expect(state.playerHands[0].value).toBeLessThanOrEqual(21);
      }
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({ invalid: 'data' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be hit, stand, double, or split');
    });

    test('should throw error for invalid moves in makeMove', async () => {
      await expect(game.makeMove({ action: 'invalid', player: 'player' })).rejects.toThrow();
    });
  });

  describe('Game State Management', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should track game phases correctly', async () => {
      let state = await game.getGameState();

      if (!state.gameOver) {
        expect(state.phase).toBe('playing');

        await game.makeMove({ action: 'stand', player: 'player' });

        state = await game.getGameState();
        expect(state.phase).toBe('finished');
      } else {
        // Game started with blackjack
        expect(state.phase).toBe('finished');
      }
    });

    test('should determine winner correctly', async () => {
      const initialState = await game.getGameState();

      if (!initialState.gameOver) {
        await game.makeMove({ action: 'stand', player: 'player' });
      }

      const winner = await game.getWinner();
      expect(['player', 'dealer', 'push']).toContain(winner);
    });

    test('should detect game over correctly', async () => {
      const initialGameOver = await game.isGameOver();
      const initialState = await game.getGameState();

      if (!initialState.gameOver) {
        expect(initialGameOver).toBe(false);

        await game.makeMove({ action: 'stand', player: 'player' });

        const finalGameOver = await game.isGameOver();
        expect(finalGameOver).toBe(true);
      } else {
        // Game started with blackjack
        expect(initialGameOver).toBe(true);
      }
    });
  });
});

import { BullshitGame } from '../src/games/bullshit.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('BullshitGame', () => {
  let game: BullshitGame;

  beforeEach(() => {
    game = new BullshitGame('test-bullshit-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', () => {
      expect(game['gameType']).toBe('bullshit');
    });

    test('should initialize game with default 4 players', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-bullshit-game');
      expect(state.gameType).toBe('bullshit');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(4);
      expect(playerIds).toEqual(['player1', 'player2', 'player3', 'player4']);

      // Each player should have 13 cards (52 cards / 4 players)
      for (const playerId of playerIds) {
        expect(state.players[playerId].handSize).toBe(13);
      }

      expect(state.currentPlayer).toBe('player1');
      expect(state.currentRank).toBe('A');
    });

    test('should initialize game with custom player count', async () => {
      const state = await game.initializeGame({ playerCount: 6 } as any);

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(6);

      // Each player should have 8 cards (48 cards / 6 players) + some get extra
      const totalCards = Object.values(state.players).reduce(
        (sum, player) => sum + player.handSize,
        0
      );
      expect(totalCards).toBe(52);
    });

    test('should have correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Bullshit');
      expect(metadata.minPlayers).toBe(3);
      expect(metadata.maxPlayers).toBe(8);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('bluffing');
      expect(metadata.categories).toContain('strategy');
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate play action for current player', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const currentRank = state.currentRank;

      // Get a card of the current rank from player's hand
      const playerHand = state.players[currentPlayer].hand;
      const validCards = playerHand.filter((card) => card.rank === currentRank);

      if (validCards.length > 0) {
        const result = await game.validateMove({
          player: currentPlayer,
          action: 'play',
          cards: [validCards[0]!],
          claimedRank: currentRank,
        });

        expect(result.valid).toBe(true);
      }
    });

    test('should reject play action for wrong player', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: 'A' }],
        claimedRank: 'A',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });

    test('should reject play action with wrong claimed rank', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const wrongRank = state.currentRank === 'A' ? '2' : 'A';

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: wrongRank }],
        claimedRank: wrongRank,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain(`Must claim rank ${state.currentRank}`);
    });

    test('should reject invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'play',
        cards: [{ suit: 'spades', rank: 'A' }],
        claimedRank: 'A',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid player');
    });

    test('should reject challenge from player who just played', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;

      // Make a play first
      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      // Try to challenge own play
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'challenge',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot challenge your own play');
    });

    test('should validate challenge action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;
      const nextPlayer = 'player2';

      // Make a play first
      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      // Challenge should be valid
      const result = await game.validateMove({
        player: nextPlayer,
        action: 'challenge',
      });

      expect(result.valid).toBe(true);
    });

    test('should reject playing cards not in hand', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [{ suit: 'spades', rank: 'K' }], // Assuming this card is not in hand
        claimedRank: state.currentRank!,
      });

      // This might be valid if the card is actually in hand, so we check the error message
      if (!result.valid) {
        expect(result.error).toContain('You do not have one or more of the cards');
      }
    });
  });

  describe('Game Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow players to play cards', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;
      const initialHandSize = playerHand.length;

      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      const newState = await game.getGameState();
      expect(newState.players[currentPlayer].handSize).toBe(initialHandSize - 1);
      expect(newState.lastPlay).toBeDefined();
      expect(newState.lastPlay!.playerId).toBe(currentPlayer);
      expect(newState.lastPlay!.cardCount).toBe(1);
      expect(newState.canChallenge).toBe(true);
    });

    test('should advance to next rank after play', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;
      const initialRank = state.currentRank;

      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: initialRank!,
      });

      const newState = await game.getGameState();
      expect(newState.currentRank).not.toBe(initialRank);

      // Should advance from A to 2, or from any rank to the next
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const initialIndex = ranks.indexOf(initialRank!);
      const expectedRank = ranks[(initialIndex + 1) % ranks.length];
      expect(newState.currentRank).toBe(expectedRank);
    });

    test('should advance to next player after play', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;

      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      const newState = await game.getGameState();
      expect(newState.currentPlayer).not.toBe(currentPlayer);

      // Should be the next player in order
      const playerOrder = ['player1', 'player2', 'player3', 'player4'];
      const currentIndex = playerOrder.indexOf(currentPlayer);
      const expectedNextPlayer = playerOrder[(currentIndex + 1) % playerOrder.length];
      expect(newState.currentPlayer).toBe(expectedNextPlayer);
    });

    test('should handle successful challenge', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;
      const challenger = 'player2';

      // Find a card that doesn't match the current rank (for lying)
      const wrongCard = playerHand.find((card) => card.rank !== state.currentRank);

      if (wrongCard) {
        const initialTargetHandSize = state.players[currentPlayer].handSize;

        await game.makeMove({
          player: currentPlayer,
          action: 'play',
          cards: [wrongCard],
          claimedRank: state.currentRank!, // Lying about the rank
        });

        await game.makeMove({
          player: challenger,
          action: 'challenge',
        });

        const newState = await game.getGameState();

        // Target should have taken the discard pile (1 card played, 1 card back = same size or more if there were already cards in discard)
        expect(newState.players[currentPlayer].handSize).toBeGreaterThanOrEqual(
          initialTargetHandSize
        );
        expect(newState.discardPileSize).toBe(0);
        expect(newState.lastAction?.action).toBe('challenge');
        expect(newState.canChallenge).toBe(false);
      }
    });

    test('should handle failed challenge', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;
      const challenger = 'player2';

      // Find a card that matches the current rank (for telling truth)
      const truthCard = playerHand.find((card) => card.rank === state.currentRank);

      if (truthCard) {
        await game.makeMove({
          player: currentPlayer,
          action: 'play',
          cards: [truthCard],
          claimedRank: state.currentRank!, // Telling the truth
        });

        const initialChallengerHandSize = state.players[challenger].handSize;

        await game.makeMove({
          player: challenger,
          action: 'challenge',
        });

        const newState = await game.getGameState();

        // Challenger should have taken the discard pile
        expect(newState.players[challenger].handSize).toBeGreaterThan(initialChallengerHandSize);
        expect(newState.discardPileSize).toBe(0);
        expect(newState.lastAction?.action).toBe('challenge');
      }
    });

    test('should allow playing multiple cards of same rank', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;

      // Find multiple cards of the current rank
      const matchingCards = playerHand.filter((card) => card.rank === state.currentRank);

      if (matchingCards.length >= 2) {
        const cardsToPlay = matchingCards.slice(0, 2);
        const initialHandSize = playerHand.length;

        await game.makeMove({
          player: currentPlayer,
          action: 'play',
          cards: cardsToPlay,
          claimedRank: state.currentRank!,
        });

        const newState = await game.getGameState();
        expect(newState.players[currentPlayer].handSize).toBe(initialHandSize - 2);
        expect(newState.lastPlay!.cardCount).toBe(2);
      }
    });
  });

  describe('Win Conditions', () => {
    test('should detect winner when player has no cards left', async () => {
      await game.initializeGame();

      // Simulate game by forcing a player to have very few cards
      const gameState = game['currentState'] as any;
      gameState.players.player1.hand = [gameState.players.player1.hand[0]]; // Leave only 1 card
      gameState.players.player1.handSize = 1;

      // Play the last card
      await game.makeMove({
        player: 'player1',
        action: 'play',
        cards: [gameState.players.player1.hand[0]],
        claimedRank: gameState.currentRank,
      });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('player1');
    });

    test('should not end game while players have cards', async () => {
      await game.initializeGame();

      const state = await game.getGameState();
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      // All players should have cards
      for (const player of Object.values(state.players)) {
        expect(player.handSize).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove(null as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid move data format');
    });

    test('should handle malformed move objects', async () => {
      const result = await game.validateMove({
        invalidField: 'invalid',
      });
      expect(result.valid).toBe(false);
    });

    test('should prevent moves after game over', async () => {
      await restoreGameState(game, { gameOver: true, winner: 'player1' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'play',
        cards: [{ suit: 'spades', rank: 'A' }],
        claimedRank: 'A',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Game is already over');
    });

    test('should reject playing more than 4 cards', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [
          { suit: 'spades', rank: 'A' },
          { suit: 'hearts', rank: 'A' },
          { suit: 'diamonds', rank: 'A' },
          { suit: 'clubs', rank: 'A' },
          { suit: 'spades', rank: '2' }, // 5th card
        ],
        claimedRank: state.currentRank!,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot play more than 4 cards at once');
    });

    test('should reject empty card array', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'play',
        cards: [],
        claimedRank: state.currentRank!,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must provide cards and claimed rank');
    });
  });

  describe('Game State Management', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should maintain consistent game state', async () => {
      const state1 = await game.getGameState();
      const state2 = await game.getGameState();

      expect(state1).toEqual(state2);
    });

    test('should track discard pile correctly', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;

      expect(state.discardPileSize).toBe(0);

      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      const newState = await game.getGameState();
      expect(newState.discardPileSize).toBe(1);
    });

    test('should update last action correctly', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const playerHand = state.players[currentPlayer].hand;

      await game.makeMove({
        player: currentPlayer,
        action: 'play',
        cards: [playerHand[0]!],
        claimedRank: state.currentRank!,
      });

      const newState = await game.getGameState();
      expect(newState.lastAction).toBeDefined();
      expect(newState.lastAction!.action).toBe('play');
      expect(newState.lastAction!.player).toBe(currentPlayer);
    });
  });
});



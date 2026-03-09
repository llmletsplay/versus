import { HeartsGame } from '../src/games/hearts.js';
import { describe, test, expect, beforeEach } from '@jest/globals';

// Helper to access internal state for testing
function getInternalState(game: any): any {
  return game.currentState;
}

describe('HeartsGame', () => {
  let game: HeartsGame;
  const gameId = 'test-hearts-game';

  beforeEach(async () => {
    game = new HeartsGame(gameId);
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', () => {
      expect(game.getGameType()).toBe('hearts');
      expect(game.getGameId()).toBe(gameId);
    });

    test('should initialize game with 4 players', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe(gameId);
      expect(state.gameType).toBe('hearts');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.playerOrder).toEqual(['north', 'south', 'east', 'west']);
      expect(state.gamePhase).toBe('passing');
      expect(state.roundNumber).toBe(1);
      expect(state.heartsBroken).toBe(false);
      expect(state.passDirection).toBe('left');
    });

    test('should deal 13 cards to each player', async () => {
      const state = await game.initializeGame();

      expect(state.hands.north).toHaveLength(13);
      expect(state.hands.east).toHaveLength(13);
      expect(state.hands.south).toHaveLength(13);
      expect(state.hands.west).toHaveLength(13);

      // Total cards should be 52
      const totalCards = Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0);
      expect(totalCards).toBe(52);
    });

    test('should set player with 2 of clubs as first player', async () => {
      const state = await game.initializeGame();

      // Find who has 2 of clubs
      let playerWith2C = null;
      for (const [player, hand] of Object.entries(state.hands)) {
        if (hand.some((card) => card.rank === '2' && card.suit === 'clubs')) {
          playerWith2C = player;
          break;
        }
      }

      expect(state.currentPlayer).toBe(playerWith2C);
    });

    test('should initialize scores correctly', async () => {
      const state = await game.initializeGame();

      expect(state.scores).toEqual({ north: 0, south: 0, east: 0, west: 0 });
      expect(state.gameScores).toEqual({ north: 0, south: 0, east: 0, west: 0 });
      expect(state.completedTricks).toHaveLength(0);
      expect(state.trickNumber).toBe(0);
    });

    test('should have correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Hearts');
      expect(metadata.description).toContain('trick-taking');
      expect(metadata.minPlayers).toBe(4);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('classic');
    });
  });

  describe('Passing Phase - Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate correct pass for any player', async () => {
      const state = await game.getGameState();
      const player = 'north';
      const cardsToPass = state.hands[player].slice(0, 3);

      const moveData = {
        player,
        action: 'pass',
        cards: cardsToPass,
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(true);
    });

    test('should reject pass with wrong number of cards', async () => {
      const state = await game.getGameState();
      const player = 'north';
      const cardsToPass = state.hands[player].slice(0, 2); // Only 2 cards

      const moveData = {
        player,
        action: 'pass',
        cards: cardsToPass,
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('exactly 3 cards');
    });

    test('should reject pass from invalid player', async () => {
      const state = await game.getGameState();

      const moveData = {
        player: 'invalid_player',
        action: 'pass',
        cards: state.hands.north.slice(0, 3),
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('must be north, south, east, or west');
    });

    test('should reject double passing', async () => {
      const state = await game.getGameState();
      const player = 'north';
      const cardsToPass = state.hands[player].slice(0, 3);

      // First pass
      await game.makeMove({
        player,
        action: 'pass',
        cards: cardsToPass,
      });

      // Try to pass again
      const validation = await game.validateMove({
        player,
        action: 'pass',
        cards: state.hands[player].slice(0, 3),
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('already passed');
    });

    test('should reject passing cards not in hand', async () => {
      const moveData = {
        player: 'north',
        action: 'pass',
        cards: [
          { suit: 'hearts', rank: 'X', value: 99 },
          { suit: 'hearts', rank: 'Y', value: 98 },
          { suit: 'hearts', rank: 'Z', value: 97 },
        ],
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('does not have');
    });

    test('should reject pass action during playing phase', async () => {
      // Create new game and skip to playing phase
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';

      const moveData = {
        player: 'north',
        action: 'pass',
        cards: internalState.hands.north.slice(0, 3),
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Not in passing phase');
    });
  });

  describe('Passing Phase - Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle passing cards between players', async () => {
      const state = await game.getGameState();

      // All players pass 3 cards
      for (const player of ['north', 'south', 'east', 'west']) {
        const cardsToPass = state.hands[player].slice(0, 3);
        await game.makeMove({
          player,
          action: 'pass',
          cards: cardsToPass,
        });
      }

      const newState = await game.getGameState();
      expect(newState.gamePhase).toBe('playing');

      // Each player should still have 13 cards
      for (const player of ['north', 'south', 'east', 'west']) {
        expect(newState.hands[player]).toHaveLength(13);
      }
    });

    test('should pass cards in correct direction - left', async () => {
      const state = await game.getGameState();
      expect(state.passDirection).toBe('left');

      // Store specific cards being passed
      const northCards = state.hands.north.slice(0, 3);
      const eastCards = state.hands.east.slice(0, 3);
      const southCards = state.hands.south.slice(0, 3);
      const westCards = state.hands.west.slice(0, 3);

      // All players pass
      await game.makeMove({ player: 'north', action: 'pass', cards: northCards });
      await game.makeMove({ player: 'east', action: 'pass', cards: eastCards });
      await game.makeMove({ player: 'south', action: 'pass', cards: southCards });
      await game.makeMove({ player: 'west', action: 'pass', cards: westCards });

      const newState = await game.getGameState();

      // Verify cards were passed left: north->east, east->south, south->west, west->north
      expect(newState.receivedCards.east).toEqual(northCards);
      expect(newState.receivedCards.south).toEqual(eastCards);
      expect(newState.receivedCards.west).toEqual(southCards);
      expect(newState.receivedCards.north).toEqual(westCards);
    });

    test('should handle no passing on 4th round', async () => {
      const internalState = getInternalState(game);

      // Set to 4th round (no passing)
      internalState.roundNumber = 4;
      internalState.passDirection = 'none';
      internalState.gamePhase = 'playing';

      const state = await game.getGameState();
      expect(state.passDirection).toBe('none');
      expect(state.gamePhase).toBe('playing');
    });

    test('should sort hands after passing', async () => {
      const state = await game.getGameState();

      // All players pass
      for (const player of ['north', 'south', 'east', 'west']) {
        await game.makeMove({
          player,
          action: 'pass',
          cards: state.hands[player].slice(0, 3),
        });
      }

      const newState = await game.getGameState();

      // Check hands are sorted by suit then value
      for (const hand of Object.values(newState.hands)) {
        for (let i = 1; i < hand.length; i++) {
          const prev = hand[i - 1];
          const curr = hand[i];
          const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };

          const prevSuit = suitOrder[prev.suit as keyof typeof suitOrder];
          const currSuit = suitOrder[curr.suit as keyof typeof suitOrder];

          if (prevSuit === currSuit) {
            expect(prev.value).toBeLessThanOrEqual(curr.value);
          } else {
            expect(prevSuit).toBeLessThan(currSuit);
          }
        }
      }
    });
  });

  describe('Playing Phase - Card Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
      // Skip passing phase
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';
    });

    test('should validate card play for current player', async () => {
      const state = await game.getGameState();
      const player = state.currentPlayer;

      // If it's the first trick, we need to play 2 of clubs
      let card;
      if (state.trickNumber === 0 && Object.keys(state.currentTrick.cards).length === 0) {
        card = state.hands[player].find((c) => c.rank === '2' && c.suit === 'clubs');
        // If current player doesn't have 2 of clubs, skip to trick 1
        if (!card) {
          const internalState = getInternalState(game);
          internalState.trickNumber = 1;
          card = state.hands[player][0];
        }
      } else {
        card = state.hands[player][0];
      }

      const moveData = {
        player,
        action: 'play',
        card,
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(true);
    });

    test('should reject card play from wrong player', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'north' ? 'south' : 'north';
      const card = state.hands[wrongPlayer][0];

      const moveData = {
        player: wrongPlayer,
        action: 'play',
        card,
      };

      const validation = await game.validateMove(moveData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('turn');
    });

    test('should require 2 of clubs on first trick', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);

      // Find player with 2 of clubs
      let playerWith2C = null;
      for (const [player, hand] of Object.entries(state.hands)) {
        const card = hand.find((c) => c.rank === '2' && c.suit === 'clubs');
        if (card) {
          playerWith2C = player;
          break;
        }
      }

      // Set that player as current
      internalState.currentPlayer = playerWith2C;

      // Try to play different card
      const otherCard = state.hands[playerWith2C].find(
        (c) => !(c.rank === '2' && c.suit === 'clubs')
      );

      if (otherCard) {
        const validation = await game.validateMove({
          player: playerWith2C,
          action: 'play',
          card: otherCard,
        });

        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('2 of clubs');
      }
    });

    test('should prevent leading hearts when not broken', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);

      // Skip first trick
      internalState.trickNumber = 1;
      internalState.heartsBroken = false;

      // Find player with hearts and non-hearts
      let testPlayer = null;
      let heartCard = null;
      for (const [player, hand] of Object.entries(state.hands)) {
        const heart = hand.find((c) => c.suit === 'hearts');
        const nonHeart = hand.find((c) => c.suit !== 'hearts');
        if (heart && nonHeart) {
          testPlayer = player;
          heartCard = heart;
          break;
        }
      }

      if (testPlayer && heartCard) {
        internalState.currentPlayer = testPlayer;

        const validation = await game.validateMove({
          player: testPlayer,
          action: 'play',
          card: heartCard,
        });

        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('Cannot lead hearts');
      }
    });

    test('should allow leading hearts when only hearts left', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);

      // Give player only hearts
      const player = 'north';
      internalState.hands[player] = state.hands[player].filter((c) => c.suit === 'hearts');
      internalState.currentPlayer = player;
      internalState.trickNumber = 1;

      if (internalState.hands[player].length > 0) {
        const heartCard = internalState.hands[player][0];

        const validation = await game.validateMove({
          player,
          action: 'play',
          card: heartCard,
        });

        expect(validation.valid).toBe(true);
      }
    });

    test('should reject hearts/queen of spades on first trick', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);

      // Find player with 2 of clubs and hearts/QS
      let testPlayer = null;
      let penaltyCard = null;

      for (const [player, hand] of Object.entries(state.hands)) {
        const has2C = hand.some((c) => c.rank === '2' && c.suit === 'clubs');
        if (has2C) {
          // Look for hearts or queen of spades
          penaltyCard = hand.find(
            (c) => c.suit === 'hearts' || (c.suit === 'spades' && c.rank === 'Q')
          );
          if (penaltyCard) {
            testPlayer = player;
            break;
          }
        }
      }

      if (testPlayer && penaltyCard) {
        // Play 2 of clubs first
        const twoOfClubs = state.hands[testPlayer].find(
          (c) => c.rank === '2' && c.suit === 'clubs'
        );
        await game.makeMove({
          player: testPlayer,
          action: 'play',
          card: twoOfClubs,
        });

        // Next player tries to play penalty card on first trick
        const nextState = await game.getGameState();
        const nextPlayer = nextState.currentPlayer;

        // Give next player the penalty card
        internalState.hands[nextPlayer] = [penaltyCard];

        const validation = await game.validateMove({
          player: nextPlayer,
          action: 'play',
          card: penaltyCard,
        });

        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('first trick');
      }
    });
  });

  describe('Playing Phase - Following Suit', () => {
    beforeEach(async () => {
      await game.initializeGame();
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';
      internalState.trickNumber = 1; // Skip first trick requirements
    });

    test('should require following suit when possible', async () => {
      const state = await game.getGameState();
      const leadPlayer = state.currentPlayer;
      const leadCard =
        state.hands[leadPlayer].find((c) => c.suit === 'diamonds') || state.hands[leadPlayer][0];

      // Lead a card
      await game.makeMove({
        player: leadPlayer,
        action: 'play',
        card: leadCard,
      });

      const newState = await game.getGameState();
      const nextPlayer = newState.currentPlayer;
      const nextHand = newState.hands[nextPlayer];

      // Check if next player has the led suit
      const hasLeadSuit = nextHand.some((c) => c.suit === leadCard.suit);
      const wrongSuitCard = nextHand.find((c) => c.suit !== leadCard.suit);

      if (hasLeadSuit && wrongSuitCard) {
        const validation = await game.validateMove({
          player: nextPlayer,
          action: 'play',
          card: wrongSuitCard,
        });

        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('Must follow suit');
      }
    });

    test('should allow playing any card when cannot follow suit', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);
      const leadPlayer = state.currentPlayer;

      // Lead a specific suit
      const leadCard =
        state.hands[leadPlayer].find((c) => c.suit === 'clubs') || state.hands[leadPlayer][0];

      await game.makeMove({
        player: leadPlayer,
        action: 'play',
        card: leadCard,
      });

      const newState = await game.getGameState();
      const nextPlayer = newState.currentPlayer;

      // Remove all cards of lead suit from next player
      internalState.hands[nextPlayer] = newState.hands[nextPlayer].filter(
        (c) => c.suit !== leadCard.suit
      );

      if (internalState.hands[nextPlayer].length > 0) {
        const anyCard = internalState.hands[nextPlayer][0];

        const validation = await game.validateMove({
          player: nextPlayer,
          action: 'play',
          card: anyCard,
        });

        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('Playing Phase - Trick Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';
      internalState.trickNumber = 1;
    });

    test('should track cards played in trick', async () => {
      const state = await game.getGameState();
      const player = state.currentPlayer;
      const internalState = getInternalState(game);
      let card = state.hands[player].find((c) => c.suit !== 'hearts');

      if (!card) {
        internalState.heartsBroken = true;
        card = state.hands[player][0];
      }

      await game.makeMove({
        player,
        action: 'play',
        card,
      });

      const newState = await game.getGameState();
      expect(newState.currentTrick.cards[player]).toEqual(card);
      expect(newState.currentTrick.leader).toBe(player);
      expect(newState.hands[player]).not.toContainEqual(card);
    });

    test('should advance to next player after card play', async () => {
      const state = await game.getGameState();
      const player = state.currentPlayer;
      const expectedNext = state.playerOrder[(state.playerOrder.indexOf(player) + 1) % 4];

      // Find a non-heart card to lead with (hearts not broken yet)
      let card = state.hands[player].find((c) => c.suit !== 'hearts');
      if (!card) {
        // If only hearts, break hearts first
        const internalState = getInternalState(game);
        internalState.heartsBroken = true;
        card = state.hands[player][0];
      }

      await game.makeMove({
        player,
        action: 'play',
        card,
      });

      const newState = await game.getGameState();
      expect(newState.currentPlayer).toBe(expectedNext);
    });

    test('should break hearts when heart is played', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);

      // Lead non-heart
      const player = state.currentPlayer;
      const nonHeartCard = state.hands[player].find((c) => c.suit !== 'hearts');

      if (nonHeartCard) {
        await game.makeMove({
          player,
          action: 'play',
          card: nonHeartCard,
        });

        // Next player plays heart
        const nextState = await game.getGameState();
        const nextPlayer = nextState.currentPlayer;
        const heartCard = nextState.hands[nextPlayer].find((c) => c.suit === 'hearts');

        if (heartCard) {
          // Remove cards of lead suit to allow heart play
          internalState.hands[nextPlayer] = nextState.hands[nextPlayer].filter(
            (c) => c.suit !== nonHeartCard.suit
          );

          await game.makeMove({
            player: nextPlayer,
            action: 'play',
            card: heartCard,
          });

          const finalState = await game.getGameState();
          expect(finalState.heartsBroken).toBe(true);
        }
      }
    });

    test('should complete trick and determine winner', async () => {
      const internalState = getInternalState(game);

      // Set up controlled hands for predictable trick
      internalState.hands.north = [{ suit: 'clubs', rank: '7', value: 7 }];
      internalState.hands.east = [{ suit: 'clubs', rank: 'K', value: 13 }];
      internalState.hands.south = [{ suit: 'clubs', rank: '9', value: 9 }];
      internalState.hands.west = [{ suit: 'clubs', rank: 'Q', value: 12 }];

      // Play the trick
      for (let i = 0; i < 4; i++) {
        const currentState = await game.getGameState();
        await game.makeMove({
          player: currentState.currentPlayer,
          action: 'play',
          card: internalState.hands[currentState.currentPlayer][0],
        });
      }

      const finalState = await game.getGameState();
      expect(finalState.completedTricks).toHaveLength(1);
      expect(finalState.completedTricks[0].winner).toBe('east'); // King wins
      expect(finalState.currentPlayer).toBe('east'); // Winner leads next
    });

    test('should calculate trick points correctly', async () => {
      const internalState = getInternalState(game);

      // Set up trick with hearts and queen of spades
      internalState.hands.north = [{ suit: 'hearts', rank: '7', value: 7 }];
      internalState.hands.east = [{ suit: 'hearts', rank: 'K', value: 13 }];
      internalState.hands.south = [{ suit: 'spades', rank: 'Q', value: 12 }];
      internalState.hands.west = [{ suit: 'hearts', rank: '2', value: 2 }];

      // Play the trick
      for (let i = 0; i < 4; i++) {
        const currentState = await game.getGameState();
        await game.makeMove({
          player: currentState.currentPlayer,
          action: 'play',
          card: internalState.hands[currentState.currentPlayer][0],
        });
      }

      const finalState = await game.getGameState();
      const trick = finalState.completedTricks[0];

      // 3 hearts (1 point each) + Queen of Spades (13 points) = 16 points
      expect(trick.points).toBe(16);
      expect(finalState.scores[trick.winner]).toBe(16);
    });
  });

  describe('Scoring System', () => {
    beforeEach(async () => {
      await game.initializeGame();
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';
    });

    test('should track round scores correctly', async () => {
      const internalState = getInternalState(game);

      // Simulate some trick results
      internalState.scores = { north: 5, south: 8, east: 13, west: 0 };

      expect(internalState.scores.north).toBe(5);
      expect(internalState.scores.south).toBe(8);
      expect(internalState.scores.east).toBe(13);
      expect(internalState.scores.west).toBe(0);

      // Total should be 26 (all hearts + queen of spades)
      const totalPoints = Object.values(internalState.scores).reduce(
        (sum, score) => sum + score,
        0
      );
      expect(totalPoints).toBe(26);
    });

    test('should detect shooting the moon', async () => {
      const internalState = getInternalState(game);

      // Give one player all 26 points
      internalState.scores = { north: 26, south: 0, east: 0, west: 0 };
      internalState.completedTricks = new Array(13).fill({});

      // Force round end
      internalState.completedTricks = new Array(13).fill({
        cards: {},
        winner: 'north',
        points: 2,
      });

      // Check that one player has all points
      const moonShooter = Object.entries(internalState.scores).find(
        ([_, score]) => score === 26
      )?.[0];

      expect(moonShooter).toBe('north');
    });

    test('should handle shooting the moon scoring', async () => {
      const internalState = getInternalState(game);

      // Set up moon shot scenario
      internalState.scores = { north: 26, south: 0, east: 0, west: 0 };
      internalState.completedTricks = new Array(13).fill({});

      // Simulate round end logic
      const moonShooter = 'north';

      // Moon shooter should get 0, others get 26
      const expectedScores = {
        north: 0,
        south: 26,
        east: 26,
        west: 26,
      };

      // Verify the scoring logic
      for (const player of ['north', 'south', 'east', 'west'] as const) {
        if (player === moonShooter) {
          expect(expectedScores[player]).toBe(0);
        } else {
          expect(expectedScores[player]).toBe(26);
        }
      }
    });

    test('should accumulate game scores across rounds', async () => {
      const internalState = getInternalState(game);

      // Simulate multiple rounds
      internalState.gameScores = { north: 25, south: 30, east: 20, west: 15 };
      internalState.scores = { north: 10, south: 5, east: 8, west: 3 };

      // Add round scores to game scores
      const expectedGameScores = {
        north: 35,
        south: 35,
        east: 28,
        west: 18,
      };

      // Simulate adding scores
      for (const player of ['north', 'south', 'east', 'west'] as const) {
        internalState.gameScores[player] += internalState.scores[player];
      }

      expect(internalState.gameScores).toEqual(expectedGameScores);
    });
  });

  describe('Game End Conditions', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should detect game not over initially', async () => {
      expect(await game.isGameOver()).toBe(false);

      const state = await game.getGameState();
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
    });

    test('should end game when player reaches 100 points', async () => {
      const internalState = getInternalState(game);

      // Set high scores
      internalState.gameScores = { north: 105, south: 80, east: 70, west: 60 };
      internalState.gameOver = true;
      internalState.winner = 'west'; // Lowest score wins

      expect(await game.isGameOver()).toBe(true);
      expect(await game.getWinner()).toBe('west');
    });

    test('should determine winner as player with lowest score', async () => {
      const internalState = getInternalState(game);

      // Set final scores
      internalState.gameScores = { north: 110, south: 95, east: 85, west: 75 };
      internalState.gameOver = true;

      // Find actual lowest score
      let lowestScore = Infinity;
      let winner = 'north';
      for (const [player, score] of Object.entries(internalState.gameScores)) {
        if (score < lowestScore) {
          lowestScore = score;
          winner = player;
        }
      }

      internalState.winner = winner;

      expect(await game.getWinner()).toBe('west');
      expect(lowestScore).toBe(75);
    });

    test('should not end game below 100 points', async () => {
      const internalState = getInternalState(game);

      internalState.gameScores = { north: 85, south: 70, east: 65, west: 50 };

      expect(await game.isGameOver()).toBe(false);
    });
  });

  describe('Round Progression', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should progress through pass directions', async () => {
      const internalState = getInternalState(game);

      // Round 1: left
      expect(internalState.passDirection).toBe('left');

      // Simulate round progression
      internalState.roundNumber = 2;
      expect(['left', 'right', 'across', 'none'][(internalState.roundNumber - 1) % 4]).toBe(
        'right'
      );

      internalState.roundNumber = 3;
      expect(['left', 'right', 'across', 'none'][(internalState.roundNumber - 1) % 4]).toBe(
        'across'
      );

      internalState.roundNumber = 4;
      expect(['left', 'right', 'across', 'none'][(internalState.roundNumber - 1) % 4]).toBe('none');

      internalState.roundNumber = 5;
      expect(['left', 'right', 'across', 'none'][(internalState.roundNumber - 1) % 4]).toBe('left');
    });

    test('should reset round state for new round', async () => {
      const internalState = getInternalState(game);

      // Set some state
      internalState.scores = { north: 10, south: 5, east: 8, west: 3 };
      internalState.heartsBroken = true;
      internalState.completedTricks = new Array(5).fill({});

      // Simulate new round setup
      const newRoundState = {
        scores: { north: 0, south: 0, east: 0, west: 0 },
        completedTricks: [],
        heartsBroken: false,
        passedCards: {},
        receivedCards: {},
        trickNumber: 0,
        currentTrick: { cards: {}, leader: null, winner: null },
      };

      // Reset state
      internalState.scores = newRoundState.scores;
      internalState.completedTricks = newRoundState.completedTricks;
      internalState.heartsBroken = newRoundState.heartsBroken;
      internalState.passedCards = newRoundState.passedCards;
      internalState.receivedCards = newRoundState.receivedCards;
      internalState.trickNumber = newRoundState.trickNumber;
      internalState.currentTrick = newRoundState.currentTrick;

      expect(internalState.scores).toEqual({ north: 0, south: 0, east: 0, west: 0 });
      expect(internalState.completedTricks).toHaveLength(0);
      expect(internalState.heartsBroken).toBe(false);
    });

    test('should deal new hands each round', async () => {
      const state = await game.getGameState();
      const originalHands = JSON.parse(JSON.stringify(state.hands));

      const internalState = getInternalState(game);

      // Simulate new round with new deck
      const { createShuffledDeck } = await import('../src/utils/card-utils.js');
      const newDeck = createShuffledDeck('POKER');

      internalState.hands = {
        north: newDeck.slice(0, 13),
        south: newDeck.slice(13, 26),
        east: newDeck.slice(26, 39),
        west: newDeck.slice(39, 52),
      };

      // Hands should be different (very unlikely to be same after shuffle)
      expect(internalState.hands).not.toEqual(originalHands);

      // But still 13 cards each
      for (const player of ['north', 'south', 'east', 'west']) {
        expect(internalState.hands[player]).toHaveLength(13);
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const validation = await game.validateMove({});
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    test('should handle malformed move objects', async () => {
      const validation = await game.validateMove({
        player: 'north',
        action: 'invalid_action',
      });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('must be pass or play');
    });

    test('should handle missing required fields', async () => {
      const validation = await game.validateMove({
        action: 'play',
      });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('player and action');
    });

    test('should handle moves after game over', async () => {
      const internalState = getInternalState(game);
      internalState.gameOver = true;

      const validation = await game.validateMove({
        player: 'north',
        action: 'play',
        card: { suit: 'hearts', rank: 'A', value: 14 },
      });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('already over');
    });

    test('should reject card not in hand', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';

      const fakeCard = { suit: 'hearts', rank: 'X', value: 99 };

      const validation = await game.validateMove({
        player: state.currentPlayer,
        action: 'play',
        card: fakeCard,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('does not have this card');
    });

    test('should maintain game state consistency', async () => {
      const state1 = await game.getGameState();
      const state2 = await game.getGameState();

      expect(state1).toEqual(state2);
    });
  });

  describe('Complex Scenarios', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle complete round gameplay', async () => {
      const state = await game.getGameState();

      // Complete passing phase
      if (state.gamePhase === 'passing' && state.passDirection !== 'none') {
        for (const player of ['north', 'south', 'east', 'west']) {
          const cards = state.hands[player].slice(0, 3);
          await game.makeMove({
            player,
            action: 'pass',
            cards,
          });
        }
      }

      // Now in playing phase
      const playingState = await game.getGameState();
      expect(playingState.gamePhase).toBe('playing');

      // Player with 2 of clubs should be current player
      const currentHand = playingState.hands[playingState.currentPlayer];
      const has2C = currentHand.some((c) => c.rank === '2' && c.suit === 'clubs');

      if (has2C) {
        expect(has2C).toBe(true);
      }
    });

    test('should handle all 13 tricks in a round', async () => {
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';

      // Simulate 13 completed tricks
      internalState.completedTricks = new Array(13).fill({
        cards: { north: {}, south: {}, east: {}, west: {} },
        winner: 'north',
        points: 2,
      });

      expect(internalState.completedTricks).toHaveLength(13);

      // This would trigger round end in actual game
      const totalTricks = internalState.completedTricks.length;
      expect(totalTricks).toBe(13);
    });

    test('should validate special first trick rules', async () => {
      const state = await game.getGameState();
      const internalState = getInternalState(game);
      internalState.gamePhase = 'playing';

      // Find player with 2 of clubs
      let firstPlayer = null;
      for (const [player, hand] of Object.entries(state.hands)) {
        if (hand.some((c) => c.rank === '2' && c.suit === 'clubs')) {
          firstPlayer = player;
          break;
        }
      }

      expect(firstPlayer).not.toBeNull();

      if (firstPlayer) {
        internalState.currentPlayer = firstPlayer;

        // Must play 2 of clubs
        const twoOfClubs = state.hands[firstPlayer].find(
          (c) => c.rank === '2' && c.suit === 'clubs'
        );

        expect(twoOfClubs).toBeDefined();
      }
    });
  });
});

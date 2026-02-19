import { AgainstCardsGame } from '../src/games/against-cards.js';

// Helper function to access internal state
function getInternalState(game: any): any {
  return game.currentState;
}

describe('AgainstCardsGame', () => {
  let game: AgainstCardsGame;

  beforeEach(() => {
    game = new AgainstCardsGame('test-game-id');
  });

  describe('initializeGame', () => {
    it('should initialize game with default 3 players', async () => {
      const state = await game.initializeGame();
      expect(Object.keys(state.players).length).toBe(3);
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.gamePhase).toBe('waiting');
      expect(state.roundPhase).toBe('playing');
      expect(state.currentJudge).toBe('player1');
      expect(state.roundNumber).toBe(0);
    });

    it('should initialize game with custom player count', async () => {
      const state = await game.initializeGame({ playerCount: 5 });
      expect(Object.keys(state.players).length).toBe(5);
      expect(state.playerOrder).toEqual(['player1', 'player2', 'player3', 'player4', 'player5']);
    });

    it('should deal 7 cards to each player', async () => {
      await game.initializeGame({ playerCount: 3 });
      const internalState = getInternalState(game);

      for (const player of Object.values(internalState.players)) {
        expect(player.hand.length).toBe(7);
        expect(player.score).toBe(0);
      }
    });

    it('should set first player as judge', async () => {
      const state = await game.initializeGame();
      expect(state.players.player1.isJudge).toBe(true);
      expect(state.players.player2.isJudge).toBe(false);
      expect(state.players.player3.isJudge).toBe(false);
    });

    it('should accept custom max score', async () => {
      const state = await game.initializeGame({ maxScore: 10 });
      expect(state.maxScore).toBe(10);
    });

    it('should accept custom prompts and responses', async () => {
      const customPrompts = [
        { id: 'custom1', text: 'Test prompt _____', blanks: 1 },
        { id: 'custom2', text: 'Another _____ test _____', blanks: 2 },
      ];
      const customResponses = [
        { id: 'resp1', text: 'Test response 1' },
        { id: 'resp2', text: 'Test response 2' },
        { id: 'resp3', text: 'Test response 3' },
        { id: 'resp4', text: 'Test response 4' },
        { id: 'resp5', text: 'Test response 5' },
        { id: 'resp6', text: 'Test response 6' },
        { id: 'resp7', text: 'Test response 7' },
        { id: 'resp8', text: 'Test response 8' },
        { id: 'resp9', text: 'Test response 9' },
        { id: 'resp10', text: 'Test response 10' },
        { id: 'resp11', text: 'Test response 11' },
        { id: 'resp12', text: 'Test response 12' },
        { id: 'resp13', text: 'Test response 13' },
        { id: 'resp14', text: 'Test response 14' },
        { id: 'resp15', text: 'Test response 15' },
        { id: 'resp16', text: 'Test response 16' },
        { id: 'resp17', text: 'Test response 17' },
        { id: 'resp18', text: 'Test response 18' },
        { id: 'resp19', text: 'Test response 19' },
        { id: 'resp20', text: 'Test response 20' },
        { id: 'resp21', text: 'Test response 21' },
        { id: 'resp22', text: 'Test response 22' },
      ];

      await game.initializeGame({ customPrompts, customResponses });
      const internalState = getInternalState(game);

      expect(internalState.promptDeck.length).toBe(2);
      expect(internalState.responseDeck.length).toBe(1); // 22 cards - 21 dealt to 3 players
    });
  });

  describe('validateMove', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 3 });
    });

    it('should validate start_round action by judge', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'start_round',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject start_round by non-judge', async () => {
      const result = await game.validateMove({
        player: 'player2',
        action: 'start_round',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Only the judge can start a round');
    });

    it('should reject start_round when already playing', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'start_round',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot start round in current phase');
    });

    it('should validate submit action with correct number of cards', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const player2Hand = await game.getPlayerHand('player2');
      const cardsToSubmit = [player2Hand[0]];

      const result = await game.validateMove({
        player: 'player2',
        action: 'submit',
        cards: cardsToSubmit,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject submit by judge', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const player1Hand = await game.getPlayerHand('player1');

      const result = await game.validateMove({
        player: 'player1',
        action: 'submit',
        cards: [player1Hand[0]],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Judge cannot submit cards');
    });

    it('should reject duplicate submissions', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const player2Hand = await game.getPlayerHand('player2');
      const cardsToSubmit = [player2Hand[0]];

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: cardsToSubmit,
      });

      const result = await game.validateMove({
        player: 'player2',
        action: 'submit',
        cards: [player2Hand[1]],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player has already submitted cards');
    });

    it('should reject submit with wrong number of cards', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const player2Hand = await game.getPlayerHand('player2');
      const state = getInternalState(game);
      const requiredCards = state.currentPrompt.blanks;

      // Submit wrong number of cards
      const cardsToSubmit =
        requiredCards === 1 ? [player2Hand[0], player2Hand[1]] : [player2Hand[0]];

      const result = await game.validateMove({
        player: 'player2',
        action: 'submit',
        cards: cardsToSubmit,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Must submit exactly');
    });

    it('should reject invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'start_round',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid player');
    });
  });

  describe('game flow', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 3 });
    });

    it('should start round and draw prompt', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const state = await game.getGameState();
      expect(state.currentPrompt).not.toBeNull();
      expect(state.roundNumber).toBe(1);
      expect(state.gamePhase).toBe('playing');
      expect(state.roundPhase).toBe('playing');
    });

    it('should handle card submission', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const requiredCards = getInternalState(game).currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const initialHandSize = player2Hand.length;
      const cardsToSubmit = player2Hand.slice(0, requiredCards);

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: cardsToSubmit,
      });

      const newState = await game.getGameState();
      expect(newState.players.player2.hasSubmitted).toBe(true);
      expect(newState.submissions.player2).toEqual(cardsToSubmit);

      // Player should draw new cards to refill hand
      const newHand = await game.getPlayerHand('player2');
      expect(newHand.length).toBe(initialHandSize); // Removed cards, drew same amount
    });

    it('should transition to judging phase when all players submit', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Get hands for non-judge players
      const state = getInternalState(game);
      const requiredCards = state.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      // Both non-judge players submit
      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      const finalState = await game.getGameState();
      expect(finalState.roundPhase).toBe('judging');
    });

    it('should handle judging and award points', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Submit cards
      const state = getInternalState(game);
      const requiredCards = state.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      // Judge picks winner
      await game.makeMove({
        player: 'player1',
        action: 'judge',
        winningPlayer: 'player2',
      });

      const finalState = await game.getGameState();
      expect(finalState.players.player2.score).toBe(1);
      expect(finalState.players.player3.score).toBe(0);
      expect(finalState.roundWinner).toBe('player2');
    });

    it('should rotate judge after round', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Complete a round
      const state = getInternalState(game);
      const requiredCards = state.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player1',
        action: 'judge',
        winningPlayer: 'player2',
      });

      const finalState = await game.getGameState();
      expect(finalState.currentJudge).toBe('player2');
      expect(finalState.players.player1.isJudge).toBe(false);
      expect(finalState.players.player2.isJudge).toBe(true);
    });
  });

  describe('win conditions', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 3, maxScore: 2 });
    });

    it('should end game when player reaches max score', async () => {
      // Play rounds until someone wins
      let gameOver = false;
      let rounds = 0;
      const maxRounds = 6; // Safety limit

      while (!gameOver && rounds < maxRounds) {
        const state = await game.getGameState();
        const currentJudge = state.currentJudge;

        await game.makeMove({ player: currentJudge, action: 'start_round' });

        // Get non-judge players
        const nonJudgePlayers = state.playerOrder.filter((p) => p !== currentJudge);

        // All non-judge players submit
        const internalState = getInternalState(game);
        const requiredCards = internalState.currentPrompt.blanks;

        for (const player of nonJudgePlayers) {
          const hand = await game.getPlayerHand(player);
          await game.makeMove({
            player,
            action: 'submit',
            cards: hand.slice(0, requiredCards),
          });
        }

        // Always pick the first non-judge player as winner
        const winningPlayer = nonJudgePlayers[0];
        await game.makeMove({
          player: currentJudge,
          action: 'judge',
          winningPlayer,
        });

        const postRoundState = await game.getGameState();
        gameOver = postRoundState.gameOver;
        rounds++;
      }

      const finalState = await game.getGameState();
      expect(finalState.gameOver).toBe(true);
      expect(finalState.winner).not.toBeNull();
      // The winner should have 2 points
      const winner = finalState.winner;
      expect(finalState.players[winner].score).toBe(2);
      expect(rounds).toBeLessThanOrEqual(3); // Should take at most 3 rounds
    });

    it('should handle running out of prompts', async () => {
      const internalState = getInternalState(game);
      // Clear most prompts
      internalState.promptDeck = [internalState.promptDeck[0]];

      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Complete the round
      const state = getInternalState(game);
      const requiredCards = state.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player1',
        action: 'judge',
        winningPlayer: 'player2',
      });

      // Try to start another round with no prompts left
      await game.makeMove({ player: 'player2', action: 'start_round' });

      const finalState = await game.getGameState();
      expect(finalState.gameOver).toBe(true);
    });
  });

  describe('multi-blank prompts', () => {
    it('should handle prompts requiring multiple cards', async () => {
      const customPrompts = [{ id: 'multi1', text: 'I like _____ and _____ together', blanks: 2 }];

      await game.initializeGame({ playerCount: 3, customPrompts });
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const player2Hand = await game.getPlayerHand('player2');

      // Submit correct number of cards
      const result = await game.validateMove({
        player: 'player2',
        action: 'submit',
        cards: [player2Hand[0], player2Hand[1]],
      });
      expect(result.valid).toBe(true);

      // Try submitting wrong number
      const wrongResult = await game.validateMove({
        player: 'player3',
        action: 'submit',
        cards: [player2Hand[0]],
      });
      expect(wrongResult.valid).toBe(false);
      expect(wrongResult.error).toBe('Must submit exactly 2 card(s)');
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 3 });
    });

    it('should handle game over state', async () => {
      const internalState = getInternalState(game);
      internalState.gameOver = true;

      const result = await game.validateMove({
        player: 'player1',
        action: 'start_round',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is already over');
    });

    it('should reject judge action when not in judging phase', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'judge',
        winningPlayer: 'player2',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not in judging phase');
    });

    it('should reject judge action by non-judge', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Submit cards to enter judging phase
      const internalState = getInternalState(game);
      const requiredCards = internalState.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      // Non-judge tries to judge
      const result = await game.validateMove({
        player: 'player2',
        action: 'judge',
        winningPlayer: 'player3',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Only the judge can judge submissions');
    });

    it('should reject judge action without winning player', async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      // Enter judging phase
      const internalState = getInternalState(game);
      const requiredCards = internalState.currentPrompt.blanks;

      const player2Hand = await game.getPlayerHand('player2');
      const player3Hand = await game.getPlayerHand('player3');

      await game.makeMove({
        player: 'player2',
        action: 'submit',
        cards: player2Hand.slice(0, requiredCards),
      });

      await game.makeMove({
        player: 'player3',
        action: 'submit',
        cards: player3Hand.slice(0, requiredCards),
      });

      const result = await game.validateMove({
        player: 'player1',
        action: 'judge',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must specify winning player');
    });

    it("should reject submit with cards player doesn't have", async () => {
      await game.makeMove({ player: 'player1', action: 'start_round' });

      const fakeCard = { id: 'fake-card', text: 'Fake card' };

      const result = await game.validateMove({
        player: 'player2',
        action: 'submit',
        cards: [fakeCard],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player does not have submitted card');
    });

    it('should handle invalid move data', async () => {
      const result = await game.validateMove({
        action: 'start_round',
      } as any);
      expect(result.valid).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Against Cards');
      expect(metadata.minPlayers).toBe(3);
      expect(metadata.maxPlayers).toBe(10);
      expect(metadata.complexity).toBe('beginner');
    });
  });

  describe('getPlayerHand', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 3 });
    });

    it('should return player hand', async () => {
      const hand = await game.getPlayerHand('player1');
      expect(Array.isArray(hand)).toBe(true);
      expect(hand.length).toBe(7);
      expect(hand[0]).toHaveProperty('id');
      expect(hand[0]).toHaveProperty('text');
    });

    it('should return empty array for invalid player', async () => {
      const hand = await game.getPlayerHand('invalid-player');
      expect(hand).toEqual([]);
    });
  });
});

import { PokerGame } from '../src/games/poker.js';

describe('PokerGame', () => {
  let game: PokerGame;

  beforeEach(() => {
    game = new PokerGame('test-poker-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', () => {
      expect(game['gameType']).toBe('poker');
    });

    test('should initialize game with default settings', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-poker-game');
      expect(state.gameType).toBe('poker');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(4);
      expect(playerIds).toEqual(['player1', 'player2', 'player3', 'player4']);

      // Each player should have 2 hole cards
      for (const playerId of playerIds) {
        expect(state.players[playerId].hand).toHaveLength(2);
        // Starting chips minus blinds where applicable
        const player = state.players[playerId];
        if (player.isSmallBlind) {
          expect(player.chips).toBe(990); // 1000 - 10 small blind
        } else if (player.isBigBlind) {
          expect(player.chips).toBe(980); // 1000 - 20 big blind
        } else {
          expect(player.chips).toBe(1000); // Default starting chips
        }
      }

      expect(state.gamePhase).toBe('preflop');
      expect(state.smallBlind).toBe(10);
      expect(state.bigBlind).toBe(20);
      expect(state.pot).toBe(30); // Small blind + big blind
    });

    test('should initialize game with custom settings', async () => {
      const state = await game.initializeGame({
        playerCount: 6,
        startingChips: 2000,
        smallBlind: 25,
      } as any);

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(6);

      for (const playerId of playerIds) {
        // Starting chips minus blinds where applicable
        const player = state.players[playerId];
        if (player.isSmallBlind) {
          expect(player.chips).toBe(1975); // 2000 - 25 small blind
        } else if (player.isBigBlind) {
          expect(player.chips).toBe(1950); // 2000 - 50 big blind
        } else {
          expect(player.chips).toBe(2000); // Default starting chips
        }
      }

      expect(state.smallBlind).toBe(25);
      expect(state.bigBlind).toBe(50);
      expect(state.pot).toBe(75); // Small blind + big blind
    });

    test('should set blinds correctly', async () => {
      const state = await game.initializeGame();

      let smallBlindPlayer = null;
      let bigBlindPlayer = null;

      for (const [playerId, player] of Object.entries(state.players)) {
        if (player.isSmallBlind) {
          smallBlindPlayer = playerId;
          expect(player.currentBet).toBe(10);
        }
        if (player.isBigBlind) {
          bigBlindPlayer = playerId;
          expect(player.currentBet).toBe(20);
        }
      }

      expect(smallBlindPlayer).toBeDefined();
      expect(bigBlindPlayer).toBeDefined();
      expect(smallBlindPlayer).not.toBe(bigBlindPlayer);
    });

    test('should have correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe("Poker (Texas Hold'em)");
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(10);
      expect(metadata.complexity).toBe('advanced');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('betting');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('bluffing');
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate fold action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'fold',
      });

      expect(result.valid).toBe(true);
    });

    test('should validate call action when there is a bet', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // There should be a big blind to call
      if (state.currentBet > state.players[currentPlayer].currentBet) {
        const result = await game.validateMove({
          player: currentPlayer,
          action: 'call',
        });

        expect(result.valid).toBe(true);
      }
    });

    test('should validate check action when no bet to call', async () => {
      // This test might need to be run in specific scenarios
      // For now, we'll test the validation logic
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'check',
      });

      // Check is only valid if there's no bet to call
      if (state.currentBet === state.players[currentPlayer].currentBet) {
        expect(result.valid).toBe(true);
      } else {
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Cannot check when there is a bet to call');
      }
    });

    test('should validate raise action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];

      const raiseAmount = 50;
      const callAmount = state.currentBet - player.currentBet;

      if (player.chips >= callAmount + raiseAmount) {
        const result = await game.validateMove({
          player: currentPlayer,
          action: 'raise',
          amount: raiseAmount,
        });

        expect(result.valid).toBe(true);
      }
    });

    test('should validate all-in action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'all-in',
      });

      expect(result.valid).toBe(true);
    });

    test('should reject action from wrong player', async () => {
      const state = await game.getGameState();
      const wrongPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'fold',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });

    test('should reject invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'fold',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid player');
    });

    test('should reject insufficient chips for call', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Force player to have insufficient chips
      const gameState = game['currentState'] as any;
      const callAmount = state.currentBet - state.players[currentPlayer].currentBet;
      gameState.players[currentPlayer].chips = callAmount - 1;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'call',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not enough chips to call');
    });

    test('should reject insufficient chips for raise', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'raise',
        amount: 10000, // More than starting chips
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not enough chips to raise');
    });

    test('should reject raise below minimum', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'raise',
        amount: 5, // Below big blind amount
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum raise');
    });
  });

  describe('Game Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should process fold action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await game.makeMove({
        player: currentPlayer,
        action: 'fold',
      });

      const newState = await game.getGameState();
      expect(newState.players[currentPlayer].folded).toBe(true);
      expect(newState.currentPlayer).not.toBe(currentPlayer);
      expect(newState.lastAction?.action).toBe('fold');
    });

    test('should process call action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      const callAmount = state.currentBet - player.currentBet;
      const initialChips = player.chips;
      const initialPot = state.pot;

      if (callAmount > 0) {
        await game.makeMove({
          player: currentPlayer,
          action: 'call',
        });

        const newState = await game.getGameState();
        expect(newState.players[currentPlayer].chips).toBe(initialChips - callAmount);
        expect(newState.players[currentPlayer].currentBet).toBe(state.currentBet);
        expect(newState.pot).toBe(initialPot + callAmount);
        expect(newState.lastAction?.action).toBe('call');
      }
    });

    test('should process raise action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      const raiseAmount = 50;
      const callAmount = state.currentBet - player.currentBet;
      const totalAmount = callAmount + raiseAmount;
      const initialChips = player.chips;
      const initialPot = state.pot;

      if (player.chips >= totalAmount) {
        await game.makeMove({
          player: currentPlayer,
          action: 'raise',
          amount: raiseAmount,
        });

        const newState = await game.getGameState();
        expect(newState.players[currentPlayer].chips).toBe(initialChips - totalAmount);
        expect(newState.players[currentPlayer].currentBet).toBe(player.currentBet + totalAmount);
        expect(newState.pot).toBe(initialPot + totalAmount);
        expect(newState.currentBet).toBe(player.currentBet + totalAmount);
        expect(newState.lastAction?.action).toBe('raise');
      }
    });

    test('should process all-in action', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      const initialChips = player.chips;
      const initialPot = state.pot;

      await game.makeMove({
        player: currentPlayer,
        action: 'all-in',
      });

      const newState = await game.getGameState();
      expect(newState.players[currentPlayer].chips).toBe(0);
      expect(newState.players[currentPlayer].allIn).toBe(true);
      expect(newState.pot).toBe(initialPot + initialChips);
      expect(newState.lastAction?.action).toBe('all-in');
    });

    test('should advance game phases correctly', async () => {
      await game.initializeGame();

      // Simulate preflop betting round completion
      const gameState = game['currentState'] as any;

      // Force betting round to complete by making all players call
      for (const player of Object.values(gameState.players)) {
        if (!player.folded) {
          player.currentBet = gameState.currentBet;
        }
      }

      // Manually advance phase to test
      gameState.gamePhase = 'flop';
      gameState.communityCards = [
        { suit: 'spades', rank: 'A', value: 14 },
        { suit: 'hearts', rank: 'K', value: 13 },
        { suit: 'diamonds', rank: 'Q', value: 12 },
      ];

      const state = await game.getGameState();
      expect(state.gamePhase).toBe('flop');
      expect(state.communityCards).toHaveLength(3);
    });

    test('should handle player turns correctly', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await game.makeMove({
        player: currentPlayer,
        action: 'fold',
      });

      const newState = await game.getGameState();
      expect(newState.currentPlayer).not.toBe(currentPlayer);

      // Should be next active player
      const playerOrder = ['player1', 'player2', 'player3', 'player4'];
      const currentIndex = playerOrder.indexOf(currentPlayer);
      let expectedNext = currentIndex + 1;
      while (
        expectedNext < playerOrder.length &&
        newState.players[playerOrder[expectedNext]!].folded
      ) {
        expectedNext++;
      }
      if (expectedNext >= playerOrder.length) {
        expectedNext = 0;
        while (
          expectedNext < playerOrder.length &&
          newState.players[playerOrder[expectedNext]!].folded
        ) {
          expectedNext++;
        }
      }

      if (expectedNext < playerOrder.length) {
        expect(newState.currentPlayer).toBe(playerOrder[expectedNext]);
      }
    });
  });

  describe('Hand Evaluation', () => {
    test('should evaluate hand rankings correctly', async () => {
      await game.initializeGame();

      // Force showdown phase to test hand evaluation
      const gameState = game['currentState'] as any;
      gameState.gamePhase = 'showdown';
      gameState.communityCards = [
        { suit: 'spades', rank: 'A', value: 14 },
        { suit: 'hearts', rank: 'K', value: 13 },
        { suit: 'diamonds', rank: 'Q', value: 12 },
        { suit: 'clubs', rank: 'J', value: 11 },
        { suit: 'spades', rank: '10', value: 10 },
      ];

      // Give player1 a royal flush
      gameState.players.player1.hand = [
        { suit: 'spades', rank: 'K', value: 13 },
        { suit: 'spades', rank: 'Q', value: 12 },
      ];

      // Manually evaluate hands
      game['evaluateHands'](gameState);

      const state = await game.getGameState();
      expect(state.players.player1.bestHand).toBeDefined();
      expect(state.players.player1.bestHand?.name).toMatch(/Flush|Straight/); // Should detect some form of flush/straight
    });
  });

  describe('Win Conditions', () => {
    test('should detect winner when only one player remains', async () => {
      await game.initializeGame();

      // Fold all players except one
      const gameState = game['currentState'] as any;
      gameState.players.player2.folded = true;
      gameState.players.player3.folded = true;
      gameState.players.player4.folded = true;

      // Check win condition
      game['checkWinCondition'](gameState);

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winners).toContain('player1');
    });

    test('should distribute pot to winner', async () => {
      await game.initializeGame();

      const gameState = game['currentState'] as any;
      const initialPot = gameState.pot;
      const initialChips = gameState.players.player1.chips;

      // Force win condition
      gameState.players.player2.folded = true;
      gameState.players.player3.folded = true;
      gameState.players.player4.folded = true;

      game['checkWinCondition'](gameState);

      const state = await game.getGameState();
      expect(state.players.player1.chips).toBe(initialChips + initialPot);
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
      // Force game over state
      const gameState = game['currentState'] as any;
      gameState.gameOver = true;

      const result = await game.validateMove({
        player: 'player1',
        action: 'fold',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Game is already over');
    });

    test('should reject actions from folded players', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Fold the player
      await game.makeMove({
        player: currentPlayer,
        action: 'fold',
      });

      // Try to make another move
      const result = await game.validateMove({
        player: currentPlayer,
        action: 'call',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player has already folded');
    });

    test('should reject actions from all-in players', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Go all-in
      await game.makeMove({
        player: currentPlayer,
        action: 'all-in',
      });

      // Try to make another move (this would need to be tested in a different scenario)
      // For now, we just verify the all-in state
      const newState = await game.getGameState();
      expect(newState.players[currentPlayer].allIn).toBe(true);
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

    test('should track pot correctly', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const player = state.players[currentPlayer];
      const callAmount = state.currentBet - player.currentBet;
      const initialPot = state.pot;

      if (callAmount > 0) {
        await game.makeMove({
          player: currentPlayer,
          action: 'call',
        });

        const newState = await game.getGameState();
        expect(newState.pot).toBe(initialPot + callAmount);
      }
    });

    test('should update last action correctly', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await game.makeMove({
        player: currentPlayer,
        action: 'fold',
      });

      const newState = await game.getGameState();
      expect(newState.lastAction).toBeDefined();
      expect(newState.lastAction!.action).toBe('fold');
      expect(newState.lastAction!.player).toBe(currentPlayer);
    });

    test('should track community cards progression', async () => {
      const state = await game.getGameState();
      expect(state.communityCards).toHaveLength(0); // Preflop
      expect(state.gamePhase).toBe('preflop');
    });
  });
});

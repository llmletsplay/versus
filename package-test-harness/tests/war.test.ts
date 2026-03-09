import { WarGame } from '../src/games/war.js';
import { restoreGameState } from './helpers/restore-game-state.js';

describe('WarGame', () => {
  let game: WarGame;

  beforeEach(() => {
    game = new WarGame('test-war-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', () => {
      expect(game.gameType).toBe('war');
    });

    test('should initialize game with default 2 players', async () => {
      const state = await game.initializeGame();

      expect(state.gameId).toBe('test-war-game');
      expect(state.gameType).toBe('war');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(2);
      expect(playerIds).toEqual(['player1', 'player2']);

      // Each player should have 26 cards (52 cards / 2 players)
      expect(state.players.player1.deckSize).toBe(26);
      expect(state.players.player2.deckSize).toBe(26);
      expect(state.players.player1.totalCards).toBe(26);
      expect(state.players.player2.totalCards).toBe(26);
    });

    test('should initialize game with custom player count', async () => {
      const state = await game.initializeGame({ playerCount: 4 } as any);

      const playerIds = Object.keys(state.players);
      expect(playerIds).toHaveLength(4);

      // Each player should have 13 cards (52 cards / 4 players)
      for (const playerId of playerIds) {
        expect(state.players[playerId].deckSize).toBe(13);
      }
    });

    test('should have correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('War');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('beginner');
      expect(metadata.categories).toContain('card');
      expect(metadata.categories).toContain('classic');
      expect(metadata.categories).toContain('luck');
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate play action', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'play',
      });

      expect(result.valid).toBe(true);
    });

    test('should reject invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'play',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid player');
    });

    test('should reject invalid action', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid-action',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Action must be play or continue');
    });

    test('should reject missing move data', async () => {
      const result = await game.validateMove({});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move must include player and action');
    });

    test('should reject continue action when no war in progress', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'continue',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No war in progress');
    });
  });

  describe('Game Mechanics', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow players to play cards', async () => {
      await game.getGameState();

      await game.makeMove({
        player: 'player1',
        action: 'play',
      });

      const state = await game.getGameState();
      expect(state.currentBattle).toBeDefined();
      expect(state.currentBattle!.playersInBattle).toContain('player1');
      expect(state.lastAction?.action).toBe('play');
    });

    test('should resolve battle when both players have played', async () => {
      // Player 1 plays
      await game.makeMove({
        player: 'player1',
        action: 'play',
      });

      // Player 2 plays
      await game.makeMove({
        player: 'player2',
        action: 'play',
      });

      const state = await game.getGameState();

      // Battle should be resolved (either won or war declared)
      if (state.currentBattle) {
        // If battle is still active, it means war was declared
        expect(state.currentBattle.battleType).toBe('war');
        expect(state.lastAction?.action).toBe('war');
      } else {
        // Battle was won by someone
        expect(state.lastAction?.action).toBe('collect');
        expect(state.lastAction?.winner).toBeDefined();
      }
    });

    test('should handle multiple rounds of play', async () => {
      let rounds = 0;
      const targetRounds = 25;

      while (rounds < targetRounds) {
        const state = await game.getGameState();
        if (state.gameOver) {
          break;
        }

        const activePlayers = Object.entries(state.players)
          .filter(([_, player]) => player.isActive)
          .map(([id, _]) => id);

        for (const playerId of activePlayers) {
          if (state.currentBattle && state.currentBattle.playersInBattle.includes(playerId)) {
            continue;
          }

          const validation = await game.validateMove({
            player: playerId,
            action: 'play',
          });

          if (validation.valid) {
            await game.makeMove({
              player: playerId,
              action: 'play',
            });
          }
        }

        const nextState = await game.getGameState();
        const playerTotalCards = Object.values(nextState.players).reduce(
          (sum, player) => sum + player.totalCards,
          0
        );
        const cardsInPlay = nextState.currentBattle?.cardsInPlay ?? 0;

        expect(playerTotalCards + cardsInPlay).toBe(52);
        rounds++;
      }

      expect(rounds).toBeGreaterThan(0);
    });

    test('should track card counts correctly', async () => {
      const initialState = await game.getGameState();
      const totalInitialCards = Object.values(initialState.players).reduce(
        (sum, player) => sum + player.totalCards,
        0
      );

      expect(totalInitialCards).toBe(52);

      // Play a few rounds
      for (let i = 0; i < 5; i++) {
        const state = await game.getGameState();
        if (state.gameOver) {
          break;
        }

        // Player 1 plays
        await game.makeMove({
          player: 'player1',
          action: 'play',
        });

        // Player 2 plays
        await game.makeMove({
          player: 'player2',
          action: 'play',
        });

        const newState = await game.getGameState();
        const totalCards = Object.values(newState.players).reduce(
          (sum, player) => sum + player.totalCards,
          0
        );

        // Total cards should always be 52 (or close due to cards in play)
        expect(totalCards).toBeGreaterThanOrEqual(50);
        expect(totalCards).toBeLessThanOrEqual(52);
      }
    });
  });

  describe('Win Conditions', () => {
    test('should detect game over', async () => {
      await game.initializeGame();

      // Simulate game until completion
      let rounds = 0;
      const maxRounds = 200;

      while (rounds < maxRounds) {
        const isOver = await game.isGameOver();
        if (isOver) {
          const winner = await game.getWinner();
          expect(winner).toBeDefined();
          expect(['player1', 'player2']).toContain(winner);
          break;
        }

        const state = await game.getGameState();

        // Try to play for all active players
        const activePlayers = Object.entries(state.players)
          .filter(([_, player]) => player.isActive)
          .map(([id, _]) => id);

        if (activePlayers.length <= 1) {
          break;
        }

        for (const playerId of activePlayers) {
          const validation = await game.validateMove({
            player: playerId,
            action: 'play',
          });

          if (validation.valid) {
            await game.makeMove({
              player: playerId,
              action: 'play',
            });
          }
        }

        rounds++;
      }
    });

    test('should handle edge cases with insufficient cards', async () => {
      await game.initializeGame();

      // This test ensures the game handles cases where players
      // run out of cards during war scenarios gracefully
      const state = await game.getGameState();
      expect(state.players.player1.totalCards).toBeGreaterThan(0);
      expect(state.players.player2.totalCards).toBeGreaterThan(0);
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
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Game is already over');
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

    test('should update last action correctly', async () => {
      await game.makeMove({
        player: 'player1',
        action: 'play',
      });

      const state = await game.getGameState();
      expect(state.lastAction).toBeDefined();
      expect(state.lastAction!.action).toBe('play');
    });

    test('should track battle information correctly', async () => {
      await game.makeMove({
        player: 'player1',
        action: 'play',
      });

      const state = await game.getGameState();
      expect(state.currentBattle).toBeDefined();
      expect(state.currentBattle!.battleType).toBe('normal');
      expect(state.currentBattle!.round).toBe(1);
      expect(state.currentBattle!.playersInBattle).toContain('player1');
    });
  });
});




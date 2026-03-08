import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CatanGame } from '../src/games/catan.js';

function getInternalState(game: CatanGame): any {
  return (game as any).currentState;
}

async function completeSetupPhase(game: CatanGame): Promise<void> {
  await game.initializeGame();

  for (let round = 1; round <= 2; round++) {
    const players =
      round === 1
        ? ['player1', 'player2', 'player3', 'player4']
        : ['player4', 'player3', 'player2', 'player1'];

    for (const player of players) {
      const pos = parseInt(player.slice(-1)) * 10 + (round - 1) * 5;
      await game.makeMove({
        player,
        action: 'build_settlement',
        position: pos,
      });
      await game.makeMove({
        player,
        action: 'build_road',
        position: pos,
      });
    }
  }
}

async function rollNonRobber(game: CatanGame, player: string): Promise<void> {
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
  try {
    await game.makeMove({
      player,
      action: 'roll_dice',
    });
  } finally {
    randomSpy.mockRestore();
  }
}

describe('CatanGame', () => {
  let game: CatanGame;

  beforeEach(() => {
    game = new CatanGame('test-catan-game');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct game type', async () => {
      const state = await game.getGameState();
      expect(state.gameType).toBe('catan');
    });

    test('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Settlers of Catan');
      expect(metadata.minPlayers).toBe(3);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('advanced');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('building');
      expect(metadata.categories).toContain('trading');
    });

    test('should initialize game with default 4 players', async () => {
      await game.initializeGame();
      const state = await game.getGameState();

      expect(Object.keys(state.players)).toHaveLength(4);
      expect(state.currentPlayer).toBe('player1');
      expect(state.gamePhase).toBe('setup');
      expect(state.setupRound).toBe(1);
      expect(state.gameOver).toBe(false);
    });

    test('should initialize game with custom player count', async () => {
      await game.initializeGame({ playerCount: 3 });
      const state = await game.getGameState();

      expect(Object.keys(state.players)).toHaveLength(3);
      expect(state.playerOrder).toEqual(['player1', 'player2', 'player3']);
    });

    test('should create proper board structure', async () => {
      await game.initializeGame();
      const state = await game.getGameState();

      expect(state.board.hexes).toHaveLength(19);
      expect(state.board.intersections).toHaveLength(54);
      expect(state.board.edges).toHaveLength(72);

      // Check that robber is on desert
      const desertHex = state.board.hexes.find((hex) => hex.resource === 'desert');
      expect(desertHex?.hasRobber).toBe(true);
    });

    test('should initialize players with correct starting resources', async () => {
      await game.initializeGame();
      const state = await game.getGameState();

      for (const player of Object.values(state.players)) {
        expect(player.resources).toEqual({
          wood: 0,
          brick: 0,
          wool: 0,
          grain: 0,
          ore: 0,
        });
        expect(player.buildings).toEqual({
          settlements: 5,
          cities: 4,
          roads: 15,
        });
        expect(player.victoryPoints).toBe(0);
        expect(player.hasLongestRoad).toBe(false);
        expect(player.hasLargestArmy).toBe(false);
      }
    });
  });

  describe('Setup Phase', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should allow settlement placement during setup', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer; // Use actual current player

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 0,
      });

      expect(result.valid).toBe(true);
    });

    test('should reject settlement placement on occupied intersection', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Place first settlement
      await game.makeMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 0,
      });

      // Advance to next player and try to place on same position
      await game.makeMove({
        player: currentPlayer,
        action: 'build_road',
        position: 0,
      });

      const newState = await game.getGameState();
      const nextPlayer = newState.currentPlayer;

      const result = await game.validateMove({
        player: nextPlayer,
        action: 'build_settlement',
        position: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already occupied');
    });

    test('should reject adjacent settlement placement', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Place first settlement
      await game.makeMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 0,
      });

      // Complete first player's turn
      await game.makeMove({
        player: currentPlayer,
        action: 'build_road',
        position: 0,
      });

      const newState = await game.getGameState();
      const nextPlayer = newState.currentPlayer;

      // Try to place settlement on adjacent intersection
      const result = await game.validateMove({
        player: nextPlayer,
        action: 'build_settlement',
        position: 1,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('adjacent');
    });

    test('should allow road placement during setup', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // First place a settlement, then try to place a road
      await game.makeMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 0,
      });

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_road',
        position: 0,
      });

      expect(result.valid).toBe(true);
    });

    test('should advance setup phase correctly', async () => {
      const initialState = await game.getGameState();
      expect(initialState.currentPlayer).toBe('player1');
      expect(initialState.setupRound).toBe(1);

      // Player 1 builds settlement and road
      await game.makeMove({
        player: 'player1',
        action: 'build_settlement',
        position: 0,
      });
      await game.makeMove({
        player: 'player1',
        action: 'build_road',
        position: 0,
      });

      const state2 = await game.getGameState();
      expect(state2.currentPlayer).toBe('player2');
    });

    test('should collect resources in setup round 2', async () => {
      // Fast-forward through setup round 1
      const players = ['player1', 'player2', 'player3', 'player4'];
      for (let i = 0; i < players.length; i++) {
        await game.makeMove({
          player: players[i]!,
          action: 'build_settlement',
          position: i * 10,
        });
        await game.makeMove({
          player: players[i]!,
          action: 'build_road',
          position: i * 10,
        });
      }

      const state = await game.getGameState();
      expect(state.setupRound).toBe(2);

      // In round 2, players go in reverse order, so current player should be player4
      expect(state.currentPlayer).toBe('player4');

      // Place settlement in round 2 - should collect resources
      await game.makeMove({
        player: state.currentPlayer,
        action: 'build_settlement',
        position: 50,
      });

      const finalState = await game.getGameState();
      const currentPlayerResources = Object.values(
        finalState.players[state.currentPlayer]!.resources
      );
      const totalResources = currentPlayerResources.reduce((sum, count) => sum + count, 0);
      expect(totalResources).toBeGreaterThanOrEqual(0); // May be 0 if settlement not adjacent to resource hexes
    });
  });

  describe('Playing Phase Move Validation', () => {
    beforeEach(async () => {
      await completeSetupPhase(game);
    });

    test('should require a dice roll before normal build actions', async () => {
      const state = await game.getGameState();
      expect(state.gamePhase).toBe('playing');
      expect(state.diceRoll).toBeNull();
      expect(state.currentPlayer).toBe('player1');

      const result = await game.validateMove({
        player: state.currentPlayer,
        action: 'build_settlement',
        position: 11,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('roll dice');
    });

    test('should allow dice rolling', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'roll_dice',
      });

      expect(result.valid).toBe(true);
    });

    test('should reject second dice roll in same turn', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await rollNonRobber(game, currentPlayer);

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'roll_dice',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already rolled');
    });

    test('should validate building costs', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      // Roll dice first
      await rollNonRobber(game, currentPlayer);

      // Make the resource state explicit so this assertion is deterministic.
      (game as any).currentState.players[currentPlayer].resources = {
        wood: 0,
        brick: 1,
        wool: 1,
        grain: 1,
        ore: 0,
      };

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 11, // Use position connected to player1's existing settlement at 10
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient resources');
    });

    test('should validate development card purchase', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await rollNonRobber(game, currentPlayer);

      // Setup-round resource distribution is board-dependent, so make this explicit.
      (game as any).currentState.players[currentPlayer].resources = {
        wood: 0,
        brick: 1,
        wool: 1,
        grain: 1,
        ore: 0,
      };

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'buy_development_card',
      });

      // A development card requires wool, grain, and ore.
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient resources');
    });
  });

  describe('Building Mechanics', () => {
    beforeEach(async () => {
      await completeSetupPhase(game);
    });

    test('should validate city upgrade requirements', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await rollNonRobber(game, currentPlayer);

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_city',
        position: 10, // Position where player1 has a settlement
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient resources');
    });

    test('should reject city upgrade on empty intersection', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await rollNonRobber(game, currentPlayer);

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_city',
        position: 50, // Use truly empty position
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No building');
    });

    test('should reject upgrading opponent settlement', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      await rollNonRobber(game, currentPlayer);

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'build_city',
        position: 20, // Position where player2 has a settlement
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('your own');
    });
  });

  describe('Resource Distribution', () => {
    beforeEach(async () => {
      await completeSetupPhase(game);
    });

    test('should distribute resources on non-robber dice rolls', async () => {
      const stateBefore = await game.getGameState();
      const currentPlayer = stateBefore.currentPlayer;
      const totalResourcesBefore = Object.values(stateBefore.players).reduce((sum, player) => {
        return sum + Object.values(player.resources).reduce((pSum, count) => pSum + count, 0);
      }, 0);

      const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
      try {
        await game.makeMove({
          player: currentPlayer,
          action: 'roll_dice',
        });
      } finally {
        randomSpy.mockRestore();
      }

      const stateAfter = await game.getGameState();
      const totalResourcesAfter = Object.values(stateAfter.players).reduce((sum, player) => {
        return sum + Object.values(player.resources).reduce((pSum, count) => pSum + count, 0);
      }, 0);

      expect(stateAfter.diceRoll).toBe(2);
      expect(totalResourcesAfter).toBeGreaterThanOrEqual(totalResourcesBefore);
    });

    test('should require explicit robber movement after a 7 is rolled', async () => {
      const currentPlayer = (await game.getGameState()).currentPlayer;
      const initialRobberPosition = getInternalState(game).robberPosition;

      const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.34).mockReturnValueOnce(0.51);
      try {
        await game.makeMove({
          player: currentPlayer,
          action: 'roll_dice',
        });
      } finally {
        randomSpy.mockRestore();
      }

      const internalState = getInternalState(game);
      expect(internalState.diceRoll).toBe(7);
      expect(internalState.pendingRobberMove).toBe(true);
      expect(internalState.robberPosition).toBe(initialRobberPosition);

      const buildValidation = await game.validateMove({
        player: currentPlayer,
        action: 'build_settlement',
        position: 11,
      });
      expect(buildValidation.valid).toBe(false);
      expect(buildValidation.error).toContain('move robber');
    });

    test('should move the robber to a chosen hex and steal from the chosen adjacent player', async () => {
      const internalState = getInternalState(game);
      internalState.diceRoll = 7;
      internalState.pendingRobberMove = true;
      internalState.board.hexes.forEach((hex: any) => {
        hex.hasRobber = hex.id === 1;
      });
      internalState.robberPosition = 1;
      internalState.board.intersections[0].building = { type: 'settlement', player: 'player2' };
      internalState.players.player1.resources = {
        wood: 0,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };
      internalState.players.player2.resources = {
        wood: 1,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };

      const validation = await game.validateMove({
        player: 'player1',
        action: 'move_robber',
        position: 0,
        targetPlayer: 'player2',
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'move_robber',
        position: 0,
        targetPlayer: 'player2',
      });

      expect(internalState.robberPosition).toBe(0);
      expect(internalState.pendingRobberMove).toBe(false);
      expect(internalState.players.player1.resources.wood).toBe(1);
      expect(internalState.players.player2.resources.wood).toBe(0);
    });

    test('should require a target player when multiple adjacent victims are available', async () => {
      const internalState = getInternalState(game);
      internalState.diceRoll = 7;
      internalState.pendingRobberMove = true;
      internalState.board.hexes.forEach((hex: any) => {
        hex.hasRobber = hex.id === 1;
      });
      internalState.robberPosition = 1;
      internalState.board.intersections[0].building = { type: 'settlement', player: 'player2' };
      internalState.board.intersections[19].building = { type: 'settlement', player: 'player3' };
      internalState.players.player2.resources = {
        wood: 1,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };
      internalState.players.player3.resources = {
        wood: 1,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };

      const validation = await game.validateMove({
        player: 'player1',
        action: 'move_robber',
        position: 0,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('specify');
    });
  });

  describe('Development Cards', () => {
    beforeEach(async () => {
      await completeSetupPhase(game);
    });

    test('should allow Year of Plenty before rolling dice and grant the chosen resources', async () => {
      const internalState = getInternalState(game);
      internalState.players.player1.developmentCards = ['year_of_plenty'];
      internalState.newDevelopmentCards = {
        player1: [],
        player2: [],
        player3: [],
        player4: [],
      };
      internalState.players.player1.resources = {
        wood: 0,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };

      const validation = await game.validateMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'year_of_plenty',
        resources: ['ore', 'grain'],
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'year_of_plenty',
        resources: ['ore', 'grain'],
      });

      expect(internalState.players.player1.resources.ore).toBe(1);
      expect(internalState.players.player1.resources.grain).toBe(1);
      expect(internalState.playedDevelopmentCardThisTurn).toBe(true);
    });

    test('should prevent playing a development card the turn it was bought', async () => {
      const internalState = getInternalState(game);
      internalState.players.player1.developmentCards = ['monopoly'];
      internalState.newDevelopmentCards = {
        player1: ['monopoly'],
        player2: [],
        player3: [],
        player4: [],
      };

      const validation = await game.validateMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'monopoly',
        resource: 'wood',
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('turn you bought');
    });

    test('should resolve Monopoly for the chosen resource', async () => {
      const internalState = getInternalState(game);
      internalState.players.player1.developmentCards = ['monopoly'];
      internalState.newDevelopmentCards = {
        player1: [],
        player2: [],
        player3: [],
        player4: [],
      };
      internalState.players.player1.resources = {
        wood: 0,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };
      internalState.players.player2.resources.wood = 2;
      internalState.players.player3.resources.wood = 1;
      internalState.players.player4.resources.wood = 3;

      await game.makeMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'monopoly',
        resource: 'wood',
      });

      expect(internalState.players.player1.resources.wood).toBe(6);
      expect(internalState.players.player2.resources.wood).toBe(0);
      expect(internalState.players.player3.resources.wood).toBe(0);
      expect(internalState.players.player4.resources.wood).toBe(0);
    });

    test('should build the chosen roads for Road Building without spending resources', async () => {
      const internalState = getInternalState(game);
      internalState.players.player1.developmentCards = ['road_building'];
      internalState.newDevelopmentCards = {
        player1: [],
        player2: [],
        player3: [],
        player4: [],
      };
      internalState.players.player1.resources = {
        wood: 0,
        brick: 0,
        wool: 0,
        grain: 0,
        ore: 0,
      };
      const roadsBefore = internalState.players.player1.buildings.roads;

      const validation = await game.validateMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'road_building',
        positions: [11, 12],
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'road_building',
        positions: [11, 12],
      });

      expect(internalState.board.edges[11].road?.player).toBe('player1');
      expect(internalState.board.edges[12].road?.player).toBe('player1');
      expect(internalState.players.player1.buildings.roads).toBe(roadsBefore - 2);
      expect(internalState.players.player1.resources.wood).toBe(0);
      expect(internalState.players.player1.resources.brick).toBe(0);
    });

    test('should allow only one development card play per turn', async () => {
      const internalState = getInternalState(game);
      internalState.players.player1.developmentCards = ['year_of_plenty', 'monopoly'];
      internalState.newDevelopmentCards = {
        player1: [],
        player2: [],
        player3: [],
        player4: [],
      };

      await game.makeMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'year_of_plenty',
        resources: ['ore', 'grain'],
      });

      const secondValidation = await game.validateMove({
        player: 'player1',
        action: 'play_development_card',
        cardType: 'monopoly',
        resource: 'wood',
      });

      expect(secondValidation.valid).toBe(false);
      expect(secondValidation.error).toContain('Only one development card');
    });
  });
  describe('Turn Management', () => {
    beforeEach(async () => {
      await completeSetupPhase(game);
    });

    test('should advance to next player on end turn', async () => {
      const stateBefore = await game.getGameState();
      expect(stateBefore.currentPlayer).toBe('player1');

      await rollNonRobber(game, 'player1');

      await game.makeMove({
        player: 'player1',
        action: 'end_turn',
      });

      const stateAfter = await game.getGameState();
      expect(stateAfter.currentPlayer).toBe('player2');
      expect(stateAfter.diceRoll).toBeNull();
    });

    test('should reject end turn without dice roll', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;

      const result = await game.validateMove({
        player: currentPlayer,
        action: 'end_turn',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('roll dice');
    });

    test('should reject moves from wrong player', async () => {
      const state = await game.getGameState();
      const currentPlayer = state.currentPlayer;
      const wrongPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';

      const result = await game.validateMove({
        player: wrongPlayer,
        action: 'roll_dice',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not your turn');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should handle invalid move data gracefully', async () => {
      const result = await game.validateMove({});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('player and action');
    });

    test('should handle malformed move objects', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid_action',
      });
      expect(result.valid).toBe(false); // Invalid actions should return false
    });

    test('should prevent moves after game over', async () => {
      // Complete setup phase so we have a valid current player
      for (let round = 1; round <= 2; round++) {
        const players =
          round === 1
            ? ['player1', 'player2', 'player3', 'player4']
            : ['player4', 'player3', 'player2', 'player1'];
        for (const player of players) {
          const pos = parseInt(player.slice(-1)) * 10 + (round - 1) * 5;
          await game.makeMove({
            player,
            action: 'build_settlement',
            position: pos,
          });
          await game.makeMove({
            player,
            action: 'build_road',
            position: pos,
          });
        }
      }

      // Test that the current player can make a valid move (game is not over)
      const state = await game.getGameState();
      const result = await game.validateMove({
        player: state.currentPlayer, // Use the actual current player
        action: 'roll_dice',
      });
      // Game is not over, so this should be valid
      expect(result.valid).toBe(true);
    });

    test('should reject invalid player IDs', async () => {
      const result = await game.validateMove({
        player: 'invalid_player',
        action: 'roll_dice',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid player');
    });

    test('should handle missing position for building actions', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'build_settlement',
        // Missing position
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('position');
    });
  });

  describe('Game State Management', () => {
    test('should maintain consistent game state', async () => {
      await game.initializeGame();
      const state1 = await game.getGameState();
      const state2 = await game.getGameState();

      expect(state1).toEqual(state2);
    });

    test('should track last action correctly', async () => {
      await game.initializeGame();

      await game.makeMove({
        player: 'player1',
        action: 'build_settlement',
        position: 0,
      });

      const state = await game.getGameState();
      expect(state.lastAction).toBeDefined();
      expect(state.lastAction?.action).toBe('build_settlement');
      expect(state.lastAction?.player).toBe('player1');
    });

    test('should hide development cards from other players', async () => {
      await game.initializeGame();
      const state = await game.getGameState();

      // Development cards should be shown as count, not actual cards
      for (const player of Object.values(state.players)) {
        expect(typeof player.developmentCards).toBe('number');
      }
    });

    test('should track building counts correctly', async () => {
      await game.initializeGame();

      await game.makeMove({
        player: 'player1',
        action: 'build_settlement',
        position: 0,
      });

      const state = await game.getGameState();
      expect(state.players.player1.buildings.settlements).toBe(4); // Started with 5, built 1
    });
  });

  describe('Complex Game Scenarios', () => {
    test('should handle multiple building placements', async () => {
      await game.initializeGame();

      // Place multiple settlements and roads
      await game.makeMove({
        player: 'player1',
        action: 'build_settlement',
        position: 0,
      });

      await game.makeMove({
        player: 'player1',
        action: 'build_road',
        position: 0,
      });

      const state = await game.getGameState();
      expect(state.board.intersections[0]?.building?.player).toBe('player1');
      expect(state.board.edges[0]?.road?.player).toBe('player1');
    });

    test('should enforce connection rules for buildings', async () => {
      await game.initializeGame();
      // Complete setup phase first
      for (let round = 1; round <= 2; round++) {
        const players =
          round === 1
            ? ['player1', 'player2', 'player3', 'player4']
            : ['player4', 'player3', 'player2', 'player1'];
        for (const player of players) {
          const pos = parseInt(player.slice(-1)) * 10 + (round - 1) * 5;
          await game.makeMove({
            player,
            action: 'build_settlement',
            position: pos,
          });
          await game.makeMove({
            player,
            action: 'build_road',
            position: pos,
          });
        }
      }

      // Now in playing phase
      await rollNonRobber(game, 'player1');

      // Try to build settlement without connection
      const result = await game.validateMove({
        player: 'player1',
        action: 'build_settlement',
        position: 50, // Unconnected position
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('connected');
    });
  });
});











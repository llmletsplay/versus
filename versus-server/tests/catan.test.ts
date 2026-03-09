import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CatanGame } from '../src/games/catan.js';
import { restoreGameState } from './helpers/restore-game-state.js';

type Resource = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';

type RoadPath = {
  edges: number[];
  intersections: number[];
};

type PortType = Resource | 'three_for_one';

const ROAD_COST = { wood: 1, brick: 1 };
const SETTLEMENT_COST = { wood: 1, brick: 1, wool: 1, grain: 1 };

function getInternalState(game: CatanGame): any {
  return (game as any).currentState;
}

function createResources(overrides: Partial<Record<Resource, number>> = {}) {
  return {
    wood: 0,
    brick: 0,
    wool: 0,
    grain: 0,
    ore: 0,
    ...overrides,
  };
}

function totalResources(resources: Record<Resource, number>): number {
  return Object.values(resources).reduce((sum, count) => sum + count, 0);
}

function getIncidentEdges(state: any, intersectionId: number): any[] {
  return state.board.edges.filter((edge: any) => edge.adjacentIntersections.includes(intersectionId));
}

function findEdgeBetweenIntersections(state: any, a: number, b: number): number {
  const edge = state.board.edges.find((candidate: any) => {
    return (
      candidate.adjacentIntersections.includes(a) && candidate.adjacentIntersections.includes(b)
    );
  });

  if (!edge) {
    throw new Error(`No edge connects intersections ${a} and ${b}`);
  }

  return edge.id;
}

function placeSettlement(state: any, playerId: string, intersectionId: number): void {
  state.board.intersections[intersectionId].building = { type: 'settlement', player: playerId };
  state.players[playerId].buildings.settlements -= 1;
  state.players[playerId].victoryPoints += 1;
}

function placeRoad(state: any, playerId: string, edgeId: number): void {
  state.board.edges[edgeId].road = { player: playerId };
  state.players[playerId].buildings.roads -= 1;
}

async function seedCatan(game: CatanGame, mutate: (state: any) => void): Promise<void> {
  await game.initializeGame();
  const state = structuredClone(getInternalState(game));
  mutate(state);
  await restoreGameState(game, state);
}

async function seedPlayingState(game: CatanGame, mutate: (state: any) => void): Promise<void> {
  await seedCatan(game, (state) => {
    state.gamePhase = 'playing';
    state.setupRound = 2;
    state.currentPlayer = 'player1';
    state.diceRoll = null;
    state.pendingRobberMove = false;
    state.pendingDiscards = {};
    state.robberTriggeringPlayer = null;
    state.playedDevelopmentCardThisTurn = false;
    state.newDevelopmentCards = {
      player1: [],
      player2: [],
      player3: [],
      player4: [],
    };
    delete state.setupPhaseState;
    mutate(state);
  });
}

async function findFirstLegalPosition(
  game: CatanGame,
  player: string,
  action: 'build_settlement' | 'build_road'
): Promise<number> {
  const state = await game.getGameState();
  const positions = action === 'build_road' ? state.board.edges : state.board.intersections;

  for (const position of positions) {
    const result = await game.validateMove({ player, action, position: position.id });
    if (result.valid) {
      return position.id;
    }
  }

  throw new Error(`Could not find a legal ${action} position for ${player}`);
}

async function findFirstPositionWithError(
  game: CatanGame,
  player: string,
  action: 'build_settlement' | 'build_road',
  errorSnippet: string
): Promise<number> {
  const state = await game.getGameState();
  const positions = action === 'build_road' ? state.board.edges : state.board.intersections;

  for (const position of positions) {
    const result = await game.validateMove({ player, action, position: position.id });
    if (!result.valid && result.error?.includes(errorSnippet)) {
      return position.id;
    }
  }

  throw new Error(`Could not find a ${action} position that fails with ${errorSnippet}`);
}

async function completeSetupPhase(game: CatanGame): Promise<void> {
  await game.initializeGame();

  while ((await game.getGameState()).gamePhase === 'setup') {
    const state = await game.getGameState();
    const player = state.currentPlayer;
    const settlementPosition = await findFirstLegalPosition(game, player, 'build_settlement');
    await game.makeMove({
      player,
      action: 'build_settlement',
      position: settlementPosition,
    });

    const roadPosition = await findFirstLegalPosition(game, player, 'build_road');
    await game.makeMove({
      player,
      action: 'build_road',
      position: roadPosition,
    });
  }
}

function findSettlementConflictCandidate(state: any): {
  candidateId: number;
  blockedId: number;
  supportEdgeId: number;
  supportIntersectionId: number;
} {
  for (const candidate of state.board.intersections) {
    for (const blockedId of candidate.adjacentIntersections) {
      for (const edge of getIncidentEdges(state, candidate.id)) {
        const supportIntersectionId = edge.adjacentIntersections.find(
          (id: number) => id !== candidate.id
        );
        if (supportIntersectionId !== undefined && supportIntersectionId !== blockedId) {
          return {
            candidateId: candidate.id,
            blockedId,
            supportEdgeId: edge.id,
            supportIntersectionId,
          };
        }
      }
    }
  }

  throw new Error('Could not find a connected settlement conflict candidate');
}

function findPortEdge(state: any, portType: PortType): any {
  const edge = state.board.edges.find((candidate: any) => candidate.port === portType);
  if (!edge) {
    throw new Error(`Could not find ${portType} port edge`);
  }

  return edge;
}

function findRoadPath(state: any, length: number): RoadPath {
  const edgesByIntersection = new Map<number, number[]>();

  for (const edge of state.board.edges) {
    for (const intersectionId of edge.adjacentIntersections) {
      const existing = edgesByIntersection.get(intersectionId) ?? [];
      existing.push(edge.id);
      edgesByIntersection.set(intersectionId, existing);
    }
  }

  const walk = (
    intersectionId: number,
    usedEdges: number[],
    intersections: number[]
  ): RoadPath | null => {
    if (usedEdges.length === length) {
      return { edges: [...usedEdges], intersections: [...intersections] };
    }

    for (const edgeId of edgesByIntersection.get(intersectionId) ?? []) {
      if (usedEdges.includes(edgeId)) {
        continue;
      }

      const edge = state.board.edges[edgeId];
      const nextIntersection = edge.adjacentIntersections.find(
        (candidate: number) => candidate !== intersectionId
      );
      if (nextIntersection === undefined) {
        continue;
      }

      const result = walk(
        nextIntersection,
        [...usedEdges, edgeId],
        [...intersections, nextIntersection]
      );
      if (result) {
        return result;
      }
    }

    return null;
  };

  for (const intersection of state.board.intersections) {
    const result = walk(intersection.id, [], [intersection.id]);
    if (result) {
      return result;
    }
  }

  throw new Error(`Could not find a ${length}-edge road path on the Catan graph`);
}

async function rollNonRobber(game: CatanGame, player: string): Promise<void> {
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
  try {
    await game.makeMove({ player, action: 'roll_dice' });
  } finally {
    randomSpy.mockRestore();
  }
}

async function rollSeven(game: CatanGame, player: string): Promise<void> {
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.34).mockReturnValueOnce(0.51);
  try {
    await game.makeMove({ player, action: 'roll_dice' });
  } finally {
    randomSpy.mockRestore();
  }
}

describe('CatanGame', () => {
  let game: CatanGame;

  beforeEach(() => {
    game = new CatanGame('test-catan-game');
  });

  test('initializes a real 19-hex board graph with the official harbor set', async () => {
    const state = await game.initializeGame();

    expect(state.board.hexes).toHaveLength(19);
    expect(state.board.intersections).toHaveLength(54);
    expect(state.board.edges).toHaveLength(72);

    for (const intersection of state.board.intersections) {
      expect(intersection.adjacentHexes.length).toBeGreaterThanOrEqual(1);
      expect(intersection.adjacentHexes.length).toBeLessThanOrEqual(3);
      expect(intersection.adjacentIntersections.length).toBeGreaterThanOrEqual(2);
      expect(intersection.adjacentIntersections.length).toBeLessThanOrEqual(3);
    }

    for (const edge of state.board.edges) {
      expect(edge.adjacentIntersections).toHaveLength(2);
    }

    const desertHex = state.board.hexes.find((hex) => hex.resource === 'desert');
    expect(desertHex?.hasRobber).toBe(true);

    const portCounts = state.board.edges.reduce((counts: Record<string, number>, edge) => {
      if (edge.port) {
        counts[edge.port] = (counts[edge.port] ?? 0) + 1;
      }
      return counts;
    }, {});

    expect(Object.values(portCounts).reduce((sum, count) => sum + count, 0)).toBe(9);
    expect(portCounts.three_for_one).toBe(4);
    expect(portCounts.wood).toBe(1);
    expect(portCounts.brick).toBe(1);
    expect(portCounts.wool).toBe(1);
    expect(portCounts.grain).toBe(1);
    expect(portCounts.ore).toBe(1);
  });

  test('requires the setup road to connect to the settlement just placed', async () => {
    await game.initializeGame();
    const player = (await game.getGameState()).currentPlayer;
    const settlementPosition = await findFirstLegalPosition(game, player, 'build_settlement');

    await game.makeMove({
      player,
      action: 'build_settlement',
      position: settlementPosition,
    });

    const internalState = getInternalState(game);
    const incidentEdgeIds = new Set(
      getIncidentEdges(internalState, settlementPosition).map((edge: any) => edge.id)
    );
    const nonAdjacentEdge = internalState.board.edges.find(
      (edge: any) => !incidentEdgeIds.has(edge.id)
    )!.id;

    const validation = await game.validateMove({
      player,
      action: 'build_road',
      position: nonAdjacentEdge,
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('just placed');
  });

  test('completes setup in snake order and enters the main playing phase', async () => {
    await completeSetupPhase(game);

    const state = await game.getGameState();
    const internalState = getInternalState(game);

    expect(state.gamePhase).toBe('playing');
    expect(state.currentPlayer).toBe('player1');
    expect(internalState.setupPhaseState).toBeUndefined();

    for (const [playerId, player] of Object.entries(internalState.players)) {
      expect(player.buildings.settlements).toBe(3);
      expect(player.buildings.roads).toBe(13);
      expect(player.victoryPoints).toBe(2);
      expect(
        internalState.board.intersections.filter((intersection: any) => {
          return intersection.building?.player === playerId;
        })
      ).toHaveLength(2);
      expect(
        internalState.board.edges.filter((edge: any) => edge.road?.player === playerId)
      ).toHaveLength(2);
    }
  });

  test('awards round-two setup resources from the actual adjacent producing hexes', async () => {
    await seedCatan(game, (state) => {
      state.setupRound = 2;
      state.currentPlayer = 'player1';
    });

    const internalState = getInternalState(game);
    const settlementPosition = internalState.board.intersections.find((intersection: any) => {
      return intersection.adjacentHexes.some(
        (hexId: number) => internalState.board.hexes[hexId].resource !== 'desert'
      );
    }).id;
    const expectedResources = internalState.board.intersections[settlementPosition].adjacentHexes.filter(
      (hexId: number) => internalState.board.hexes[hexId].resource !== 'desert'
    );

    await game.makeMove({
      player: 'player1',
      action: 'build_settlement',
      position: settlementPosition,
    });

    const playerResources = getInternalState(game).players.player1.resources;
    expect(totalResources(playerResources)).toBe(expectedResources.length);
  });

  test('distributes resources to buildings that are actually adjacent to the rolled hex', async () => {
    await seedPlayingState(game, (state) => {
      const targetHex = state.board.hexes.find((hex: any) => hex.number === 2)!;
      const settlementPosition = state.board.intersections.find((intersection: any) => {
        return intersection.adjacentHexes.includes(targetHex.id);
      }).id;

      placeSettlement(state, 'player1', settlementPosition);
    });

    const targetHex = getInternalState(game).board.hexes.find((hex: any) => hex.number === 2)!;
    await rollNonRobber(game, 'player1');

    expect(getInternalState(game).players.player1.resources[targetHex.resource]).toBe(1);
  });

  test('requires a dice roll before normal build actions in the playing phase', async () => {
    await completeSetupPhase(game);

    const validation = await game.validateMove({
      player: 'player1',
      action: 'build_road',
      position: 0,
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('roll dice');
  });

  test('rejects building a settlement adjacent to another settlement during normal play', async () => {
    await seedPlayingState(game, (state) => {
      const candidate = findSettlementConflictCandidate(state);
      placeSettlement(state, 'player1', candidate.supportIntersectionId);
      placeRoad(state, 'player1', candidate.supportEdgeId);
      placeSettlement(state, 'player2', candidate.blockedId);
      state.diceRoll = 8;
      state.players.player1.resources = createResources(SETTLEMENT_COST);
    });

    const conflict = findSettlementConflictCandidate(getInternalState(game));
    const validation = await game.validateMove({
      player: 'player1',
      action: 'build_settlement',
      position: conflict.candidateId,
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('adjacent');
  });

  test('allows a connected settlement build on a legal empty intersection', async () => {
    await seedPlayingState(game, (state) => {
      const path = findRoadPath(state, 2);
      placeSettlement(state, 'player1', path.intersections[0]);
      placeRoad(state, 'player1', path.edges[0]);
      placeRoad(state, 'player1', path.edges[1]);
      state.players.player1.resources = createResources(SETTLEMENT_COST);
      state.diceRoll = 8;
      state.__testConnectedSettlementPath = path;
    });

    const path = getInternalState(game).__testConnectedSettlementPath as RoadPath;
    const settlementPosition = path.intersections[2];

    await game.makeMove({
      player: 'player1',
      action: 'build_settlement',
      position: settlementPosition,
    });

    expect(getInternalState(game).board.intersections[settlementPosition].building?.player).toBe(
      'player1'
    );
  });

  test('rejects an unconnected settlement build in the playing phase', async () => {
    await completeSetupPhase(game);
    const internalState = getInternalState(game);
    internalState.diceRoll = 8;
    internalState.players.player1.resources = createResources(SETTLEMENT_COST);

    const unconnectedPosition = await findFirstPositionWithError(
      game,
      'player1',
      'build_settlement',
      'connected'
    );
    const validation = await game.validateMove({
      player: 'player1',
      action: 'build_settlement',
      position: unconnectedPosition,
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('connected');
  });

  test('requires each player to choose exact robber discards before the robber can move', async () => {
    await seedPlayingState(game, (state) => {
      state.players.player1.resources = createResources({ wood: 4, brick: 4 });
      state.players.player2.resources = createResources({ wool: 4, grain: 4 });
      state.players.player3.resources = createResources({ ore: 2, grain: 2, wool: 2, wood: 1 });
      state.players.player4.resources = createResources({ wood: 1 });
    });

    await rollSeven(game, 'player1');

    let state = getInternalState(game);
    expect(state.currentPlayer).toBe('player1');
    expect(state.pendingRobberMove).toBe(false);
    expect(state.pendingDiscards).toEqual({ player1: 4, player2: 4 });

    const moveRobberTooSoon = await game.validateMove({
      player: 'player1',
      action: 'move_robber',
      position: state.board.hexes.find((hex: any) => !hex.hasRobber).id,
    });
    expect(moveRobberTooSoon.valid).toBe(false);
    expect(moveRobberTooSoon.error).toContain('finish robber discards');

    const wrongDiscardCount = await game.validateMove({
      player: 'player1',
      action: 'discard_resources',
      discarding: { wood: 3 },
    });
    expect(wrongDiscardCount.valid).toBe(false);
    expect(wrongDiscardCount.error).toContain('exactly 4');

    await game.makeMove({
      player: 'player1',
      action: 'discard_resources',
      discarding: { wood: 2, brick: 2 },
    });

    state = getInternalState(game);
    expect(state.currentPlayer).toBe('player2');
    expect(state.pendingDiscards).toEqual({ player2: 4 });

    await game.makeMove({
      player: 'player2',
      action: 'discard_resources',
      discarding: { wool: 2, grain: 2 },
    });

    state = getInternalState(game);
    expect(state.currentPlayer).toBe('player1');
    expect(state.pendingDiscards).toEqual({});
    expect(state.pendingRobberMove).toBe(true);
  });

  test('uses a 3:1 harbor for maritime trade when the player controls a generic port', async () => {
    await seedPlayingState(game, (state) => {
      const portEdge = findPortEdge(state, 'three_for_one');
      placeSettlement(state, 'player1', portEdge.adjacentIntersections[0]);
      state.players.player1.resources = createResources({ wood: 3 });
      state.diceRoll = 8;
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 3 },
        requesting: { brick: 1 },
      },
    });
    expect(validation.valid).toBe(true);

    await game.makeMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 3 },
        requesting: { brick: 1 },
      },
    });

    expect(getInternalState(game).players.player1.resources).toMatchObject({ wood: 0, brick: 1 });
  });

  test('allows the base 4:1 bank trade without any harbor', async () => {
    await seedPlayingState(game, (state) => {
      state.players.player1.resources = createResources({ wood: 4 });
      state.diceRoll = 8;
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 4 },
        requesting: { ore: 1 },
      },
    });
    expect(validation.valid).toBe(true);

    await game.makeMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 4 },
        requesting: { ore: 1 },
      },
    });

    expect(getInternalState(game).players.player1.resources).toMatchObject({ wood: 0, ore: 1 });
  });

  test('uses a 2:1 specialized harbor and rejects the same trade ratio without that port', async () => {
    await seedPlayingState(game, (state) => {
      const woodPort = findPortEdge(state, 'wood');
      placeSettlement(state, 'player1', woodPort.adjacentIntersections[0]);
      state.players.player1.resources = createResources({ wood: 2 });
      state.diceRoll = 8;
    });

    const validSpecializedTrade = await game.validateMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 2 },
        requesting: { ore: 1 },
      },
    });
    expect(validSpecializedTrade.valid).toBe(true);

    await game.makeMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 2 },
        requesting: { ore: 1 },
      },
    });

    expect(getInternalState(game).players.player1.resources).toMatchObject({ wood: 0, ore: 1 });

    await seedPlayingState(game, (state) => {
      state.players.player1.resources = createResources({ wood: 3 });
      state.diceRoll = 8;
    });

    const invalidTradeWithoutPort = await game.validateMove({
      player: 'player1',
      action: 'trade_with_bank',
      tradeOffer: {
        offering: { wood: 3 },
        requesting: { brick: 1 },
      },
    });
    expect(invalidTradeWithoutPort.valid).toBe(false);
    expect(invalidTradeWithoutPort.error).toContain('trade ratio');
  });

  test('requires an explicit robber target when multiple adjacent victims can be stolen from', async () => {
    await seedPlayingState(game, (state) => {
      state.diceRoll = 7;
      state.pendingRobberMove = true;

      const targetHex = state.board.hexes.find((hex: any) => !hex.hasRobber)!;
      const victimIntersections = state.board.intersections
        .filter((intersection: any) => intersection.adjacentHexes.includes(targetHex.id))
        .slice(0, 2);

      placeSettlement(state, 'player2', victimIntersections[0].id);
      placeSettlement(state, 'player3', victimIntersections[1].id);
      state.players.player2.resources = createResources({ wood: 1 });
      state.players.player3.resources = createResources({ brick: 1 });
    });

    const internalState = getInternalState(game);
    const targetHex = internalState.board.hexes.find((hex: any) => !hex.hasRobber)!;
    const validation = await game.validateMove({
      player: 'player1',
      action: 'move_robber',
      position: targetHex.id,
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('specify');
  });

  test('moves the robber to a chosen hex and steals from the chosen adjacent player', async () => {
    await seedPlayingState(game, (state) => {
      state.diceRoll = 7;
      state.pendingRobberMove = true;
      state.players.player1.resources = createResources();
      state.players.player2.resources = createResources({ wood: 1 });

      const targetHex = state.board.hexes.find((hex: any) => !hex.hasRobber)!;
      const victimIntersection = state.board.intersections.find((intersection: any) => {
        return intersection.adjacentHexes.includes(targetHex.id);
      }).id;

      placeSettlement(state, 'player2', victimIntersection);
    });

    const internalState = getInternalState(game);
    const targetHex = internalState.board.hexes.find((hex: any) => !hex.hasRobber)!;
    const victimPlayer = 'player2';

    await game.makeMove({
      player: 'player1',
      action: 'move_robber',
      position: targetHex.id,
      targetPlayer: victimPlayer,
    });

    expect(getInternalState(game).robberPosition).toBe(targetHex.id);
    expect(getInternalState(game).players.player1.resources.wood).toBe(1);
    expect(getInternalState(game).players.player2.resources.wood).toBe(0);
  });

  test('resolves Year of Plenty from explicit move input', async () => {
    await seedPlayingState(game, (state) => {
      state.players.player1.developmentCards = ['year_of_plenty'];
      state.players.player1.resources = createResources();
    });

    await game.makeMove({
      player: 'player1',
      action: 'play_development_card',
      cardType: 'year_of_plenty',
      resources: ['ore', 'grain'],
    });

    expect(getInternalState(game).players.player1.resources.ore).toBe(1);
    expect(getInternalState(game).players.player1.resources.grain).toBe(1);
    expect(getInternalState(game).playedDevelopmentCardThisTurn).toBe(true);
  });

  test('resolves Monopoly deterministically for the chosen resource', async () => {
    await seedPlayingState(game, (state) => {
      state.players.player1.developmentCards = ['monopoly'];
      state.players.player2.resources = createResources({ wood: 2 });
      state.players.player3.resources = createResources({ wood: 1 });
      state.players.player4.resources = createResources({ wood: 3 });
    });

    await game.makeMove({
      player: 'player1',
      action: 'play_development_card',
      cardType: 'monopoly',
      resource: 'wood',
    });

    expect(getInternalState(game).players.player1.resources.wood).toBe(6);
    expect(getInternalState(game).players.player2.resources.wood).toBe(0);
    expect(getInternalState(game).players.player3.resources.wood).toBe(0);
    expect(getInternalState(game).players.player4.resources.wood).toBe(0);
  });

  test('builds both Road Building roads from explicit connected positions without spending resources', async () => {
    await seedPlayingState(game, (state) => {
      const path = findRoadPath(state, 2);
      placeSettlement(state, 'player1', path.intersections[0]);
      state.players.player1.developmentCards = ['road_building'];
      state.players.player1.resources = createResources();
      state.__testRoadBuildingPath = path;
    });

    const path = getInternalState(game).__testRoadBuildingPath as RoadPath;
    const roadsBefore = getInternalState(game).players.player1.buildings.roads;

    await game.makeMove({
      player: 'player1',
      action: 'play_development_card',
      cardType: 'road_building',
      positions: path.edges,
    });

    expect(getInternalState(game).board.edges[path.edges[0]].road?.player).toBe('player1');
    expect(getInternalState(game).board.edges[path.edges[1]].road?.player).toBe('player1');
    expect(getInternalState(game).players.player1.buildings.roads).toBe(roadsBefore - 2);
    expect(totalResources(getInternalState(game).players.player1.resources)).toBe(0);
  });

  test('allows only one development card play per turn', async () => {
    await seedPlayingState(game, (state) => {
      state.players.player1.developmentCards = ['year_of_plenty', 'monopoly'];
    });

    await game.makeMove({
      player: 'player1',
      action: 'play_development_card',
      cardType: 'year_of_plenty',
      resources: ['ore', 'grain'],
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play_development_card',
      cardType: 'monopoly',
      resource: 'wood',
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Only one development card');
  });

  test('awards longest road when a player reaches a connected road of length 5', async () => {
    await seedPlayingState(game, (state) => {
      const path = findRoadPath(state, 5);
      placeSettlement(state, 'player1', path.intersections[0]);
      for (const edgeId of path.edges.slice(0, 4)) {
        placeRoad(state, 'player1', edgeId);
      }
      state.players.player1.resources = createResources(ROAD_COST);
      state.diceRoll = 8;
      state.__testLongestRoadPath = path;
    });

    const path = getInternalState(game).__testLongestRoadPath as RoadPath;
    await game.makeMove({
      player: 'player1',
      action: 'build_road',
      position: path.edges[4],
    });

    expect(getInternalState(game).players.player1.longestRoad).toBe(5);
    expect(getInternalState(game).players.player1.hasLongestRoad).toBe(true);
    expect(getInternalState(game).players.player1.victoryPoints).toBe(3);
  });

  test('breaks a road network at an opponent settlement when calculating longest road', async () => {
    await seedPlayingState(game, (state) => {
      const path = findRoadPath(state, 5);
      placeSettlement(state, 'player1', path.intersections[0]);
      placeSettlement(state, 'player2', path.intersections[2]);
      for (const edgeId of path.edges.slice(0, 4)) {
        placeRoad(state, 'player1', edgeId);
      }
      state.players.player1.resources = createResources(ROAD_COST);
      state.diceRoll = 8;
      state.__testBlockedRoadPath = path;
    });

    const path = getInternalState(game).__testBlockedRoadPath as RoadPath;
    await game.makeMove({
      player: 'player1',
      action: 'build_road',
      position: path.edges[4],
    });

    expect(getInternalState(game).players.player1.longestRoad).toBe(3);
    expect(getInternalState(game).players.player1.hasLongestRoad).toBe(false);
    expect(getInternalState(game).players.player1.victoryPoints).toBe(1);
  });
});

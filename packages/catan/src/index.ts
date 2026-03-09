import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';
import { logger, type LogContext } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';

// Strict type definitions for better type safety
type Resource = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';
type PortType = Resource | 'three_for_one';
type BuildingType = 'settlement' | 'city' | 'road';
type DevelopmentCard = 'knight' | 'victory_point' | 'road_building' | 'year_of_plenty' | 'monopoly';

// Readonly interface for resource cards to prevent accidental mutations
interface ResourceCards {
  readonly wood: number;
  readonly brick: number;
  readonly wool: number;
  readonly grain: number;
  readonly ore: number;
}

// Mutable version for internal use
interface MutableResourceCards {
  wood: number;
  brick: number;
  wool: number;
  grain: number;
  ore: number;
}

interface HexTile {
  readonly id: number;
  readonly resource: Resource | 'desert';
  readonly number?: number; // Dice roll number (2-12, except 7)
  hasRobber: boolean;
}

interface Intersection {
  readonly id: number;
  building?: {
    readonly type: BuildingType;
    readonly player: string;
  };
  readonly adjacentHexes: readonly number[]; // Hex IDs
  readonly adjacentIntersections: readonly number[]; // Other intersection IDs
}

interface Edge {
  readonly id: number;
  road?: {
    readonly player: string;
  };
  readonly adjacentIntersections: readonly number[]; // Two intersection IDs
  readonly port?: PortType;
}

interface AxialHexCoordinate {
  q: number;
  r: number;
}

interface GeneratedIntersectionTopology {
  x: number;
  y: number;
  adjacentHexes: number[];
  adjacentIntersections: number[];
}

interface GeneratedEdgeTopology {
  x: number;
  y: number;
  adjacentIntersections: [number, number];
  adjacentHexes: number[];
}

// Enhanced error handling constants with context
const CATAN_ERROR_MESSAGES = {
  INVALID_MOVE_DATA: 'Move must include player and action',
  GAME_OVER: 'Game is already over',
  NOT_YOUR_TURN: 'Not your turn',
  INVALID_PLAYER: 'Invalid player',
  INVALID_GAME_PHASE: 'Invalid game phase',
  INVALID_SETUP_ACTION: 'Invalid action for setup phase',
  SETTLEMENT_REQUIRED_FIRST: 'Must place settlement before road in setup phase',
  ROAD_REQUIRED_AFTER_SETTLEMENT: 'Must place road after settlement in setup phase',
  INTERSECTION_OCCUPIED: 'Intersection already occupied',
  ADJACENT_SETTLEMENT: 'Cannot build settlement adjacent to another settlement',
  INVALID_INTERSECTION: 'Invalid intersection position',
  INVALID_EDGE: 'Invalid edge position',
  EDGE_OCCUPIED: 'Edge already has a road',
  INSUFFICIENT_RESOURCES: 'Insufficient resources',
  NO_BUILDINGS_LEFT: 'No buildings left to build',
  DICE_ALREADY_ROLLED: 'Dice already rolled this turn',
  MUST_ROLL_DICE: 'Must roll dice before ending turn',
  NO_BUILDING_AT_POSITION: 'No building at specified position',
  NOT_YOUR_BUILDING: 'Can only upgrade your own buildings',
  MUST_SPECIFY_POSITION: 'Must specify position',
  INVALID_POSITION: 'Invalid position',
  NOT_CONNECTED: 'Must build connected to your existing roads or settlements',
  INVALID_CARD_TYPE: 'Invalid development card type',
  NO_DEVELOPMENT_CARD: "You don't have that development card",
  NO_CARDS_LEFT: 'No development cards left',
  INVALID_TRADE_RATIO: 'Invalid trade ratio',
  INVALID_TARGET_PLAYER: 'Invalid target player',
  CANNOT_TRADE_WITH_SELF: 'Cannot trade with yourself',
  ROBBER_SAME_POSITION: 'Robber must be moved to a different hex',
  INVALID_HEX_POSITION: 'Invalid hex position',
  GAME_NOT_INITIALIZED: 'Game not properly initialized',
  INVALID_PLAYER_COUNT: 'Player count must be between 3 and 4',
  INVALID_RESOURCE_AMOUNT: 'Resource amounts must be non-negative integers',
} as const;

// Game constants for validation
const GAME_CONSTANTS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 4,
  VICTORY_POINTS_TO_WIN: 10,
  MAX_INTERSECTIONS: 54,
  MAX_EDGES: 72,
  MAX_HEXES: 19,
  DICE_MIN: 2,
  DICE_MAX: 12,
  ROBBER_TRIGGER: 7,
  LARGEST_ARMY_MIN: 3,
  LONGEST_ROAD_MIN: 5,
  MAX_RESOURCE_CARDS_BEFORE_DISCARD: 7,
  DEVELOPMENT_CARD_COUNTS: {
    knight: 14,
    victory_point: 5,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2,
  },
} as const;

const HEX_COORDINATES: ReadonlyArray<AxialHexCoordinate> = [
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
] as const;

const HEX_CORNER_ANGLES = [0, 60, 120, 180, 240, 300] as const;
const PORT_SEQUENCE: ReadonlyArray<PortType> = [
  'three_for_one',
  'brick',
  'three_for_one',
  'wood',
  'three_for_one',
  'wool',
  'grain',
  'three_for_one',
  'ore',
] as const;
const PORT_COASTAL_EDGE_INDICES = [0, 3, 6, 10, 13, 16, 20, 23, 26] as const;

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function createVertexKey(x: number, y: number): string {
  return `${roundCoordinate(x)},${roundCoordinate(y)}`;
}

function generateBoardTopology(): {
  intersections: GeneratedIntersectionTopology[];
  edges: GeneratedEdgeTopology[];
} {
  const vertexMap = new Map<
    string,
    {
      x: number;
      y: number;
      adjacentHexes: Set<number>;
      adjacentVertices: Set<string>;
    }
  >();
  const edgeMap = new Map<
    string,
    {
      aKey: string;
      bKey: string;
      x: number;
      y: number;
    }
  >();

  for (const [hexId, coordinate] of HEX_COORDINATES.entries()) {
    const centerX = 1.5 * coordinate.q;
    const centerY = Math.sqrt(3) * (coordinate.r + coordinate.q / 2);
    const cornerKeys: string[] = [];

    for (const angleDegrees of HEX_CORNER_ANGLES) {
      const angleRadians = (Math.PI / 180) * angleDegrees;
      const x = roundCoordinate(centerX + Math.cos(angleRadians));
      const y = roundCoordinate(centerY + Math.sin(angleRadians));
      const key = createVertexKey(x, y);

      if (!vertexMap.has(key)) {
        vertexMap.set(key, {
          x,
          y,
          adjacentHexes: new Set<number>(),
          adjacentVertices: new Set<string>(),
        });
      }
      vertexMap.get(key)!.adjacentHexes.add(hexId);
      cornerKeys.push(key);
    }

    for (let i = 0; i < cornerKeys.length; i++) {
      const currentKey = cornerKeys[i]!;
      const nextKey = cornerKeys[(i + 1) % cornerKeys.length]!;
      vertexMap.get(currentKey)!.adjacentVertices.add(nextKey);
      vertexMap.get(nextKey)!.adjacentVertices.add(currentKey);

      const edgeKey = [currentKey, nextKey].sort().join('|');
      if (!edgeMap.has(edgeKey)) {
        const currentVertex = vertexMap.get(currentKey)!;
        const nextVertex = vertexMap.get(nextKey)!;
        edgeMap.set(edgeKey, {
          aKey: currentKey,
          bKey: nextKey,
          x: roundCoordinate((currentVertex.x + nextVertex.x) / 2),
          y: roundCoordinate((currentVertex.y + nextVertex.y) / 2),
        });
      }
    }
  }

  const sortedVertices = Array.from(vertexMap.entries()).sort(([, left], [, right]) => {
    return left.y - right.y || left.x - right.x;
  });
  const vertexIds = new Map(sortedVertices.map(([key], index) => [key, index]));

  const intersections = sortedVertices.map(([, vertex]) => ({
    x: vertex.x,
    y: vertex.y,
    adjacentHexes: Array.from(vertex.adjacentHexes).sort((a, b) => a - b),
    adjacentIntersections: Array.from(vertex.adjacentVertices)
      .map((key) => vertexIds.get(key)!)
      .sort((a, b) => a - b),
  }));

  const edges = Array.from(edgeMap.values())
    .map((edge) => {
      const firstVertex = vertexMap.get(edge.aKey)!;
      const secondVertex = vertexMap.get(edge.bKey)!;
      const adjacentHexes = Array.from(firstVertex.adjacentHexes)
        .filter((hexId) => secondVertex.adjacentHexes.has(hexId))
        .sort((a, b) => a - b);

      return {
        x: edge.x,
        y: edge.y,
        adjacentIntersections: [vertexIds.get(edge.aKey)!, vertexIds.get(edge.bKey)!].sort(
          (a, b) => a - b
        ) as [number, number],
        adjacentHexes,
      };
    })
    .sort((left, right) => {
      return (
        left.y - right.y ||
        left.x - right.x ||
        left.adjacentIntersections[0] - right.adjacentIntersections[0] ||
        left.adjacentIntersections[1] - right.adjacentIntersections[1]
      );
    });

  if (
    intersections.length !== GAME_CONSTANTS.MAX_INTERSECTIONS ||
    edges.length !== GAME_CONSTANTS.MAX_EDGES
  ) {
    throw new Error('Generated Catan board topology is invalid');
  }

  return { intersections, edges };
}

const CATAN_BOARD_TOPOLOGY = generateBoardTopology();

function createPortAssignments(): ReadonlyMap<number, PortType> {
  const coastalEdges = CATAN_BOARD_TOPOLOGY.edges
    .map((edge, id) => ({
      id,
      x: edge.x,
      y: edge.y,
      adjacentHexes: edge.adjacentHexes,
      angle: Math.atan2(edge.y, edge.x),
    }))
    .filter((edge) => edge.adjacentHexes.length === 1)
    .sort((left, right) => {
      return left.angle - right.angle || left.y - right.y || left.x - right.x || left.id - right.id;
    });

  if (coastalEdges.length !== 30) {
    throw new Error('Generated Catan coastline is invalid');
  }

  return new Map(
    PORT_COASTAL_EDGE_INDICES.map((coastalIndex, portIndex) => {
      const edge = coastalEdges[coastalIndex];
      const port = PORT_SEQUENCE[portIndex];

      if (!edge || !port) {
        throw new Error('Generated Catan port layout is invalid');
      }

      return [edge.id, port];
    })
  );
}

const CATAN_PORT_ASSIGNMENTS = createPortAssignments();

export interface CatanState extends GameState {
  board: {
    hexes: HexTile[];
    intersections: Intersection[];
    edges: Edge[];
  };
  players: {
    [playerId: string]: {
      resources: MutableResourceCards;
      developmentCards: DevelopmentCard[];
      buildings: {
        settlements: number;
        cities: number;
        roads: number;
      };
      victoryPoints: number;
      longestRoad: number;
      largestArmy: number;
      hasLongestRoad: boolean;
      hasLargestArmy: boolean;
    };
  };
  currentPlayer: string;
  playerOrder: readonly string[];
  gamePhase: 'setup' | 'playing' | 'finished';
  setupRound: number; // 1 or 2 for initial placement
  diceRoll: number | null;
  robberPosition: number; // Hex ID where robber is located
  gameOver: boolean;
  winner: string | null;
  lastAction: {
    action: string;
    player: string;
    details?: string;
  } | null;
  developmentCardDeck: DevelopmentCard[];
  setupPhaseState?: {
    placedBuildings: {
      [playerId: string]: {
        settlement: boolean;
        road: boolean;
        settlementPosition: number | null;
      };
    };
  };
  tradeOffer?: {
    from: string;
    to: string;
    offering: Partial<ResourceCards>;
    requesting: Partial<ResourceCards>;
  };
  pendingRobberMove?: boolean;
  pendingDiscards?: {
    [playerId: string]: number;
  };
  robberTriggeringPlayer?: string | null;
  playedDevelopmentCardThisTurn?: boolean;
  newDevelopmentCards?: {
    [playerId: string]: DevelopmentCard[];
  };
}

interface CatanMove {
  player: string;
  action:
    | 'roll_dice'
    | 'build_settlement'
    | 'build_city'
    | 'build_road'
    | 'buy_development_card'
    | 'play_development_card'
    | 'trade_with_bank'
    | 'trade_with_player'
    | 'discard_resources'
    | 'move_robber'
    | 'end_turn';
  position?: number; // For building/robber placement
  cardType?: DevelopmentCard; // For playing development cards
  tradeOffer?: {
    offering: Partial<ResourceCards>;
    requesting: Partial<ResourceCards>;
  };
  targetPlayer?: string; // For trading/robber effects
  positions?: number[];
  resources?: Resource[];
  resource?: Resource;
  discarding?: Partial<ResourceCards>;
}

// Enhanced type definitions for better type safety
interface ValidationContext {
  state: CatanState;
  move: CatanMove;
  player: CatanState['players'][string];
}

export class CatanGame extends BaseGame {
  declare protected currentState: CatanState;
  private readonly VICTORY_POINTS_TO_WIN = GAME_CONSTANTS.VICTORY_POINTS_TO_WIN;

  // Standard Catan board layout in fixed physical order
  private readonly HEX_LAYOUT: ReadonlyArray<{ resource: Resource | 'desert'; number?: number }> = [
    { resource: 'ore', number: 10 },
    { resource: 'wool', number: 2 },
    { resource: 'wood', number: 9 },
    { resource: 'grain', number: 12 },
    { resource: 'brick', number: 6 },
    { resource: 'wool', number: 4 },
    { resource: 'brick', number: 10 },
    { resource: 'grain', number: 9 },
    { resource: 'wood', number: 11 },
    { resource: 'desert' },
    { resource: 'wood', number: 3 },
    { resource: 'ore', number: 8 },
    { resource: 'wood', number: 8 },
    { resource: 'ore', number: 3 },
    { resource: 'grain', number: 4 },
    { resource: 'wool', number: 5 },
    { resource: 'brick', number: 5 },
    { resource: 'grain', number: 6 },
    { resource: 'wool', number: 11 },
  ] as const;

  private readonly BUILDING_COSTS: Readonly<
    Record<BuildingType | 'development_card', Readonly<Partial<ResourceCards>>>
  > = {
    settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 },
    road: { wood: 1, brick: 1 },
    development_card: { wool: 1, grain: 1, ore: 1 },
  } as const;

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'catan', database);

    // Validate gameId to prevent injection attacks
    if (!gameId || typeof gameId !== 'string' || gameId.length > 100) {
      throw new Error('Invalid game ID');
    }
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    try {
      // Enhanced input validation
      const playerCount = this.validatePlayerCount((config as any)?.playerCount);
      const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

      // Create board with validation
      const board = this.createBoard();
      this.validateBoardIntegrity(board);

      // Initialize players with defensive copying
      const players = this.initializePlayers(playerIds);

      // Create and shuffle development card deck
      const developmentCardDeck = this.createDevelopmentCardDeck();
      this.shuffleArray(developmentCardDeck);

      // Find desert hex for initial robber placement with validation
      const desertHex = this.findDesertHex(board.hexes);

      const initialState: CatanState = {
        gameId: this.gameId,
        gameType: this.gameType,
        board,
        players,
        currentPlayer: playerIds[0]!,
        playerOrder: Object.freeze([...playerIds]),
        gamePhase: 'setup',
        setupRound: 1,
        diceRoll: null,
        robberPosition: desertHex,
        gameOver: false,
        winner: null,
        lastAction: null,
        developmentCardDeck,
        setupPhaseState: {
          placedBuildings: Object.fromEntries(
            playerIds.map((id) => [id, { settlement: false, road: false, settlementPosition: null }])
          ),
        },
        pendingRobberMove: false,
        pendingDiscards: {},
        robberTriggeringPlayer: null,
        playedDevelopmentCardThisTurn: false,
        newDevelopmentCards: Object.fromEntries(playerIds.map((id) => [id, []])),
      };

      // Set robber on desert with bounds checking
      if (desertHex >= 0 && desertHex < board.hexes.length) {
        board.hexes[desertHex]!.hasRobber = true;
      }

      this.currentState = initialState;
      await this.persistState();

      return this.getGameState();
    } catch (error) {
      logger.error('Failed to initialize Catan game', { gameId: this.gameId, error });
      throw new Error(
        `Failed to initialize game: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Enhanced validation methods with bounds checking
  private validatePlayerCount(playerCount?: number): number {
    const count = playerCount ?? 4;

    if (
      !Number.isInteger(count) ||
      count < GAME_CONSTANTS.MIN_PLAYERS ||
      count > GAME_CONSTANTS.MAX_PLAYERS
    ) {
      throw new Error(CATAN_ERROR_MESSAGES.INVALID_PLAYER_COUNT);
    }

    return count;
  }

  private validateBoardIntegrity(board: CatanState['board']): void {
    if (!board.hexes || board.hexes.length !== GAME_CONSTANTS.MAX_HEXES) {
      throw new Error('Invalid board: incorrect number of hexes');
    }

    if (!board.intersections || board.intersections.length !== GAME_CONSTANTS.MAX_INTERSECTIONS) {
      throw new Error('Invalid board: incorrect number of intersections');
    }

    if (!board.edges || board.edges.length !== GAME_CONSTANTS.MAX_EDGES) {
      throw new Error('Invalid board: incorrect number of edges');
    }
  }

  private findDesertHex(hexes: HexTile[]): number {
    const desertIndex = hexes.findIndex((hex) => hex.resource === 'desert');

    if (desertIndex === -1) {
      throw new Error('Invalid board: no desert hex found');
    }

    return desertIndex;
  }

  private initializePlayers(playerIds: string[]): CatanState['players'] {
    const players: CatanState['players'] = {};

    for (const playerId of playerIds) {
      // Validate player ID
      if (!playerId || typeof playerId !== 'string') {
        throw new Error(`Invalid player ID: ${playerId}`);
      }

      players[playerId] = {
        resources: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
        developmentCards: [],
        buildings: { settlements: 5, cities: 4, roads: 15 },
        victoryPoints: 0,
        longestRoad: 0,
        largestArmy: 0,
        hasLongestRoad: false,
        hasLargestArmy: false,
      };
    }

    return players;
  }

  private createBoard(): CatanState['board'] {
    const hexes: HexTile[] = this.HEX_LAYOUT.map((layout, index) => ({
      id: index,
      resource: layout.resource,
      number: layout.number,
      hasRobber: false,
    }));

    const intersections: Intersection[] = CATAN_BOARD_TOPOLOGY.intersections.map(
      (intersection, index) => ({
        id: index,
        adjacentHexes: [...intersection.adjacentHexes],
        adjacentIntersections: [...intersection.adjacentIntersections],
      })
    );

    const edges: Edge[] = CATAN_BOARD_TOPOLOGY.edges.map((edge, index) => ({
      id: index,
      adjacentIntersections: [...edge.adjacentIntersections],
      port: CATAN_PORT_ASSIGNMENTS.get(index),
    }));

    return { hexes, intersections, edges };
  }

  private createDevelopmentCardDeck(): DevelopmentCard[] {
    const deck: DevelopmentCard[] = [];

    // Standard distribution
    for (let i = 0; i < 14; i++) {
      deck.push('knight');
    }
    for (let i = 0; i < 5; i++) {
      deck.push('victory_point');
    }
    for (let i = 0; i < 2; i++) {
      deck.push('road_building');
    }
    for (let i = 0; i < 2; i++) {
      deck.push('year_of_plenty');
    }
    for (let i = 0; i < 2; i++) {
      deck.push('monopoly');
    }

    return deck;
  }

  protected shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  // Enhanced validation with comprehensive input sanitization
  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      // Comprehensive input validation and sanitization
      if (!moveData || typeof moveData !== 'object') {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      // Sanitize and validate move data
      const move = this.sanitizeMove(moveData);
      if (!move) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      if (!move.player || !move.action) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      const state = this.currentState as CatanState;

      if (!state) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.GAME_NOT_INITIALIZED };
      }

      if (state.gameOver) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.GAME_OVER };
      }

      // Check if player exists BEFORE checking turn
      if (!state.players[move.player]) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_PLAYER };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_YOUR_TURN };
      }

      const player = state.players[move.player]!;
      const context: ValidationContext = { state, move, player };

      // Validate based on game phase
      if (state.gamePhase === 'setup') {
        return this.validateSetupMove(context);
      }

      if (state.gamePhase === 'playing') {
        return this.validatePlayingMove(context);
      }

      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_GAME_PHASE };
    } catch (error) {
      // Enhanced error logging for production debugging
      const errorContext: LogContext = {
        gameId: this.gameId,
        moveData: JSON.stringify(moveData),
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };

      logger.error('Error validating move:', errorContext);

      // In development, include stack trace
      if (process.env.NODE_ENV === 'development') {
        logger.error(
          'Stack trace:',
          error instanceof Error ? error : new Error('No stack trace available')
        );
      }

      return { valid: false, error: 'Invalid move data format' };
    }
  }

  // Input sanitization to prevent injection and malformed data
  private sanitizeMove(moveData: Record<string, any>): CatanMove | null {
    try {
      // Validate and sanitize player ID - be less restrictive for existing valid IDs
      const player = moveData.player;
      if (!player || typeof player !== 'string' || player.length > 50) {
        return null;
      }

      // For existing games, check if player exists; for invalid players, let validation handle it
      // This allows the proper error message to be returned

      // Validate action
      const validActions = [
        'roll_dice',
        'build_settlement',
        'build_city',
        'build_road',
        'buy_development_card',
        'play_development_card',
        'trade_with_bank',
        'trade_with_player',
        'discard_resources',
        'move_robber',
        'end_turn',
      ];

      if (!validActions.includes(moveData.action)) {
        return null;
      }

      const move: CatanMove = {
        player,
        action: moveData.action,
      };

      // Sanitize optional fields
      if (moveData.position !== undefined) {
        const position = this.sanitizeNumber(moveData.position, 0, 100);
        if (position !== null) {
          move.position = position;
        }
      }

      if (moveData.cardType !== undefined) {
        const validCardTypes: DevelopmentCard[] = [
          'knight',
          'victory_point',
          'road_building',
          'year_of_plenty',
          'monopoly',
        ];
        if (validCardTypes.includes(moveData.cardType)) {
          move.cardType = moveData.cardType;
        }
      }

      if (moveData.targetPlayer !== undefined) {
        const targetPlayer = moveData.targetPlayer;
        if (typeof targetPlayer === 'string' && targetPlayer.length <= 50) {
          move.targetPlayer = targetPlayer;
        }
      }

      if (Array.isArray(moveData.positions)) {
        const positions = moveData.positions
          .map((position: unknown) => this.sanitizeNumber(position, 0, 100))
          .filter((position: number | null): position is number => position !== null);
        if (positions.length > 0) {
          move.positions = positions;
        }
      }

      if (Array.isArray(moveData.resources)) {
        const resources = moveData.resources.filter((resource: unknown): resource is Resource =>
          ['wood', 'brick', 'wool', 'grain', 'ore'].includes(resource as Resource)
        );
        if (resources.length > 0) {
          move.resources = resources;
        }
      }

      if (
        moveData.resource !== undefined &&
        ['wood', 'brick', 'wool', 'grain', 'ore'].includes(moveData.resource)
      ) {
        move.resource = moveData.resource;
      }

      if (moveData.tradeOffer !== undefined && typeof moveData.tradeOffer === 'object') {
        move.tradeOffer = this.sanitizeTradeOffer(moveData.tradeOffer);
      }

      if (moveData.discarding !== undefined && typeof moveData.discarding === 'object') {
        move.discarding = this.sanitizeResourceCards(moveData.discarding);
      }

      return move;
    } catch (error) {
      logger.error('Error sanitizing move', { error });
      return null;
    }
  }

  // String sanitization utility
  private sanitizeString(value: any, maxLength: number): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    // Remove potentially dangerous characters
    const sanitized = value.replace(/[<>\"'&]/g, '').trim();

    if (sanitized.length === 0 || sanitized.length > maxLength) {
      return null;
    }

    return sanitized;
  }

  // Number sanitization utility
  private sanitizeNumber(value: any, min: number, max: number): number | null {
    const num = Number(value);

    if (!Number.isInteger(num) || num < min || num > max) {
      return null;
    }

    return num;
  }

  // Trade offer sanitization
  private sanitizeTradeOffer(
    tradeOffer: any
  ): { offering: Partial<ResourceCards>; requesting: Partial<ResourceCards> } | undefined {
    if (!tradeOffer || typeof tradeOffer !== 'object') {
      return undefined;
    }

    const sanitizedOffer = {
      offering: this.sanitizeResourceCards(tradeOffer.offering),
      requesting: this.sanitizeResourceCards(tradeOffer.requesting),
    };

    return sanitizedOffer;
  }

  // Resource cards sanitization
  private sanitizeResourceCards(resources: any): Partial<ResourceCards> {
    if (!resources || typeof resources !== 'object') {
      return {};
    }

    const sanitized: Partial<ResourceCards> = {};
    const validResources: Resource[] = ['wood', 'brick', 'wool', 'grain', 'ore'];

    for (const resource of validResources) {
      if (resources[resource] !== undefined) {
        const amount = this.sanitizeNumber(resources[resource], 0, 20); // Reasonable upper limit
        if (amount !== null) {
          (sanitized as any)[resource] = amount;
        }
      }
    }

    return sanitized;
  }

  private getResourceEntries(resources: Partial<ResourceCards>): Array<[Resource, number]> {
    return (Object.entries(resources) as Array<[Resource, number | undefined]>).filter(([, amount]) => {
      return typeof amount === 'number' && amount > 0;
    }) as Array<[Resource, number]>;
  }

  private sumResourceCards(resources: Partial<ResourceCards>): number {
    return this.getResourceEntries(resources).reduce((sum, [, amount]) => sum + amount, 0);
  }

  // Enhanced resource validation with bounds checking
  private hasResources(playerResources: ResourceCards, cost: Partial<ResourceCards>): boolean {
    try {
      for (const [resource, amount] of Object.entries(cost)) {
        const requiredAmount = amount || 0;
        const availableAmount = (playerResources as any)[resource as Resource] || 0;

        // Validate amounts are non-negative
        if (requiredAmount < 0 || availableAmount < 0) {
          logger.warn('Invalid resource amount detected', {
            resource,
            availableAmount,
            requiredAmount,
          });
          return false;
        }

        if (availableAmount < requiredAmount) {
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error('Error checking resources', { error });
      return false;
    }
  }

  // Performance-optimized board validation
  private validateBuildingPlacement(
    move: CatanMove,
    state: CatanState,
    buildingType: BuildingType
  ): MoveValidationResult {
    if (typeof move.position !== 'number') {
      return { valid: false, error: `Must specify position for ${buildingType}` };
    }

    // Bounds checking to prevent array access errors
    if (move.position < 0 || move.position >= state.board.intersections.length) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_INTERSECTION };
    }

    const intersection = state.board.intersections[move.position];
    if (!intersection) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_INTERSECTION };
    }

    if (intersection.building) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INTERSECTION_OCCUPIED };
    }

    // Optimized connection checking with early termination
    const hasConnection = this.hasConnectionToIntersectionOptimized(
      move.position,
      move.player,
      state
    );
    if (!hasConnection) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_CONNECTED };
    }

    return { valid: true };
  }

  // Optimized connection checking with caching
  private hasAdjacentBuilding(intersectionId: number, state: CatanState): boolean {
    const intersection = state.board.intersections[intersectionId];
    if (!intersection) {
      return false;
    }

    return intersection.adjacentIntersections.some(
      (adjacentId) => Boolean(state.board.intersections[adjacentId]?.building)
    );
  }

  private getIncidentEdges(intersectionId: number, state: CatanState): Edge[] {
    return state.board.edges.filter((edge) => edge.adjacentIntersections.includes(intersectionId));
  }

  private isIntersectionBlockedByOpponentBuilding(
    intersectionId: number,
    playerId: string,
    state: CatanState
  ): boolean {
    const building = state.board.intersections[intersectionId]?.building;
    return Boolean(building && building.player !== playerId);
  }

  private hasConnectionToIntersectionOptimized(
    intersectionId: number,
    playerId: string,
    state: CatanState
  ): boolean {
    return this.getIncidentEdges(intersectionId, state).some(
      (edge) => edge.road?.player === playerId
    );
  }

  // Memory-efficient dice rolling with validation
  private rollDice(): number {
    // Use crypto.randomInt for better randomness in production
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;

    // Validate dice roll is within expected range
    if (total < GAME_CONSTANTS.DICE_MIN || total > GAME_CONSTANTS.DICE_MAX) {
      logger.warn('Invalid dice roll', { total });
      return 7; // Default to robber trigger
    }

    return total;
  }

  // Enhanced resource distribution with bounds checking
  private distributeResources(roll: number, state: CatanState): void {
    try {
      // Validate roll is within valid range
      if (
        roll < GAME_CONSTANTS.DICE_MIN ||
        roll > GAME_CONSTANTS.DICE_MAX ||
        roll === GAME_CONSTANTS.ROBBER_TRIGGER
      ) {
        return; // No resources distributed
      }

      for (const hex of state.board.hexes) {
        if (hex.number === roll && !hex.hasRobber && hex.resource !== 'desert') {
          // Find all intersections adjacent to this hex
          for (const intersection of state.board.intersections) {
            if (intersection.adjacentHexes.includes(hex.id) && intersection.building) {
              const playerId = intersection.building.player;
              const player = state.players[playerId];

              if (player) {
                const multiplier = intersection.building.type === 'city' ? 2 : 1;
                const resource = hex.resource as Resource;

                // Bounds checking to prevent overflow
                const currentAmount = player.resources[resource] || 0;
                if (currentAmount + multiplier <= 100) {
                  // Reasonable upper limit
                  player.resources[resource] += multiplier;
                } else {
                  logger.warn('Resource overflow prevented', { playerId, resource });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error distributing resources', { error });
    }
  }

  private validateSetupMove(context: ValidationContext): MoveValidationResult {
    const { state, move } = context;
    const setupState = state.setupPhaseState?.placedBuildings?.[move.player] || {
      settlement: false,
      road: false,
      settlementPosition: null,
    };

    if (move.action === 'build_settlement') {
      // In setup, settlement must be placed first
      if (setupState.settlement) {
        return { valid: false, error: 'Settlement already placed this turn' };
      }

      if (typeof move.position !== 'number') {
        return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
      }

      const intersection = state.board.intersections[move.position];
      if (!intersection) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_INTERSECTION };
      }

      if (intersection.building) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INTERSECTION_OCCUPIED };
      }

      // Check distance rule (no adjacent settlements)
      for (const adjId of intersection.adjacentIntersections) {
        const adjIntersection = state.board.intersections[adjId];
        if (adjIntersection?.building) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.ADJACENT_SETTLEMENT };
        }
      }

      return { valid: true };
    }

    if (move.action === 'build_road') {
      // In setup, road must be placed after settlement
      if (!setupState.settlement) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.SETTLEMENT_REQUIRED_FIRST };
      }

      if (setupState.road) {
        return { valid: false, error: 'Road already placed this turn' };
      }

      if (typeof move.position !== 'number') {
        return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
      }

      const edge = state.board.edges[move.position];
      if (!edge) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_EDGE };
      }

      if (edge.road) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.EDGE_OCCUPIED };
      }

      const settlementPosition = setupState.settlementPosition;
      if (
        typeof settlementPosition !== 'number' ||
        !edge.adjacentIntersections.includes(settlementPosition)
      ) {
        return {
          valid: false,
          error: 'Setup road must connect to the settlement you just placed',
        };
      }

      return { valid: true };
    }

    return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_SETUP_ACTION };
  }

  private validatePlayingMove(context: ValidationContext): MoveValidationResult {
    const { state, move, player } = context;
    const hasPendingDiscards = Object.keys(state.pendingDiscards ?? {}).length > 0;

    if (hasPendingDiscards && move.action !== 'discard_resources') {
      return { valid: false, error: 'Must finish robber discards before continuing turn' };
    }

    if (state.pendingRobberMove && move.action !== 'move_robber') {
      return { valid: false, error: 'Must move robber before continuing turn' };
    }

    if (state.diceRoll === null && !['roll_dice', 'play_development_card'].includes(move.action)) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_ROLL_DICE };
    }

    switch (move.action) {
      case 'roll_dice':
        if (state.diceRoll !== null) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.DICE_ALREADY_ROLLED };
        }
        return { valid: true };

      case 'build_settlement':
        if (typeof move.position !== 'number') {
          return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
        }

        const settlementIntersection = state.board.intersections[move.position];
        if (!settlementIntersection) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_INTERSECTION };
        }

        if (settlementIntersection.building) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INTERSECTION_OCCUPIED };
        }

        if (this.hasAdjacentBuilding(move.position, state)) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.ADJACENT_SETTLEMENT };
        }

        const hasConnection = this.hasConnectionToIntersection(move.position, move.player, state);
        if (!hasConnection) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_CONNECTED };
        }

        if (!this.hasResources(player.resources, this.BUILDING_COSTS.settlement)) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INSUFFICIENT_RESOURCES };
        }
        if (player.buildings.settlements <= 0) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_BUILDINGS_LEFT };
        }

        return { valid: true };

      case 'build_city':
        if (typeof move.position !== 'number') {
          return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
        }

        const intersection = state.board.intersections[move.position];
        if (!intersection?.building) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_BUILDING_AT_POSITION };
        }

        if (intersection.building.type !== 'settlement') {
          return { valid: false, error: 'Can only upgrade settlements to cities' };
        }

        if (intersection.building.player !== move.player) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_YOUR_BUILDING };
        }

        if (!this.hasResources(player.resources, this.BUILDING_COSTS.city)) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INSUFFICIENT_RESOURCES };
        }
        if (player.buildings.cities <= 0) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_BUILDINGS_LEFT };
        }

        return { valid: true };

      case 'build_road':
        if (typeof move.position !== 'number') {
          return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
        }

        const edge = state.board.edges[move.position];
        if (!edge) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_EDGE };
        }

        if (edge.road) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.EDGE_OCCUPIED };
        }

        const hasRoadConnection = this.hasConnectionToEdge(move.position, move.player, state);
        if (!hasRoadConnection) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_CONNECTED };
        }

        if (!this.hasResources(player.resources, this.BUILDING_COSTS.road)) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INSUFFICIENT_RESOURCES };
        }
        if (player.buildings.roads <= 0) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_BUILDINGS_LEFT };
        }

        return { valid: true };

      case 'buy_development_card':
        if (!this.hasResources(player.resources, this.BUILDING_COSTS.development_card)) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.INSUFFICIENT_RESOURCES };
        }
        if (state.developmentCardDeck.length === 0) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_CARDS_LEFT };
        }
        return { valid: true };

      case 'play_development_card':
        return this.validateDevelopmentCardPlay(move, state, player);

      case 'discard_resources':
        return this.validateDiscardResources(move, player, state);

      case 'move_robber':
        return this.validateRobberMove(move, state);

      case 'trade_with_bank':
        return this.validateBankTrade(move, state, player);

      case 'trade_with_player':
        return this.validatePlayerTrade(move, state, player);

      case 'end_turn':
        if (state.diceRoll === null) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_ROLL_DICE };
        }
        return { valid: true };

      default:
        return { valid: false, error: 'Invalid action' };
    }
  }

  private validateDevelopmentCardPlay(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): MoveValidationResult {
    if (!move.cardType) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_CARD_TYPE };
    }

    if (state.playedDevelopmentCardThisTurn) {
      return { valid: false, error: 'Only one development card can be played per turn' };
    }

    if (!player.developmentCards.includes(move.cardType)) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.NO_DEVELOPMENT_CARD };
    }

    const ownedCopies = player.developmentCards.filter((card) => card === move.cardType).length;
    const newlyBoughtCopies = (state.newDevelopmentCards?.[move.player] || []).filter(
      (card) => card === move.cardType
    ).length;
    if (ownedCopies <= newlyBoughtCopies) {
      return { valid: false, error: 'Cannot play a development card the turn you bought it' };
    }

    switch (move.cardType) {
      case 'knight':
        return this.validateRobberMove(move, state, { allowWithoutPending: true });
      case 'road_building':
        if (player.buildings.roads <= 0) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.NO_BUILDINGS_LEFT };
        }
        return this.validateFreeRoadPlacements(
          move.positions,
          move.player,
          state,
          Math.min(2, player.buildings.roads)
        );
      case 'year_of_plenty':
        if (!move.resources || move.resources.length !== 2) {
          return { valid: false, error: 'Year of Plenty requires exactly 2 resources' };
        }
        return { valid: true };
      case 'monopoly':
        if (!move.resource) {
          return { valid: false, error: 'Monopoly requires a resource to claim' };
        }
        return { valid: true };
      case 'victory_point':
        return { valid: false, error: 'Victory point cards are revealed automatically' };
      default:
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_CARD_TYPE };
    }
  }

  private validateFreeRoadPlacements(
    positions: number[] | undefined,
    playerId: string,
    state: CatanState,
    maxRoads: number
  ): MoveValidationResult {
    if (!positions || positions.length === 0 || positions.length > maxRoads) {
      return { valid: false, error: 'Road Building requires 1 or 2 legal road positions' };
    }

    if (new Set(positions).size !== positions.length) {
      return { valid: false, error: 'Road Building positions must be unique' };
    }

    const simulatedEdges = state.board.edges.map((edge) => ({
      ...edge,
      adjacentIntersections: [...edge.adjacentIntersections],
      road: edge.road ? { ...edge.road } : undefined,
    }));
    const simulatedState = {
      ...state,
      board: {
        ...state.board,
        edges: simulatedEdges,
      },
    };

    for (const position of positions) {
      const edge = simulatedState.board.edges[position];
      if (!edge) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_EDGE };
      }

      if (edge.road) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.EDGE_OCCUPIED };
      }

      if (!this.hasConnectionToEdge(position, playerId, simulatedState)) {
        return { valid: false, error: CATAN_ERROR_MESSAGES.NOT_CONNECTED };
      }

      edge.road = { player: playerId };
    }

    return { valid: true };
  }

  private getPlayersNeedingDiscard(state: CatanState): Record<string, number> {
    const pendingDiscards: Record<string, number> = {};

    for (const [playerId, player] of Object.entries(state.players)) {
      const totalCards = this.sumResourceCards(player.resources);
      if (totalCards > GAME_CONSTANTS.MAX_RESOURCE_CARDS_BEFORE_DISCARD) {
        pendingDiscards[playerId] = Math.floor(totalCards / 2);
      }
    }

    return pendingDiscards;
  }

  private getNextPendingDiscardPlayer(state: CatanState, afterPlayer: string): string | null {
    const pendingDiscards = state.pendingDiscards ?? {};
    const startIndex = state.playerOrder.indexOf(afterPlayer);

    for (let offset = 1; offset <= state.playerOrder.length; offset++) {
      const candidate = state.playerOrder[(startIndex + offset) % state.playerOrder.length]!;
      if ((pendingDiscards[candidate] ?? 0) > 0) {
        return candidate;
      }
    }

    return null;
  }

  private getPlayerPortTypes(state: CatanState, playerId: string): Set<PortType> {
    const portTypes = new Set<PortType>();

    for (const edge of state.board.edges) {
      if (!edge.port) {
        continue;
      }

      const controlsPort = edge.adjacentIntersections.some((intersectionId) => {
        return state.board.intersections[intersectionId]?.building?.player === playerId;
      });

      if (controlsPort) {
        portTypes.add(edge.port);
      }
    }

    return portTypes;
  }

  private getBankTradeRate(state: CatanState, playerId: string, offeredResource: Resource): number {
    const portTypes = this.getPlayerPortTypes(state, playerId);

    if (portTypes.has(offeredResource)) {
      return 2;
    }

    if (portTypes.has('three_for_one')) {
      return 3;
    }

    return 4;
  }

  private getEligibleRobberVictims(thief: string, hexId: number, state: CatanState): string[] {
    const adjacentPlayers = new Set<string>();

    for (const intersection of state.board.intersections) {
      if (intersection.adjacentHexes.includes(hexId) && intersection.building) {
        const buildingOwner = intersection.building.player;
        const victim = state.players[buildingOwner];
        const totalResources = victim
          ? Object.values(victim.resources).reduce((sum, count) => sum + count, 0)
          : 0;

        if (buildingOwner !== thief && totalResources > 0) {
          adjacentPlayers.add(buildingOwner);
        }
      }
    }

    return Array.from(adjacentPlayers);
  }

  private validateRobberMove(
    move: CatanMove,
    state: CatanState,
    options: { allowWithoutPending?: boolean } = {}
  ): MoveValidationResult {
    if (!options.allowWithoutPending && !state.pendingRobberMove) {
      return { valid: false, error: 'Robber can only be moved after a 7 is rolled' };
    }

    if (typeof move.position !== 'number') {
      return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
    }

    if (move.position < 0 || move.position >= state.board.hexes.length) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_HEX_POSITION };
    }

    if (move.position === state.robberPosition) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.ROBBER_SAME_POSITION };
    }

    const eligibleVictims = this.getEligibleRobberVictims(move.player, move.position, state);
    if (move.targetPlayer && !eligibleVictims.includes(move.targetPlayer)) {
      return { valid: false, error: 'Invalid target player for robber steal' };
    }

    if (!move.targetPlayer && eligibleVictims.length > 1) {
      return { valid: false, error: 'Must specify which adjacent player to steal from' };
    }

    return { valid: true };
  }

  private validateDiscardResources(
    move: CatanMove,
    player: CatanState['players'][string],
    state: CatanState
  ): MoveValidationResult {
    const requiredDiscardCount = state.pendingDiscards?.[move.player] ?? 0;

    if (requiredDiscardCount <= 0) {
      return { valid: false, error: 'This player does not need to discard' };
    }

    if (!move.discarding) {
      return { valid: false, error: 'Must specify which resources to discard' };
    }

    for (const [resource, amount] of this.getResourceEntries(move.discarding)) {
      if (player.resources[resource] < amount) {
        return { valid: false, error: `Insufficient ${resource} to discard` };
      }
    }

    if (this.sumResourceCards(move.discarding) !== requiredDiscardCount) {
      return {
        valid: false,
        error: `Must discard exactly ${requiredDiscardCount} resource cards`,
      };
    }

    return { valid: true };
  }

  private validateBankTrade(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): MoveValidationResult {
    if (!move.tradeOffer) {
      return { valid: false, error: 'Must specify trade offer' };
    }

    const { offering, requesting } = move.tradeOffer;
    const offeringEntries = this.getResourceEntries(offering);
    const requestingEntries = this.getResourceEntries(requesting);

    if (offeringEntries.length !== 1 || requestingEntries.length !== 1) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_TRADE_RATIO };
    }

    const [offeredResource, offeredAmount] = offeringEntries[0]!;
    const [requestedResource, requestedAmount] = requestingEntries[0]!;

    if (requestedAmount !== 1 || requestedResource === offeredResource) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_TRADE_RATIO };
    }

    if (player.resources[offeredResource] < offeredAmount) {
      return { valid: false, error: `Insufficient ${offeredResource} to trade` };
    }

    const requiredAmount = this.getBankTradeRate(state, move.player, offeredResource);
    if (offeredAmount !== requiredAmount) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_TRADE_RATIO };
    }

    return { valid: true };
  }

  private validatePlayerTrade(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): MoveValidationResult {
    if (!move.targetPlayer) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_TARGET_PLAYER };
    }

    if (!state.players[move.targetPlayer]) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_TARGET_PLAYER };
    }

    if (move.targetPlayer === move.player) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.CANNOT_TRADE_WITH_SELF };
    }

    if (!move.tradeOffer) {
      return { valid: false, error: 'Must specify trade offer' };
    }

    const { offering, requesting } = move.tradeOffer;

    // Check if current player has resources to offer
    for (const [resource, amount] of Object.entries(offering)) {
      if (player.resources[resource as Resource] < (amount || 0)) {
        return { valid: false, error: `Insufficient ${resource} to trade` };
      }
    }

    // Check if target player has resources requested
    const targetPlayer = state.players[move.targetPlayer]!;
    for (const [resource, amount] of Object.entries(requesting)) {
      if (targetPlayer.resources[resource as Resource] < (amount || 0)) {
        return { valid: false, error: `Target player has insufficient ${resource}` };
      }
    }

    return { valid: true };
  }

  private updateLargestArmy(state: CatanState): void {
    // Find player with most knights (3+ needed for largest army)
    let maxKnights = 0;
    let armyHolder: string | null = null;

    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.largestArmy >= 3 && player.largestArmy > maxKnights) {
        maxKnights = player.largestArmy;
        armyHolder = playerId;
      }
    }

    // Update largest army holder
    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.hasLargestArmy && playerId !== armyHolder) {
        player.hasLargestArmy = false;
        player.victoryPoints -= 2;
      }
    }

    if (armyHolder && !state.players[armyHolder]!.hasLargestArmy) {
      state.players[armyHolder]!.hasLargestArmy = true;
      state.players[armyHolder]!.victoryPoints += 2;
    }
  }

  private buildFreeRoads(state: CatanState, playerId: string, positions: number[]): void {
    const player = state.players[playerId]!;

    for (const position of positions) {
      const edge = state.board.edges[position]!;
      edge.road = { player: playerId };
      player.buildings.roads--;
    }

    this.updateLongestRoad(state);
  }

  private moveRobber(move: CatanMove, state: CatanState): void {
    const oldPos = state.robberPosition;
    const newPos = move.position!;

    state.board.hexes[oldPos]!.hasRobber = false;
    state.board.hexes[newPos]!.hasRobber = true;
    state.robberPosition = newPos;
    state.pendingRobberMove = false;
    state.pendingDiscards = {};
    state.robberTriggeringPlayer = null;

    const eligibleVictims = this.getEligibleRobberVictims(move.player, newPos, state);
    const victim = move.targetPlayer ?? (eligibleVictims.length === 1 ? eligibleVictims[0]! : null);

    if (victim) {
      this.stealRandomResource(move.player, victim, state);
    }
  }

  private stealRandomResource(thief: string, victim: string, state: CatanState): void {
    const victimPlayer = state.players[victim]!;

    const resources: Resource[] = [];
    for (const [resource, count] of Object.entries(victimPlayer.resources)) {
      for (let i = 0; i < count; i++) {
        resources.push(resource as Resource);
      }
    }

    if (resources.length > 0) {
      const stolenResource = resources[Math.floor(Math.random() * resources.length)]!;
      victimPlayer.resources[stolenResource]--;
      state.players[thief]!.resources[stolenResource]++;
    }
  }
  private executeBankTrade(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    const { offering, requesting } = move.tradeOffer!;
    const [offeredResource, offeredAmount] = this.getResourceEntries(offering)[0]!;
    const [requestedResource] = this.getResourceEntries(requesting)[0]!;
    const requiredAmount = this.getBankTradeRate(state, move.player, offeredResource);

    player.resources[offeredResource] -= Math.min(offeredAmount, requiredAmount);
    player.resources[requestedResource] += 1;
  }

  private executePlayerTrade(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    const { offering, requesting } = move.tradeOffer!;
    const targetPlayer = state.players[move.targetPlayer!]!;

    // Remove offered resources from current player
    for (const [resource, amount] of Object.entries(offering)) {
      player.resources[resource as Resource] -= amount || 0;
    }

    // Add offered resources to target player
    for (const [resource, amount] of Object.entries(offering)) {
      targetPlayer.resources[resource as Resource] += amount || 0;
    }

    // Remove requested resources from target player
    for (const [resource, amount] of Object.entries(requesting)) {
      targetPlayer.resources[resource as Resource] -= amount || 0;
    }

    // Add requested resources to current player
    for (const [resource, amount] of Object.entries(requesting)) {
      player.resources[resource as Resource] += amount || 0;
    }
  }

  private hasConnectionToEdge(edgeId: number, playerId: string, state: CatanState): boolean {
    const edge = state.board.edges[edgeId];
    if (!edge) {
      return false;
    }

    return edge.adjacentIntersections.some((intersectionId) => {
      const intersection = state.board.intersections[intersectionId];
      if (intersection?.building?.player === playerId) {
        return true;
      }

      if (this.isIntersectionBlockedByOpponentBuilding(intersectionId, playerId, state)) {
        return false;
      }

      return this.getIncidentEdges(intersectionId, state).some(
        (otherEdge) => otherEdge.id !== edgeId && otherEdge.road?.player === playerId
      );
    });
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const catanMove = move.moveData as CatanMove;
    const state = this.currentState as CatanState;

    if (state.gamePhase === 'setup') {
      this.handleSetupMove(catanMove, state);
    } else {
      this.handlePlayingMove(catanMove, state);
    }

    // Check for victory
    this.checkVictoryCondition(state);
  }

  private handleSetupMove(move: CatanMove, state: CatanState): void {
    const player = state.players[move.player]!;

    if (move.action === 'build_settlement') {
      const intersection = state.board.intersections[move.position!]!;
      intersection.building = { type: 'settlement', player: move.player };
      player.buildings.settlements--;
      player.victoryPoints++;

      // Mark settlement as placed
      if (state.setupPhaseState) {
        state.setupPhaseState.placedBuildings[move.player]!.settlement = true;
        state.setupPhaseState.placedBuildings[move.player]!.settlementPosition = move.position!;
      }

      // In setup round 2, collect resources from adjacent hexes
      if (state.setupRound === 2) {
        for (const hexId of intersection.adjacentHexes) {
          const hex = state.board.hexes[hexId];
          if (hex && hex.resource !== 'desert') {
            player.resources[hex.resource as Resource]++;
          }
        }
      }
    }

    if (move.action === 'build_road') {
      const edge = state.board.edges[move.position!]!;
      edge.road = { player: move.player };
      player.buildings.roads--;

      // Mark road as placed
      if (state.setupPhaseState) {
        state.setupPhaseState.placedBuildings[move.player]!.road = true;
      }

      // Only advance setup phase after both settlement and road are placed
      this.advanceSetupPhase(state);
    }

    state.lastAction = {
      action: move.action,
      player: move.player,
      details: `${move.player} built ${move.action.split('_')[1]} during setup`,
    };
  }

  private handlePlayingMove(move: CatanMove, state: CatanState): void {
    const player = state.players[move.player]!;

    switch (move.action) {
      case 'roll_dice': {
        const roll = this.rollDice();
        state.diceRoll = roll;

        if (roll === 7) {
          this.handleRobber(state, move.player);
        } else {
          this.distributeResources(roll, state);
        }
        break;
      }

      case 'build_settlement':
        this.buildSettlement(move, state, player);
        break;

      case 'build_city':
        this.buildCity(move, state, player);
        break;

      case 'build_road':
        this.buildRoad(move, state, player);
        break;

      case 'buy_development_card':
        this.buyDevelopmentCard(state, move.player, player);
        break;

      case 'play_development_card':
        this.playDevelopmentCard(move, state, player);
        state.playedDevelopmentCardThisTurn = true;
        break;

      case 'discard_resources':
        this.discardResources(move, state, player);
        break;

      case 'move_robber':
        this.moveRobber(move, state);
        break;

      case 'trade_with_bank':
        this.executeBankTrade(move, state, player);
        break;

      case 'trade_with_player':
        this.executePlayerTrade(move, state, player);
        break;

      case 'end_turn':
        this.endTurn(state);
        break;
    }

    state.lastAction = {
      action: move.action,
      player: move.player,
      details: `${move.player} performed ${move.action.replace('_', ' ')}`,
    };
  }

  private advanceSetupPhase(state: CatanState): void {
    const playerCount = state.playerOrder.length;
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);

    // Reset current player's setup state
    if (state.setupPhaseState) {
      state.setupPhaseState.placedBuildings[state.currentPlayer] = {
        settlement: false,
        road: false,
        settlementPosition: null,
      };
    }

    if (state.setupRound === 1) {
      if (currentIndex === playerCount - 1) {
        // Last player in round 1, start round 2 in reverse order
        state.setupRound = 2;
        // Current player stays the same (last player goes first in round 2)
      } else {
        // Next player in round 1
        state.currentPlayer = state.playerOrder[currentIndex + 1]!;
      }
    } else {
      // Round 2
      if (currentIndex === 0) {
        // First player finished round 2, start main game
        state.gamePhase = 'playing';
        state.currentPlayer = state.playerOrder[0]!;
        // Clear setup phase state as it's no longer needed
        delete (state as any).setupPhaseState;
      } else {
        // Previous player in round 2 (reverse order)
        state.currentPlayer = state.playerOrder[currentIndex - 1]!;
      }
    }
  }

  private handleRobber(state: CatanState, triggeringPlayer: string): void {
    const pendingDiscards = this.getPlayersNeedingDiscard(state);
    state.pendingDiscards = pendingDiscards;
    state.robberTriggeringPlayer = triggeringPlayer;
    state.pendingRobberMove = false;

    const triggeringIndex = state.playerOrder.indexOf(triggeringPlayer);
    for (let offset = 0; offset < state.playerOrder.length; offset++) {
      const candidate = state.playerOrder[(triggeringIndex + offset) % state.playerOrder.length]!;
      if ((pendingDiscards[candidate] ?? 0) > 0) {
        state.currentPlayer = candidate;
        return;
      }
    }

    state.pendingRobberMove = true;
  }

  private discardResources(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    for (const [resource, amount] of this.getResourceEntries(move.discarding ?? {})) {
      player.resources[resource] -= amount;
    }

    if (state.pendingDiscards) {
      delete state.pendingDiscards[move.player];
    }

    const nextDiscardPlayer = this.getNextPendingDiscardPlayer(state, move.player);
    if (nextDiscardPlayer) {
      state.currentPlayer = nextDiscardPlayer;
      return;
    }

    state.pendingDiscards = {};
    state.currentPlayer = state.robberTriggeringPlayer ?? move.player;
    state.pendingRobberMove = true;
  }

  private buildSettlement(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    // Deduct resources
    this.deductResources(player.resources, this.BUILDING_COSTS.settlement);

    // Place building
    const intersection = state.board.intersections[move.position!]!;
    intersection.building = { type: 'settlement', player: move.player };
    player.buildings.settlements--;
    player.victoryPoints++;
  }

  private buildCity(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    // Deduct resources
    this.deductResources(player.resources, this.BUILDING_COSTS.city);

    // Upgrade settlement to city
    const intersection = state.board.intersections[move.position!]!;
    (intersection as any).building = {
      type: 'city',
      player: intersection.building!.player,
    };
    player.buildings.settlements++; // Return settlement piece
    player.buildings.cities--;
    player.victoryPoints++; // Cities give 2 VP total (settlement was already 1)
  }

  private buildRoad(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    // Deduct resources
    this.deductResources(player.resources, this.BUILDING_COSTS.road);

    // Place road
    const edge = state.board.edges[move.position!]!;
    edge.road = { player: move.player };
    player.buildings.roads--;

    // Update longest road after each road placement
    this.updateLongestRoad(state);
  }

  private buyDevelopmentCard(
    state: CatanState,
    playerId: string,
    player: CatanState['players'][string]
  ): void {
    this.deductResources(player.resources, this.BUILDING_COSTS.development_card);

    const card = state.developmentCardDeck.pop()!;
    player.developmentCards.push(card);
    state.newDevelopmentCards ??= {};
    state.newDevelopmentCards[playerId] ??= [];
    state.newDevelopmentCards[playerId]!.push(card);

    if (card === 'victory_point') {
      player.victoryPoints++;
    }
  }

  private deductResources(
    playerResources: MutableResourceCards,
    cost: Partial<ResourceCards>
  ): void {
    for (const [resource, amount] of Object.entries(cost)) {
      (playerResources as any)[resource as Resource] -= amount || 0;
    }
  }

  private updateLongestRoad(state: CatanState): void {
    for (const [playerId, player] of Object.entries(state.players)) {
      player.longestRoad = this.calculateLongestRoad(state, playerId);
    }

    const currentHolder =
      Object.entries(state.players).find(([, player]) => player.hasLongestRoad)?.[0] ?? null;
    const maxRoadLength = Math.max(
      0,
      ...Object.values(state.players).map((player) => player.longestRoad)
    );
    const eligiblePlayers = Object.entries(state.players)
      .filter(([, player]) => {
        return (
          player.longestRoad >= GAME_CONSTANTS.LONGEST_ROAD_MIN &&
          player.longestRoad === maxRoadLength
        );
      })
      .map(([playerId]) => playerId);

    let nextHolder: string | null = null;
    if (currentHolder && eligiblePlayers.includes(currentHolder)) {
      nextHolder = currentHolder;
    } else if (eligiblePlayers.length === 1) {
      nextHolder = eligiblePlayers[0]!;
    }

    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.hasLongestRoad && playerId !== nextHolder) {
        player.hasLongestRoad = false;
        player.victoryPoints -= 2;
      }
    }

    if (nextHolder && !state.players[nextHolder]!.hasLongestRoad) {
      state.players[nextHolder]!.hasLongestRoad = true;
      state.players[nextHolder]!.victoryPoints += 2;
    }
  }

  private calculateLongestRoad(state: CatanState, playerId: string): number {
    const roadMap = new Map<number, number[]>();

    for (const edge of state.board.edges) {
      if (edge.road?.player !== playerId) {
        continue;
      }

      for (const intersectionId of edge.adjacentIntersections) {
        const existing = roadMap.get(intersectionId) ?? [];
        existing.push(edge.id);
        roadMap.set(intersectionId, existing);
      }
    }

    if (roadMap.size === 0) {
      return 0;
    }

    const walk = (intersectionId: number, usedEdges: Set<number>): number => {
      if (
        usedEdges.size > 0 &&
        this.isIntersectionBlockedByOpponentBuilding(intersectionId, playerId, state)
      ) {
        return 0;
      }

      let best = 0;
      for (const edgeId of roadMap.get(intersectionId) ?? []) {
        if (usedEdges.has(edgeId)) {
          continue;
        }

        usedEdges.add(edgeId);
        const edge = state.board.edges[edgeId]!;
        const nextIntersection =
          edge.adjacentIntersections[0] === intersectionId
            ? edge.adjacentIntersections[1]!
            : edge.adjacentIntersections[0]!;
        best = Math.max(best, 1 + walk(nextIntersection, usedEdges));
        usedEdges.delete(edgeId);
      }

      return best;
    };

    let longestRoad = 0;
    for (const intersectionId of roadMap.keys()) {
      longestRoad = Math.max(longestRoad, walk(intersectionId, new Set<number>()));
    }

    return longestRoad;
  }

  private endTurn(state: CatanState): void {
    const endingPlayer = state.currentPlayer;
    state.diceRoll = null;
    state.pendingRobberMove = false;
    state.pendingDiscards = {};
    state.robberTriggeringPlayer = null;
    state.playedDevelopmentCardThisTurn = false;

    if (state.newDevelopmentCards?.[endingPlayer]) {
      state.newDevelopmentCards[endingPlayer] = [];
    }

    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    state.currentPlayer = state.playerOrder[(currentIndex + 1) % state.playerOrder.length]!;
  }

  private checkVictoryCondition(state: CatanState): void {
    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.victoryPoints >= this.VICTORY_POINTS_TO_WIN) {
        state.gameOver = true;
        state.winner = playerId;
        state.gamePhase = 'finished';
        break;
      }
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as CatanState;

    if (!state || !state.board || !state.players) {
      // Return minimal state if not initialized
      return {
        gameId: this.gameId,
        gameType: this.gameType,
        gameOver: false,
        winner: null,
        currentPlayer: 'player1',
      };
    }

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: state.gameOver,
      winner: state.winner,
      currentPlayer: state.currentPlayer,
      // Catan-specific state
      board: state.board,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            resources: player.resources,
            developmentCards: player.developmentCards.length, // Hide actual cards
            buildings: player.buildings,
            victoryPoints: player.victoryPoints,
            hasLongestRoad: player.hasLongestRoad,
            hasLargestArmy: player.hasLargestArmy,
            isCurrentPlayer: state.currentPlayer === id,
          },
        ])
      ),
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      setupRound: state.setupRound,
      diceRoll: state.diceRoll,
      robberPosition: state.robberPosition,
      pendingRobberMove: state.pendingRobberMove ?? false,
      pendingDiscards: state.pendingDiscards ?? {},
      lastAction: state.lastAction,
      developmentCardsLeft: state.developmentCardDeck.length,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as CatanState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as CatanState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Settlers of Catan',
      description:
        'Strategy board game about building settlements, cities, and roads while trading resources',
      minPlayers: 3,
      maxPlayers: 4,
      estimatedDuration: '60-120 minutes',
      complexity: 'advanced',
      categories: ['strategy', 'building', 'trading', 'resource management'],
    };
  }

  private playDevelopmentCard(
    move: CatanMove,
    state: CatanState,
    player: CatanState['players'][string]
  ): void {
    const cardType = move.cardType!;

    const cardIndex = player.developmentCards.indexOf(cardType);
    player.developmentCards.splice(cardIndex, 1);

    switch (cardType) {
      case 'knight':
        player.largestArmy++;
        this.updateLargestArmy(state);
        this.moveRobber(move, state);
        break;

      case 'road_building':
        this.buildFreeRoads(state, move.player, move.positions ?? []);
        break;

      case 'year_of_plenty':
        for (const resource of move.resources ?? []) {
          player.resources[resource]++;
        }
        break;

      case 'monopoly': {
        const monopolyResource = move.resource!;
        let totalTaken = 0;
        for (const [playerId, otherPlayer] of Object.entries(state.players)) {
          if (playerId !== move.player) {
            totalTaken += otherPlayer.resources[monopolyResource];
            otherPlayer.resources[monopolyResource] = 0;
          }
        }
        player.resources[monopolyResource] += totalTaken;
        break;
      }
    }
  }
  // Add back the missing method with bounds checking
  private hasConnectionToIntersection(
    intersectionId: number,
    playerId: string,
    state: CatanState
  ): boolean {
    return this.hasConnectionToIntersectionOptimized(intersectionId, playerId, state);
  }
}

export function createCatanGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): CatanGame {
  return new CatanGame(gameId, database);
}













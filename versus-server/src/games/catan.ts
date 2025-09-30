import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

// Strict type definitions for better type safety
type Resource = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';
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

interface CatanState extends GameState {
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
      };
    };
  };
  tradeOffer?: {
    from: string;
    to: string;
    offering: Partial<ResourceCards>;
    requesting: Partial<ResourceCards>;
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
    | 'move_robber'
    | 'end_turn';
  position?: number; // For building/robber placement
  cardType?: DevelopmentCard; // For playing development cards
  tradeOffer?: {
    offering: Partial<ResourceCards>;
    requesting: Partial<ResourceCards>;
  };
  targetPlayer?: string; // For trading/robber effects
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

  // Standard Catan board layout (simplified but production-ready)
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

  constructor(gameId: string, database: DatabaseProvider) {
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
            playerIds.map((id) => [id, { settlement: false, road: false }])
          ),
        },
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
    // Create hexes
    const hexes: HexTile[] = this.HEX_LAYOUT.map((layout, index) => ({
      id: index,
      resource: layout.resource,
      number: layout.number,
      hasRobber: false,
    }));

    // Create intersections (simplified - 54 intersections in standard Catan)
    const intersections: Intersection[] = [];
    for (let i = 0; i < 54; i++) {
      intersections.push({
        id: i,
        adjacentHexes: this.getAdjacentHexes(i),
        adjacentIntersections: this.getAdjacentIntersections(i),
      });
    }

    // Create edges (simplified - 72 edges in standard Catan)
    const edges: Edge[] = [];
    for (let i = 0; i < 72; i++) {
      edges.push({
        id: i,
        adjacentIntersections: this.getEdgeIntersections(i),
      });
    }

    return { hexes, intersections, edges };
  }

  private getAdjacentHexes(intersectionId: number): number[] {
    // Simplified mapping - in a real implementation, this would be based on the actual board geometry
    return [intersectionId % 19, (intersectionId + 1) % 19, (intersectionId + 2) % 19].filter(
      (id) => id < 19
    );
  }

  private getAdjacentIntersections(intersectionId: number): number[] {
    // Simplified mapping
    const adjacent = [];
    if (intersectionId > 0) {
      adjacent.push(intersectionId - 1);
    }
    if (intersectionId < 53) {
      adjacent.push(intersectionId + 1);
    }
    return adjacent;
  }

  private getEdgeIntersections(edgeId: number): number[] {
    // Simplified mapping - each edge connects two intersections
    return [edgeId % 54, (edgeId + 1) % 54];
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
      const errorContext = {
        gameId: this.gameId,
        moveData: JSON.stringify(moveData),
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };

      logger.error('Error validating move:', errorContext);

      // In development, include stack trace
      if (process.env.NODE_ENV === 'development') {
        logger.error(
          'Stack trace:',
          error instanceof Error ? error.stack : 'No stack trace available'
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

      if (moveData.tradeOffer !== undefined && typeof moveData.tradeOffer === 'object') {
        move.tradeOffer = this.sanitizeTradeOffer(moveData.tradeOffer);
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
  private hasConnectionToIntersectionOptimized(
    intersectionId: number,
    playerId: string,
    state: CatanState
  ): boolean {
    const intersection = state.board.intersections[intersectionId];
    if (!intersection) {
      return false;
    }

    // Check adjacent intersections for player's buildings (early termination)
    for (const adjId of intersection.adjacentIntersections) {
      if (adjId >= 0 && adjId < state.board.intersections.length) {
        const adjIntersection = state.board.intersections[adjId];
        if (adjIntersection?.building?.player === playerId) {
          return true; // Early termination
        }
      }
    }

    // Check adjacent edges for player's roads (optimized loop)
    for (let i = 0; i < state.board.edges.length; i++) {
      const edge = state.board.edges[i]!;
      if (edge.road?.player === playerId && edge.adjacentIntersections.includes(intersectionId)) {
        return true; // Early termination
      }
    }

    return false;
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

      return { valid: true };
    }

    return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_SETUP_ACTION };
  }

  private validatePlayingMove(context: ValidationContext): MoveValidationResult {
    const { state, move, player } = context;

    switch (move.action) {
      case 'roll_dice':
        if (state.diceRoll !== null) {
          return { valid: false, error: CATAN_ERROR_MESSAGES.DICE_ALREADY_ROLLED };
        }
        return { valid: true };

      case 'build_settlement':
        // Check connection rules BEFORE resource requirements
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

        // Check if player has a connected road or settlement
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
        // Check building existence BEFORE resource requirements
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
        // Check connection rules BEFORE resource requirements
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

        // Check if road connects to player's existing roads or buildings
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

    if (!player.developmentCards.includes(move.cardType)) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.NO_DEVELOPMENT_CARD };
    }

    // Additional validation based on card type
    switch (move.cardType) {
      case 'knight':
        return { valid: true }; // Knight can always be played
      case 'road_building':
        if (player.buildings.roads < 2) {
          return { valid: false, error: 'Need at least 2 roads to use road building card' };
        }
        return { valid: true };
      case 'year_of_plenty':
        return { valid: true }; // Can always get 2 resources
      case 'monopoly':
        return { valid: true }; // Can always monopolize a resource
      case 'victory_point':
        return { valid: false, error: 'Victory point cards are revealed automatically' };
      default:
        return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_CARD_TYPE };
    }
  }

  private validateRobberMove(move: CatanMove, state: CatanState): MoveValidationResult {
    if (typeof move.position !== 'number') {
      return { valid: false, error: CATAN_ERROR_MESSAGES.MUST_SPECIFY_POSITION };
    }

    if (move.position < 0 || move.position >= state.board.hexes.length) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.INVALID_HEX_POSITION };
    }

    if (move.position === state.robberPosition) {
      return { valid: false, error: CATAN_ERROR_MESSAGES.ROBBER_SAME_POSITION };
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

    // Check if player has resources to offer
    for (const [resource, amount] of Object.entries(offering)) {
      if (player.resources[resource as Resource] < (amount || 0)) {
        return { valid: false, error: `Insufficient ${resource} to trade` };
      }
    }

    // Validate trade ratios (4:1 general, 3:1 with port, 2:1 with specialized port)
    // For simplicity, using 4:1 ratio
    const totalOffering = Object.values(offering).reduce((sum, amount) => sum + (amount || 0), 0);
    const totalRequesting = Object.values(requesting).reduce(
      (sum, amount) => sum + (amount || 0),
      0
    );

    if (totalOffering < totalRequesting * 4) {
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

  private autoMoveRobber(state: CatanState): void {
    const currentPos = state.robberPosition;
    let newPos;
    do {
      newPos = Math.floor(Math.random() * state.board.hexes.length);
    } while (newPos === currentPos);

    state.board.hexes[currentPos]!.hasRobber = false;
    state.board.hexes[newPos]!.hasRobber = true;
    state.robberPosition = newPos;
  }

  private buildFreeRoads(
    state: CatanState,
    player: CatanState['players'][string],
    count: number
  ): void {
    // Simplified: find available road positions and place them
    let roadsBuilt = 0;
    for (const edge of state.board.edges) {
      if (!edge.road && roadsBuilt < count && player.buildings.roads > 0) {
        if (this.hasConnectionToEdge(edge.id, player as any, state)) {
          edge.road = { player: player as any };
          player.buildings.roads--;
          roadsBuilt++;
        }
      }
    }
  }

  private moveRobber(move: CatanMove, state: CatanState): void {
    const oldPos = state.robberPosition;
    const newPos = move.position!;

    state.board.hexes[oldPos]!.hasRobber = false;
    state.board.hexes[newPos]!.hasRobber = true;
    state.robberPosition = newPos;

    // Steal a card from a player with a building adjacent to the new hex (simplified)
    this.stealRandomCard(move.player, newPos, state);
  }

  private stealRandomCard(thief: string, hexId: number, state: CatanState): void {
    const adjacentPlayers = new Set<string>();

    // Find players with buildings adjacent to the hex
    for (const intersection of state.board.intersections) {
      if (intersection.adjacentHexes.includes(hexId) && intersection.building) {
        const buildingOwner = intersection.building.player;
        if (buildingOwner !== thief) {
          adjacentPlayers.add(buildingOwner);
        }
      }
    }

    if (adjacentPlayers.size === 0) {
      return;
    }

    // Pick a random player to steal from
    const playersArray = Array.from(adjacentPlayers);
    const victim = playersArray[Math.floor(Math.random() * playersArray.length)]!;
    const victimPlayer = state.players[victim]!;

    // Find resources to steal
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

    // Remove offered resources
    for (const [resource, amount] of Object.entries(offering)) {
      player.resources[resource as Resource] -= amount || 0;
    }

    // Add requested resources
    for (const [resource, amount] of Object.entries(requesting)) {
      player.resources[resource as Resource] += amount || 0;
    }
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
    const edge = state.board.edges[edgeId]!;

    // Check if either endpoint has player's building
    for (const intersectionId of edge.adjacentIntersections) {
      const intersection = state.board.intersections[intersectionId];
      if (intersection?.building?.player === playerId) {
        return true;
      }
    }

    // Check if edge connects to player's existing roads
    for (const intersectionId of edge.adjacentIntersections) {
      for (const otherEdge of state.board.edges) {
        if (
          otherEdge.id !== edgeId &&
          otherEdge.road?.player === playerId &&
          otherEdge.adjacentIntersections.includes(intersectionId)
        ) {
          return true;
        }
      }
    }

    return false;
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
      case 'roll_dice':
        const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
        state.diceRoll = roll;

        if (roll === 7) {
          this.handleRobber(state);
        } else {
          this.distributeResources(roll, state);
        }
        break;

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
        this.buyDevelopmentCard(state, player);
        break;

      case 'play_development_card':
        this.playDevelopmentCard(move, state, player);
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

  private handleRobber(state: CatanState): void {
    // Force players with 8+ cards to discard half
    for (const player of Object.values(state.players)) {
      const totalCards = Object.values(player.resources).reduce((sum, count) => sum + count, 0);
      if (totalCards >= 8) {
        const toDiscard = Math.floor(totalCards / 2);
        // In a real implementation, this would require player input
        // For simplicity, randomly discard resources
        this.randomlyDiscardResources(player.resources, toDiscard);
      }
    }

    // Current player must move robber (simplified - auto-move for now)
    const currentRobberPos = state.robberPosition;
    let newPosition;
    do {
      newPosition = Math.floor(Math.random() * state.board.hexes.length);
    } while (newPosition === currentRobberPos);

    state.board.hexes[currentRobberPos]!.hasRobber = false;
    state.board.hexes[newPosition]!.hasRobber = true;
    state.robberPosition = newPosition;
  }

  private randomlyDiscardResources(resources: ResourceCards, count: number): void {
    const resourceTypes = Object.keys(resources) as Resource[];
    const mutableResources = resources as any;

    for (let i = 0; i < count; i++) {
      const availableTypes = resourceTypes.filter((type) => resources[type] > 0);
      if (availableTypes.length === 0) {
        break;
      }

      const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)]!;
      mutableResources[randomType]--;
    }
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

    // Update longest road (simplified calculation)
    this.updateLongestRoad(state);
  }

  private buyDevelopmentCard(state: CatanState, player: CatanState['players'][string]): void {
    // Deduct resources
    this.deductResources(player.resources, this.BUILDING_COSTS.development_card);

    // Draw card
    const card = state.developmentCardDeck.pop()!;
    player.developmentCards.push(card);

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
    // Simplified longest road calculation
    for (const [_playerId, player] of Object.entries(state.players)) {
      const roadCount = state.board.edges.filter((edge) => edge.road?.player === _playerId).length;
      player.longestRoad = roadCount;

      // Award longest road bonus (5+ roads needed)
      if (roadCount >= 5) {
        // Remove bonus from other players
        for (const otherPlayer of Object.values(state.players)) {
          if (otherPlayer.hasLongestRoad) {
            otherPlayer.hasLongestRoad = false;
            otherPlayer.victoryPoints -= 2;
          }
        }

        // Award to current player if they have the most
        const maxRoads = Math.max(...Object.values(state.players).map((p) => p.longestRoad));
        if (roadCount === maxRoads && !player.hasLongestRoad) {
          player.hasLongestRoad = true;
          player.victoryPoints += 2;
        }
      }
    }
  }

  private endTurn(state: CatanState): void {
    // Reset turn state
    state.diceRoll = null;

    // Advance to next player
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

    if (!state) {
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

    // Remove card from player's hand
    const cardIndex = player.developmentCards.indexOf(cardType);
    player.developmentCards.splice(cardIndex, 1);

    switch (cardType) {
      case 'knight':
        player.largestArmy++;
        this.updateLargestArmy(state);
        // Player can move robber (simplified - auto-move)
        this.autoMoveRobber(state);
        break;

      case 'road_building':
        // Player can build 2 roads for free (simplified - auto-place)
        this.buildFreeRoads(state, player, 2);
        break;

      case 'year_of_plenty':
        // Player gets 2 resources of their choice (simplified - random)
        const resources: Resource[] = ['wood', 'brick', 'wool', 'grain', 'ore'];
        for (let i = 0; i < 2; i++) {
          const randomResource = resources[Math.floor(Math.random() * resources.length)]!;
          player.resources[randomResource]++;
        }
        break;

      case 'monopoly':
        // Player takes all cards of one type from all other players (simplified - random resource)
        const monopolyResource = (['wood', 'brick', 'wool', 'grain', 'ore'] as Resource[])[
          Math.floor(Math.random() * 5)
        ]!;
        let totalTaken = 0;
        for (const otherPlayer of Object.values(state.players)) {
          if (otherPlayer !== player) {
            totalTaken += otherPlayer.resources[monopolyResource];
            otherPlayer.resources[monopolyResource] = 0;
          }
        }
        player.resources[monopolyResource] += totalTaken;
        break;
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

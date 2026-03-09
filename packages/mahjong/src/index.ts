import { InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';
import { BaseGame } from '@llmletsplay/versus-game-core';
import type { DatabaseProvider } from '@llmletsplay/versus-game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@llmletsplay/versus-game-core';

type Suit = 'bamboo' | 'character' | 'dot';
type Wind = 'east' | 'south' | 'west' | 'north';
type Dragon = 'red' | 'green' | 'white';
type Honor = Wind | Dragon;
type TileType = 'suit' | 'honor';

interface MahjongTile {
  type: TileType;
  suit?: Suit;
  honor?: Honor;
  value?: number;
  id: string;
}

export interface MahjongMeldState {
  tiles: MahjongTile[];
  type: 'sequence' | 'triplet' | 'kong';
  concealed: boolean;
}

export interface MahjongFanBreakdown {
  name: string;
  fan: number;
}

export interface MahjongWinningResult {
  player: string;
  method: 'self_draw' | 'discard';
  totalFan: number;
  score: number;
  payments: { [playerId: string]: number };
  breakdown: MahjongFanBreakdown[];
}

export interface MahjongState extends GameState {
  hands: { [playerId: string]: MahjongTile[] };
  wall: MahjongTile[];
  discardPile: MahjongTile[];
  currentPlayer: string;
  playerOrder: string[];
  gameOver: boolean;
  winner: string | null;
  gamePhase: 'playing' | 'finished';
  lastDiscard: MahjongTile | null;
  roundNumber: number;
  dealer: string;
  prevalentWind: Wind;
  seatWinds: { [playerId: string]: Wind };
  sessionScores: { [playerId: string]: number };
  lastAction: {
    action: string;
    player?: string;
    tile?: MahjongTile;
    details?: string;
  } | null;
  melds: { [playerId: string]: MahjongTile[][] };
  meldStates: { [playerId: string]: MahjongMeldState[] };
  lastDiscardPlayer: string | null;
  claimWindow: {
    tile: MahjongTile;
    discardedBy: string;
    nextPlayer: string;
    phase: 'ron' | 'pon' | 'chi';
    pendingPlayers: string[];
    source: 'discard' | 'rob_kong';
  } | null;
  supplementalDrawsUsed: number;
  lastTilePointReached: boolean;
  lastDrawSource: 'live_wall' | 'replacement' | null;
  pendingAddedKong: { player: string; tile: MahjongTile; meldIndex: number } | null;
  winningResult: MahjongWinningResult | null;
}

interface MahjongMove {
  player: string;
  action:
    | 'draw'
    | 'discard'
    | 'declare_win'
    | 'claim_pon'
    | 'claim_chi'
    | 'claim_kan'
    | 'declare_kan'
    | 'pass_claim';
  tile?: MahjongTile;
  tiles?: MahjongTile[];
}

interface MahjongResolvedHand {
  type: 'standard' | 'seven_pairs' | 'thirteen_orphans' | 'nine_gates';
  pair?: MahjongTile[];
  pairGroups?: MahjongTile[][];
  melds: MahjongMeldState[];
  tiles: MahjongTile[];
  concealed: boolean;
}

export class MahjongGame extends BaseGame {
  private readonly HAND_SIZE = 13;
  private readonly WINNING_HAND_SIZE = 14;
  private readonly DEAD_WALL_SIZE = 14;
  private readonly MAX_KAN_DRAWS = 4;

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'mahjong', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 4);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const wall = this.createTileSet();
    this.shuffleTiles(wall);

    const hands: { [playerId: string]: MahjongTile[] } = {};
    const melds: { [playerId: string]: MahjongTile[][] } = {};
    const meldStates: { [playerId: string]: MahjongMeldState[] } = {};

    for (const playerId of playerIds) {
      hands[playerId] = wall.splice(0, this.HAND_SIZE);
      melds[playerId] = [];
      meldStates[playerId] = [];
    }

    const dealer = playerIds[0]!;
    const seatWinds = this.createSeatWinds(playerIds, dealer);
    const sessionScores = this.createPlayerScores(playerIds);
    if (wall.length > 0) {
      hands[dealer]!.push(wall.shift()!);
    }

    const initialState: MahjongState = {
      gameId: this.gameId,
      gameType: this.gameType,
      hands,
      wall,
      discardPile: [],
      currentPlayer: dealer,
      playerOrder: playerIds,
      gameOver: false,
      winner: null,
      gamePhase: 'playing',
      lastDiscard: null,
      roundNumber: 1,
      dealer,
      prevalentWind: this.getPrevalentWindForRound(1, playerIds.length),
      seatWinds,
      sessionScores,
      lastAction: null,
      melds,
      meldStates,
      lastDiscardPlayer: null,
      claimWindow: null,
      supplementalDrawsUsed: 0,
      lastTilePointReached: false,
      lastDrawSource: null,
      pendingAddedKong: null,
      winningResult: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createTileSet(): MahjongTile[] {
    const tiles: MahjongTile[] = [];

    const suits: Suit[] = ['bamboo', 'character', 'dot'];
    for (const suit of suits) {
      for (let value = 1; value <= 9; value++) {
        for (let copy = 0; copy < 4; copy++) {
          tiles.push({
            type: 'suit',
            suit,
            value,
            id: `${suit}-${value}-${copy}`,
          });
        }
      }
    }

    const honors: Honor[] = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];
    for (const honor of honors) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({
          type: 'honor',
          honor,
          id: `${honor}-${copy}`,
        });
      }
    }

    return tiles;
  }

  private shuffleTiles(tiles: MahjongTile[]): void {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i]!, tiles[j]!] = [tiles[j]!, tiles[i]!];
    }
  }

  private createSeatWinds(playerOrder: string[], dealer: string = playerOrder[0]!): { [playerId: string]: Wind } {
    const winds: Wind[] = ['east', 'south', 'west', 'north'];
    const seatWinds: { [playerId: string]: Wind } = {};
    const dealerIndex = Math.max(playerOrder.indexOf(dealer), 0);

    playerOrder.forEach((_playerId, index) => {
      const seatedPlayer = playerOrder[(dealerIndex + index) % playerOrder.length]!;
      seatWinds[seatedPlayer] = winds[index] ?? 'east';
    });

    return seatWinds;
  }

  private createPlayerScores(playerOrder: string[]): { [playerId: string]: number } {
    return Object.fromEntries(playerOrder.map((playerId) => [playerId, 0]));
  }

  private getPrevalentWindForRound(roundNumber: number, playersPerRound: number): Wind {
    const winds: Wind[] = ['east', 'south', 'west', 'north'];
    const windIndex = Math.floor(Math.max(roundNumber - 1, 0) / Math.max(playersPerRound, 1)) % winds.length;
    return winds[windIndex]!;
  }

  private ensureStateDefaults(state: MahjongState): void {
    const playerOrder = state.playerOrder ?? Object.keys(state.hands ?? {});
    state.playerOrder = playerOrder;
    state.prevalentWind = state.prevalentWind ?? this.getPrevalentWindForRound(state.roundNumber ?? 1, playerOrder.length);
    state.seatWinds = state.seatWinds ?? this.createSeatWinds(playerOrder, state.dealer ?? playerOrder[0]!);
    state.sessionScores = state.sessionScores ?? this.createPlayerScores(playerOrder);
    state.melds = state.melds ?? {};
    state.meldStates = state.meldStates ?? {};
    state.lastTilePointReached = state.lastTilePointReached ?? false;
    state.lastDrawSource = state.lastDrawSource ?? null;
    state.pendingAddedKong = state.pendingAddedKong ?? null;
    state.winningResult = state.winningResult ?? null;

    for (const playerId of playerOrder) {
      state.hands[playerId] = state.hands[playerId] ?? [];
      state.melds[playerId] = state.melds[playerId] ?? [];
      const meldStates = state.meldStates[playerId];
      if (!meldStates || meldStates.length !== state.melds[playerId].length) {
        state.meldStates[playerId] = state.melds[playerId].map((meld) => ({
          tiles: this.sortTiles(meld),
          type: this.classifyMeldType(meld),
          concealed: false,
        }));
      }
    }
  }

  private classifyMeldType(meld: MahjongTile[]): 'sequence' | 'triplet' | 'kong' {
    if (meld.length === 4) {
      return 'kong';
    }

    const firstKey = this.getTileKey(meld[0]!);
    if (meld.every((tile) => this.getTileKey(tile) === firstKey)) {
      return 'triplet';
    }

    return 'sequence';
  }

  private getResolvedMeldStates(playerId: string, state: MahjongState): MahjongMeldState[] {
    this.ensureStateDefaults(state);

    const meldStates = state.meldStates[playerId] ?? [];
    const melds = state.melds[playerId] ?? [];
    if (meldStates.length === melds.length) {
      return meldStates.map((meldState, index) => ({
        ...meldState,
        tiles: this.sortTiles(melds[index] ?? meldState.tiles),
      }));
    }

    return melds.map((meld) => ({
      tiles: this.sortTiles(meld),
      type: this.classifyMeldType(meld),
      concealed: false,
    }));
  }

  private getMeldTileCount(meld: MahjongTile[]): number {
    return meld.length === 4 ? 3 : meld.length;
  }

  private getPlayerTileCount(playerId: string, state: MahjongState): number {
    this.ensureStateDefaults(state);

    const concealedTiles = state.hands[playerId]?.length ?? 0;
    const meldTiles = this.getResolvedMeldStates(playerId, state).reduce(
      (sum, meld) => sum + this.getMeldTileCount(meld.tiles),
      0
    );
    return concealedTiles + meldTiles;
  }

  private getLiveWallReserve(state: MahjongState): number {
    return Math.max(0, this.DEAD_WALL_SIZE - state.supplementalDrawsUsed);
  }

  private getLiveWallSize(state: MahjongState): number {
    return Math.max(0, state.wall.length - this.getLiveWallReserve(state));
  }

  private getNextPlayerAfter(playerId: string, state: MahjongState): string {
    const currentIndex = state.playerOrder.indexOf(playerId);
    return state.playerOrder[(currentIndex + 1) % state.playerOrder.length]!;
  }

  private getClaimPriorityPlayers(
    discardedBy: string,
    state: MahjongState,
    predicate: (playerId: string) => boolean
  ): string[] {
    const startIndex = state.playerOrder.indexOf(discardedBy);
    const players: string[] = [];

    for (let offset = 1; offset < state.playerOrder.length; offset++) {
      const candidate = state.playerOrder[(startIndex + offset) % state.playerOrder.length]!;
      if (predicate(candidate)) {
        players.push(candidate);
      }
    }

    return players;
  }

  private canClaimPon(playerId: string, tile: MahjongTile, state: MahjongState): boolean {
    const tileKey = this.getTileKey(tile);
    return (state.hands[playerId] ?? []).filter((handTile) => this.getTileKey(handTile) === tileKey)
      .length >= 2;
  }

  private canClaimKan(playerId: string, tile: MahjongTile, state: MahjongState): boolean {
    const tileKey = this.getTileKey(tile);
    return (state.hands[playerId] ?? []).filter((handTile) => this.getTileKey(handTile) === tileKey)
      .length >= 3;
  }

  private findUpgradeablePonIndex(playerId: string, tile: MahjongTile, state: MahjongState): number {
    const tileKey = this.getTileKey(tile);
    return (state.melds[playerId] ?? []).findIndex((meld) => {
      return meld.length === 3 && meld.every((meldTile) => this.getTileKey(meldTile) === tileKey);
    });
  }

  private canDeclareKan(playerId: string, tile: MahjongTile, state: MahjongState): boolean {
    const tileKey = this.getTileKey(tile);
    const matchingHandTiles = (state.hands[playerId] ?? []).filter(
      (handTile) => this.getTileKey(handTile) === tileKey
    );

    if (matchingHandTiles.length >= 4) {
      return true;
    }

    return (
      matchingHandTiles.length >= 1 && this.findUpgradeablePonIndex(playerId, tile, state) !== -1
    );
  }

  private canClaimChi(
    playerId: string,
    tile: MahjongTile,
    state: MahjongState,
    selectedTiles?: MahjongTile[]
  ): boolean {
    if (tile.type !== 'suit' || tile.value === undefined || tile.suit === undefined) {
      return false;
    }

    const hand = state.hands[playerId] ?? [];
    const handCounts = new Map<string, number>();
    for (const handTile of hand) {
      handCounts.set(handTile.id, (handCounts.get(handTile.id) || 0) + 1);
    }

    if (selectedTiles) {
      if (selectedTiles.length !== 2) {
        return false;
      }

      for (const selectedTile of selectedTiles) {
        const remaining = handCounts.get(selectedTile.id) || 0;
        if (remaining <= 0) {
          return false;
        }
        handCounts.set(selectedTile.id, remaining - 1);
      }

      if (
        selectedTiles.some(
          (selectedTile) => selectedTile.type !== 'suit' || selectedTile.suit !== tile.suit
        )
      ) {
        return false;
      }

      const values = [tile.value, ...selectedTiles.map((selectedTile) => selectedTile.value)].sort(
        (a, b) => (a || 0) - (b || 0)
      );
      return (
        values[0] !== undefined &&
        values[1] !== undefined &&
        values[2] !== undefined &&
        values[0] + 1 === values[1] &&
        values[1] + 1 === values[2]
      );
    }

    const candidateSets = [
      [tile.value - 2, tile.value - 1],
      [tile.value - 1, tile.value + 1],
      [tile.value + 1, tile.value + 2],
    ];

    return candidateSets.some((values) => {
      if (values.some((value) => value < 1 || value > 9)) {
        return false;
      }

      return values.every((value) => {
        return hand.some(
          (handTile) =>
            handTile.type === 'suit' && handTile.suit === tile.suit && handTile.value === value
        );
      });
    });
  }

  private finishExhaustiveDraw(
    state: MahjongState,
    details: string = 'The live wall is exhausted and the round ends in a draw'
  ): void {
    state.gameOver = true;
    state.winner = null;
    state.gamePhase = 'finished';
    state.claimWindow = null;
    state.pendingAddedKong = null;
    state.winningResult = null;
    state.lastAction = {
      action: 'draw_game',
      details,
    };
  }

  private applyWinningResultToSessionScores(
    state: MahjongState,
    winningResult: MahjongWinningResult
  ): void {
    const sessionScores = state.sessionScores ?? this.createPlayerScores(state.playerOrder);
    let winnerGain = 0;

    for (const [playerId, amount] of Object.entries(winningResult.payments)) {
      sessionScores[playerId] = (sessionScores[playerId] ?? 0) - amount;
      winnerGain += amount;
    }

    sessionScores[winningResult.player] = (sessionScores[winningResult.player] ?? 0) + winnerGain;
    state.sessionScores = sessionScores;
  }

  private resetForNextHand(state: MahjongState, dealer: string, roundNumber: number): void {
    const wall = this.createTileSet();
    this.shuffleTiles(wall);

    const hands: { [playerId: string]: MahjongTile[] } = {};
    const melds: { [playerId: string]: MahjongTile[][] } = {};
    const meldStates: { [playerId: string]: MahjongMeldState[] } = {};

    for (const playerId of state.playerOrder) {
      hands[playerId] = wall.splice(0, this.HAND_SIZE);
      melds[playerId] = [];
      meldStates[playerId] = [];
    }

    if (wall.length > 0) {
      hands[dealer]!.push(wall.shift()!);
    }

    state.hands = hands;
    state.wall = wall;
    state.discardPile = [];
    state.currentPlayer = dealer;
    state.gameOver = false;
    state.winner = null;
    state.gamePhase = 'playing';
    state.lastDiscard = null;
    state.roundNumber = roundNumber;
    state.dealer = dealer;
    state.prevalentWind = this.getPrevalentWindForRound(roundNumber, state.playerOrder.length);
    state.seatWinds = this.createSeatWinds(state.playerOrder, dealer);
    state.lastAction = {
      action: 'start_hand',
      player: dealer,
      details: 'Hand ' + roundNumber + ' begins with ' + dealer + ' as dealer',
    };
    state.melds = melds;
    state.meldStates = meldStates;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.supplementalDrawsUsed = 0;
    state.lastTilePointReached = false;
    state.lastDrawSource = null;
    state.pendingAddedKong = null;
    state.winningResult = null;
  }

  private openClaimWindow(state: MahjongState): void {
    this.ensureStateDefaults(state);

    const tile = state.lastDiscard;
    const discardedBy = state.lastDiscardPlayer;

    if (!tile || !discardedBy) {
      state.claimWindow = null;
      return;
    }

    const nextPlayer = this.getNextPlayerAfter(discardedBy, state);
    const ronPlayers = this.getClaimPriorityPlayers(discardedBy, state, (playerId) => {
      return this.getWinningResult(playerId, state, 'discard', tile) !== null;
    });

    if (ronPlayers.length > 0) {
      state.claimWindow = {
        tile,
        discardedBy,
        nextPlayer,
        phase: 'ron',
        pendingPlayers: ronPlayers,
        source: 'discard',
      };
      state.currentPlayer = ronPlayers[0]!;
      return;
    }

    if (state.lastTilePointReached) {
      this.finishExhaustiveDraw(
        state,
        'No player claimed the last live-wall discard, so the hand ends in an exhaustive draw'
      );
      return;
    }

    const ponPlayers = this.getClaimPriorityPlayers(discardedBy, state, (playerId) => {
      return this.canClaimPon(playerId, tile, state);
    });

    if (ponPlayers.length > 0) {
      state.claimWindow = {
        tile,
        discardedBy,
        nextPlayer,
        phase: 'pon',
        pendingPlayers: ponPlayers,
        source: 'discard',
      };
      state.currentPlayer = ponPlayers[0]!;
      return;
    }

    if (this.canClaimChi(nextPlayer, tile, state)) {
      state.claimWindow = {
        tile,
        discardedBy,
        nextPlayer,
        phase: 'chi',
        pendingPlayers: [nextPlayer],
        source: 'discard',
      };
      state.currentPlayer = nextPlayer;
      return;
    }

    state.claimWindow = null;
    state.currentPlayer = nextPlayer;
    if (this.getLiveWallSize(state) === 0) {
      this.finishExhaustiveDraw(state);
    }
  }

  private advanceClaimWindow(state: MahjongState): void {
    this.ensureStateDefaults(state);

    const claimWindow = state.claimWindow;
    if (!claimWindow) {
      return;
    }

    claimWindow.pendingPlayers.shift();
    if (claimWindow.pendingPlayers.length > 0) {
      state.currentPlayer = claimWindow.pendingPlayers[0]!;
      return;
    }

    const { discardedBy, tile, nextPlayer, phase, source } = claimWindow;

    if (source === 'rob_kong') {
      this.completePendingAddedKong(state);
      return;
    }

    if (phase === 'ron') {
      if (state.lastTilePointReached) {
        state.claimWindow = null;
        this.finishExhaustiveDraw(
          state,
          'All players passed on the last live-wall discard, so the hand ends in an exhaustive draw'
        );
        return;
      }

      const ponPlayers = this.getClaimPriorityPlayers(discardedBy, state, (playerId) => {
        return this.canClaimPon(playerId, tile, state);
      });

      if (ponPlayers.length > 0) {
        state.claimWindow = {
          tile,
          discardedBy,
          nextPlayer,
          phase: 'pon',
          pendingPlayers: ponPlayers,
          source: 'discard',
        };
        state.currentPlayer = ponPlayers[0]!;
        return;
      }
    }

    if ((phase === 'ron' || phase === 'pon') && this.canClaimChi(nextPlayer, tile, state)) {
      state.claimWindow = {
        tile,
        discardedBy,
        nextPlayer,
        phase: 'chi',
        pendingPlayers: [nextPlayer],
        source: 'discard',
      };
      state.currentPlayer = nextPlayer;
      return;
    }

    state.claimWindow = null;
    state.currentPlayer = nextPlayer;
    if (this.getLiveWallSize(state) === 0) {
      this.finishExhaustiveDraw(state);
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as MahjongMove;
      const state = this.currentState as MahjongState;
      this.ensureStateDefaults(state);

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!state.hands[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      if (
        ![
          'draw',
          'discard',
          'declare_win',
          'claim_pon',
          'claim_chi',
          'claim_kan',
          'declare_kan',
          'pass_claim',
        ].includes(move.action)
      ) {
        return {
          valid: false,
          error:
            'Action must be draw, discard, declare_win, claim_pon, claim_chi, claim_kan, declare_kan, or pass_claim',
        };
      }

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (state.claimWindow) {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: "It's " + state.currentPlayer + "'s turn" };
        }

        if (move.action === 'pass_claim') {
          return { valid: true };
        }

        if (move.action === 'declare_win') {
          if (state.claimWindow.phase !== 'ron') {
            return { valid: false, error: 'Cannot declare win right now' };
          }

          if (!this.getWinningResult(move.player, state, 'discard', state.claimWindow.tile)) {
            return {
              valid: false,
              error: 'Player does not have a Chinese Official winning hand worth at least 8 fan',
            };
          }

          return { valid: true };
        }

        if (move.action === 'claim_pon') {
          if (state.claimWindow.phase !== 'pon') {
            return { valid: false, error: 'Cannot claim pon right now' };
          }

          if (!this.canClaimPon(move.player, state.claimWindow.tile, state)) {
            return { valid: false, error: 'Player cannot claim pon with this discard' };
          }

          return { valid: true };
        }

        if (move.action === 'claim_kan') {
          if (state.claimWindow.phase !== 'pon') {
            return { valid: false, error: 'Cannot claim kan right now' };
          }

          if (!this.canClaimKan(move.player, state.claimWindow.tile, state)) {
            return { valid: false, error: 'Player cannot claim kan with this discard' };
          }

          if (state.supplementalDrawsUsed >= this.MAX_KAN_DRAWS || state.wall.length === 0) {
            return { valid: false, error: 'No supplemental draw available for kan' };
          }

          return { valid: true };
        }

        if (move.action === 'claim_chi') {
          if (state.claimWindow.phase !== 'chi') {
            return { valid: false, error: 'Cannot claim chi right now' };
          }

          if (!this.canClaimChi(move.player, state.claimWindow.tile, state, move.tiles)) {
            return { valid: false, error: 'Player cannot claim chi with this discard' };
          }

          return { valid: true };
        }

        return {
          valid: false,
          error: 'Must resolve discard claims before drawing or discarding',
        };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: "It's " + state.currentPlayer + "'s turn" };
      }

      const playerTileCount = this.getPlayerTileCount(move.player, state);

      if (
        move.action === 'pass_claim' ||
        move.action === 'claim_pon' ||
        move.action === 'claim_chi' ||
        move.action === 'claim_kan'
      ) {
        return { valid: false, error: 'There is no discard to claim' };
      }

      if (move.action === 'draw') {
        if (playerTileCount !== this.HAND_SIZE) {
          return { valid: false, error: 'Player already has drawn tile' };
        }

        if (this.getLiveWallSize(state) === 0) {
          return { valid: false, error: 'No tiles left in live wall' };
        }
      }

      if (move.action === 'discard') {
        if (playerTileCount !== this.WINNING_HAND_SIZE) {
          return { valid: false, error: 'Must draw before discarding' };
        }

        if (!move.tile) {
          return { valid: false, error: 'Must specify tile to discard' };
        }

        const playerHand = state.hands[move.player];
        if (!playerHand?.some((tile) => tile.id === move.tile!.id)) {
          return { valid: false, error: 'Player does not have this tile' };
        }
      }

      if (move.action === 'declare_kan') {
        if (playerTileCount !== this.WINNING_HAND_SIZE) {
          return { valid: false, error: 'Must have a drawn tile to declare kan' };
        }

        if (!move.tile) {
          return { valid: false, error: 'Must specify tile to declare kan' };
        }

        if (!this.canDeclareKan(move.player, move.tile, state)) {
          return { valid: false, error: 'Player cannot declare kan with this tile' };
        }

        if (state.supplementalDrawsUsed >= this.MAX_KAN_DRAWS || state.wall.length === 0) {
          return { valid: false, error: 'No supplemental draw available for kan' };
        }

        if (state.lastTilePointReached) {
          return {
            valid: false,
            error: 'Cannot declare kan after the last live-wall tile has been drawn',
          };
        }
      }

      if (move.action === 'declare_win') {
        if (!this.getWinningResult(move.player, state, 'self_draw')) {
          return {
            valid: false,
            error: 'Player does not have a Chinese Official winning hand worth at least 8 fan',
          };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private checkWinningHand(
    playerId: string,
    state: MahjongState,
    claimedTile?: MahjongTile,
    method: 'self_draw' | 'discard' = claimedTile ? 'discard' : 'self_draw'
  ): boolean {
    return this.getWinningResult(playerId, state, method, claimedTile) !== null;
  }

  private getWinningResult(
    playerId: string,
    state: MahjongState,
    method: 'self_draw' | 'discard',
    claimedTile?: MahjongTile,
    claimSource: 'discard' | 'rob_kong' = state.claimWindow?.source ?? 'discard'
  ): MahjongWinningResult | null {
    this.ensureStateDefaults(state);

    const winningHands = this.getWinningHandOptions(playerId, state, claimedTile);
    let bestResult: MahjongWinningResult | null = null;

    for (const winningHand of winningHands) {
      const breakdown = this.evaluateChineseOfficialFans(
        winningHand,
        state,
        playerId,
        method,
        claimSource
      );
      const totalFan = breakdown.reduce((sum, item) => sum + item.fan, 0);
      if (totalFan < 8) {
        continue;
      }

      const payments = this.calculatePayments(state, playerId, method, totalFan);
      const score = Object.values(payments).reduce((sum, amount) => sum + amount, 0);
      const result: MahjongWinningResult = {
        player: playerId,
        method,
        totalFan,
        score,
        payments,
        breakdown,
      };

      if (
        !bestResult ||
        result.totalFan > bestResult.totalFan ||
        (result.totalFan === bestResult.totalFan && result.score > bestResult.score)
      ) {
        bestResult = result;
      }
    }

    return bestResult;
  }

  private getWinningHandOptions(
    playerId: string,
    state: MahjongState,
    claimedTile?: MahjongTile
  ): MahjongResolvedHand[] {
    this.ensureStateDefaults(state);

    const concealedTiles = [...(state.hands[playerId] ?? [])];
    if (claimedTile) {
      concealedTiles.push(claimedTile);
    }

    const openMelds = this.getResolvedMeldStates(playerId, state);
    const requiredMelds = 4 - openMelds.length;
    const requiredHandSize = 2 + requiredMelds * 3;

    if (concealedTiles.length !== requiredHandSize) {
      return [];
    }

    const winningHands: MahjongResolvedHand[] = [];
    const concealed = openMelds.every((meld) => meld.concealed);
    const concealedTilesSorted = this.sortTiles(concealedTiles);

    if (openMelds.length === 0 && concealedTilesSorted.length === this.WINNING_HAND_SIZE) {
      if (this.isSevenPairs(concealedTilesSorted)) {
        const pairGroups: MahjongTile[][] = [];
        for (let index = 0; index < concealedTilesSorted.length; index += 2) {
          pairGroups.push([concealedTilesSorted[index]!, concealedTilesSorted[index + 1]!]);
        }

        winningHands.push({
          type: 'seven_pairs',
          pairGroups,
          melds: [],
          tiles: concealedTilesSorted,
          concealed,
        });
      }

      if (this.isThirteenOrphans(concealedTilesSorted)) {
        winningHands.push({
          type: 'thirteen_orphans',
          melds: [],
          tiles: concealedTilesSorted,
          concealed: true,
        });
      }

      if (this.isNineGates(concealedTilesSorted)) {
        winningHands.push({
          type: 'nine_gates',
          melds: [],
          tiles: concealedTilesSorted,
          concealed: true,
        });
      }
    }

    for (const standardHand of this.resolveStandardWinningHands(concealedTilesSorted, requiredMelds)) {
      winningHands.push({
        type: 'standard',
        pair: standardHand.pair,
        melds: [...openMelds, ...standardHand.melds],
        tiles: this.sortTiles([
          ...concealedTilesSorted,
          ...openMelds.flatMap((meld) => meld.tiles),
        ]),
        concealed,
      });
    }

    return winningHands;
  }

  private resolveStandardWinningHands(
    tiles: MahjongTile[],
    requiredMelds: number
  ): Array<{ pair: MahjongTile[]; melds: MahjongMeldState[] }> {
    const sortedTiles = this.sortTiles(tiles);
    const uniqueKeys = [...new Set(sortedTiles.map((tile) => this.getTileKey(tile)))];
    const winningHands: Array<{ pair: MahjongTile[]; melds: MahjongMeldState[] }> = [];
    const seen = new Set<string>();

    for (const key of uniqueKeys) {
      const matchingTiles = sortedTiles.filter((tile) => this.getTileKey(tile) === key);
      if (matchingTiles.length < 2) {
        continue;
      }

      const pair = this.sortTiles(matchingTiles.slice(0, 2));
      const remainingTiles = this.removeTilesByIds(sortedTiles, pair.map((tile) => tile.id));
      for (const melds of this.resolveMeldCombinations(remainingTiles, requiredMelds)) {
        const signature = [
          pair.map((tile) => tile.id).join(','),
          ...melds.map((meld) => meld.tiles.map((tile) => tile.id).join(',')),
        ].join('|');
        if (seen.has(signature)) {
          continue;
        }

        seen.add(signature);
        winningHands.push({ pair, melds });
      }
    }

    return winningHands;
  }

  private resolveMeldCombinations(tiles: MahjongTile[], meldsRemaining: number): MahjongMeldState[][] {
    if (meldsRemaining === 0) {
      return tiles.length === 0 ? [[]] : [];
    }

    if (tiles.length !== meldsRemaining * 3) {
      return [];
    }

    const sortedTiles = this.sortTiles(tiles);
    const firstTile = sortedTiles[0]!;
    const firstKey = this.getTileKey(firstTile);
    const results: MahjongMeldState[][] = [];
    const seen = new Set<string>();

    const matchingTiles = sortedTiles.filter((tile) => this.getTileKey(tile) === firstKey);
    if (matchingTiles.length >= 3) {
      const tripletTiles = this.sortTiles(matchingTiles.slice(0, 3));
      const remainingTiles = this.removeTilesByIds(sortedTiles, tripletTiles.map((tile) => tile.id));
      for (const remainder of this.resolveMeldCombinations(remainingTiles, meldsRemaining - 1)) {
        const melds = [{ tiles: tripletTiles, type: 'triplet' as const, concealed: true }, ...remainder];
        const signature = melds.map((meld) => meld.tiles.map((tile) => tile.id).join(',')).join('|');
        if (!seen.has(signature)) {
          seen.add(signature);
          results.push(melds);
        }
      }
    }

    const sequenceTiles = this.buildSequenceTiles(sortedTiles, firstTile);
    if (sequenceTiles) {
      const remainingTiles = this.removeTilesByIds(sortedTiles, sequenceTiles.map((tile) => tile.id));
      for (const remainder of this.resolveMeldCombinations(remainingTiles, meldsRemaining - 1)) {
        const melds = [{ tiles: this.sortTiles(sequenceTiles), type: 'sequence' as const, concealed: true }, ...remainder];
        const signature = melds.map((meld) => meld.tiles.map((tile) => tile.id).join(',')).join('|');
        if (!seen.has(signature)) {
          seen.add(signature);
          results.push(melds);
        }
      }
    }

    return results;
  }

  private buildSequenceTiles(tiles: MahjongTile[], firstTile: MahjongTile): MahjongTile[] | null {
    if (firstTile.type !== 'suit' || firstTile.value === undefined || firstTile.value > 7) {
      return null;
    }

    const nextKey = firstTile.suit + '-' + (firstTile.value + 1);
    const thirdKey = firstTile.suit + '-' + (firstTile.value + 2);
    const nextTile = tiles.find((tile) => this.getTileKey(tile) === nextKey);
    if (!nextTile) {
      return null;
    }

    const thirdTile = tiles.find(
      (tile) => this.getTileKey(tile) === thirdKey && tile.id !== nextTile.id
    );
    if (!thirdTile) {
      return null;
    }

    return [firstTile, nextTile, thirdTile];
  }

  private isSevenPairs(tiles: MahjongTile[]): boolean {
    const tileCounts = new Map<string, number>();

    for (const tile of tiles) {
      const key = this.getTileKey(tile);
      tileCounts.set(key, (tileCounts.get(key) || 0) + 1);
    }

    return tileCounts.size === 7 && Array.from(tileCounts.values()).every((count) => count === 2);
  }

  private isSevenShiftedPairs(tiles: MahjongTile[]): boolean {
    if (!this.isSevenPairs(tiles) || tiles.some((tile) => tile.type !== 'suit')) {
      return false;
    }

    const suitedTiles = tiles as Array<MahjongTile & { suit: Suit; value: number }>;
    const suits = new Set(suitedTiles.map((tile) => tile.suit));
    if (suits.size !== 1) {
      return false;
    }

    const pairValues = [...new Set(suitedTiles.map((tile) => tile.value))].sort((a, b) => a - b);
    return pairValues.length === 7 && pairValues.every((value, index) => value === pairValues[0]! + index);
  }

  private isThirteenOrphans(tiles: MahjongTile[]): boolean {
    if (tiles.length !== this.WINNING_HAND_SIZE) {
      return false;
    }

    const requiredKeys = [
      'bamboo-1',
      'bamboo-9',
      'character-1',
      'character-9',
      'dot-1',
      'dot-9',
      'honor-east',
      'honor-south',
      'honor-west',
      'honor-north',
      'honor-red',
      'honor-green',
      'honor-white',
    ];
    const counts = new Map<string, number>();

    for (const tile of tiles) {
      const key = this.getTileKey(tile);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    if (counts.size !== 13) {
      return false;
    }

    let pairCount = 0;
    for (const key of requiredKeys) {
      const count = counts.get(key) || 0;
      if (count === 2) {
        pairCount++;
      } else if (count !== 1) {
        return false;
      }
    }

    return pairCount === 1;
  }

  private isNineGates(tiles: MahjongTile[]): boolean {
    if (tiles.length !== this.WINNING_HAND_SIZE || tiles.some((tile) => tile.type !== 'suit')) {
      return false;
    }

    const suitedTiles = tiles as Array<MahjongTile & { suit: Suit; value: number }>;
    const suits = new Set(suitedTiles.map((tile) => tile.suit));
    if (suits.size !== 1) {
      return false;
    }

    const counts = new Map<number, number>();
    for (const tile of suitedTiles) {
      counts.set(tile.value, (counts.get(tile.value) || 0) + 1);
    }

    for (let value = 2; value <= 8; value++) {
      if ((counts.get(value) || 0) < 1) {
        return false;
      }
    }

    return (counts.get(1) || 0) >= 3 && (counts.get(9) || 0) >= 3;
  }

  private evaluateChineseOfficialFans(
    winningHand: MahjongResolvedHand,
    state: MahjongState,
    playerId: string,
    method: 'self_draw' | 'discard',
    claimSource: 'discard' | 'rob_kong' = state.claimWindow?.source ?? 'discard'
  ): MahjongFanBreakdown[] {
    const breakdown: MahjongFanBreakdown[] = [];
    const addFan = (name: string, fan: number) => {
      breakdown.push({ name, fan });
    };

    const tiles = winningHand.tiles;
    const melds = winningHand.melds;
    const tripletLikeMelds = melds.filter((meld) => meld.type !== 'sequence');
    const suitedTiles = tiles.filter((tile): tile is MahjongTile & { suit: Suit; value: number } => {
      return tile.type === 'suit' && tile.suit !== undefined && tile.value !== undefined;
    });
    const honorTiles = tiles.filter((tile) => tile.type === 'honor');
    const suitsUsed = new Set<Suit>(suitedTiles.map((tile) => tile.suit));
    const pairTile = winningHand.pair?.[0];

    const allHonors = tiles.length > 0 && tiles.every((tile) => this.isHonorTile(tile));
    const allTerminals = tiles.length > 0 && tiles.every((tile) => this.isTerminalTile(tile));
    const allTerminalsAndHonors =
      tiles.length > 0 && tiles.every((tile) => this.isHonorTile(tile) || this.isTerminalTile(tile));
    const fullFlush = suitsUsed.size === 1 && honorTiles.length === 0;
    const halfFlush = suitsUsed.size === 1 && honorTiles.length > 0 && !allHonors;
    const allPungs =
      winningHand.type === 'standard' && melds.length === 4 && melds.every((meld) => meld.type !== 'sequence');
    const allChows =
      winningHand.type === 'standard' &&
      melds.length === 4 &&
      melds.every((meld) => meld.type === 'sequence') &&
      pairTile?.type === 'suit' &&
      honorTiles.length === 0;
    const allSimples =
      tiles.length > 0 &&
      tiles.every(
        (tile) => tile.type === 'suit' && tile.value !== undefined && tile.value >= 2 && tile.value <= 8
      );
    const outsideHand =
      winningHand.type === 'standard' &&
      !!pairTile &&
      (this.isHonorTile(pairTile) || this.isTerminalTile(pairTile)) &&
      melds.every((meld) => meld.tiles.some((tile) => this.isHonorTile(tile) || this.isTerminalTile(tile)));
    const allEvenPungs =
      winningHand.type === 'standard' &&
      allPungs &&
      tiles.length > 0 &&
      tiles.every(
        (tile) => tile.type === 'suit' && tile.value !== undefined && tile.value % 2 === 0
      );
    const oneVoidedSuit = suitsUsed.size === 2;
    const noHonors = honorTiles.length === 0;
    const outWithReplacementTile = method === 'self_draw' && state.lastDrawSource === 'replacement';
    const lastTileDraw =
      method === 'self_draw' && state.lastTilePointReached && state.lastDrawSource === 'live_wall';
    const lastTileClaim = method === 'discard' && state.lastTilePointReached;
    const robbingTheKong = method === 'discard' && claimSource === 'rob_kong';
    const specialFullyConcealed = winningHand.concealed && method === 'self_draw';
    const fullyConcealed = winningHand.type === 'standard' && winningHand.concealed && method === 'self_draw';
    const concealedHand = winningHand.type === 'standard' && winningHand.concealed && method === 'discard';
    const sevenShiftedPairs = winningHand.type === 'seven_pairs' && this.isSevenShiftedPairs(tiles);

    const dragonPungs = tripletLikeMelds.filter((meld) => {
      const tile = meld.tiles[0];
      return tile?.type === 'honor' && this.isDragonHonor(tile.honor);
    });
    const windPungs = tripletLikeMelds.filter((meld) => {
      const tile = meld.tiles[0];
      return tile?.type === 'honor' && this.isWindHonor(tile.honor);
    });

    const bigThreeDragons = dragonPungs.length === 3;
    const littleThreeDragons =
      winningHand.type === 'standard' &&
      dragonPungs.length === 2 &&
      pairTile?.type === 'honor' &&
      this.isDragonHonor(pairTile.honor);
    const bigFourWinds = windPungs.length === 4;
    const littleFourWinds =
      winningHand.type === 'standard' &&
      windPungs.length === 3 &&
      pairTile?.type === 'honor' &&
      this.isWindHonor(pairTile.honor);

    if (winningHand.type === 'thirteen_orphans') {
      addFan('Thirteen Orphans', 88);
      if (outWithReplacementTile) {
        addFan('Out With Replacement Tile', 8);
      }
      if (lastTileDraw) {
        addFan('Last Tile Draw', 8);
      }
      if (lastTileClaim) {
        addFan('Last Tile Claim', 8);
      }
      if (robbingTheKong) {
        addFan('Robbing The Kong', 8);
      }
      if (specialFullyConcealed) {
        addFan('Fully Concealed Hand', 4);
      }
      return breakdown;
    }

    if (winningHand.type === 'nine_gates') {
      addFan('Nine Gates', 88);
      if (outWithReplacementTile) {
        addFan('Out With Replacement Tile', 8);
      }
      if (lastTileDraw) {
        addFan('Last Tile Draw', 8);
      }
      if (lastTileClaim) {
        addFan('Last Tile Claim', 8);
      }
      if (robbingTheKong) {
        addFan('Robbing The Kong', 8);
      }
      if (specialFullyConcealed) {
        addFan('Fully Concealed Hand', 4);
      }
      return breakdown;
    }

    if (sevenShiftedPairs) {
      addFan('Seven Shifted Pairs', 88);
      if (outWithReplacementTile) {
        addFan('Out With Replacement Tile', 8);
      }
      if (lastTileDraw) {
        addFan('Last Tile Draw', 8);
      }
      if (lastTileClaim) {
        addFan('Last Tile Claim', 8);
      }
      if (robbingTheKong) {
        addFan('Robbing The Kong', 8);
      }
      if (specialFullyConcealed) {
        addFan('Fully Concealed Hand', 4);
      }
      return breakdown;
    }

    if (bigFourWinds) {
      addFan('Big Four Winds', 88);
    }

    if (bigThreeDragons) {
      addFan('Big Three Dragons', 88);
    }

    if (allHonors) {
      addFan('All Honors', 64);
    }

    if (littleFourWinds) {
      addFan('Little Four Winds', 64);
    }

    if (littleThreeDragons) {
      addFan('Little Three Dragons', 64);
    }

    if (allTerminals) {
      addFan('All Terminals', 64);
    } else if (allTerminalsAndHonors) {
      addFan('All Terminals And Honors', 32);
    }

    if (winningHand.type === 'seven_pairs') {
      addFan('Seven Pairs', 24);
    }

    if (fullFlush) {
      addFan('Full Flush', 24);
    }

    if (allEvenPungs) {
      addFan('All Even Pungs', 24);
    }

    if (
      allPungs &&
      !allEvenPungs &&
      !bigFourWinds &&
      !bigThreeDragons &&
      !littleFourWinds &&
      !littleThreeDragons &&
      !allHonors &&
      !allTerminals &&
      !allTerminalsAndHonors
    ) {
      addFan('All Pungs', 6);
    }

    if (halfFlush) {
      addFan('Half Flush', 6);
    }

    if (outsideHand && !allTerminals && !allTerminalsAndHonors) {
      addFan('Outside Hand', 4);
    }

    if (outWithReplacementTile) {
      addFan('Out With Replacement Tile', 8);
    }

    if (lastTileDraw) {
      addFan('Last Tile Draw', 8);
    }

    if (lastTileClaim) {
      addFan('Last Tile Claim', 8);
    }

    if (robbingTheKong) {
      addFan('Robbing The Kong', 8);
    }

    if (fullyConcealed) {
      addFan('Fully Concealed Hand', 4);
    } else if (concealedHand) {
      addFan('Concealed Hand', 2);
    } else if (method === 'self_draw' && !outWithReplacementTile && !lastTileDraw) {
      addFan('Self Drawn', 1);
    }

    if (allChows) {
      addFan('All Chows', 2);
    }

    if (allSimples) {
      addFan('All Simples', 2);
    }

    if (!fullFlush && !allSimples && noHonors) {
      addFan('No Honors', 1);
    }

    if (
      !fullFlush &&
      !halfFlush &&
      !allHonors &&
      !allTerminals &&
      !allTerminalsAndHonors &&
      oneVoidedSuit
    ) {
      addFan('One Voided Suit', 1);
    }

    const suppressDragonFans = bigThreeDragons || littleThreeDragons || allHonors;
    const suppressWindFans = bigFourWinds || littleFourWinds || allHonors;
    const suppressTerminalHonorPung = allHonors || allTerminals || allTerminalsAndHonors;

    for (const meld of tripletLikeMelds) {
      const tile = meld.tiles[0]!;
      if (tile.type === 'honor') {
        if (this.isDragonHonor(tile.honor)) {
          if (!suppressDragonFans) {
            addFan('Dragon Pung', 2);
          }
          continue;
        }

        let awardedWindFan = false;
        if (!suppressWindFans) {
          if (tile.honor === state.prevalentWind) {
            addFan('Prevalent Wind', 2);
            awardedWindFan = true;
          }
          if (tile.honor === state.seatWinds[playerId]) {
            addFan('Seat Wind', 2);
            awardedWindFan = true;
          }
        }

        if (!awardedWindFan && !suppressTerminalHonorPung) {
          addFan('Pung Of Terminals Or Honors', 1);
        }
        continue;
      }

      if (this.isTerminalTile(tile) && !suppressTerminalHonorPung) {
        addFan('Pung Of Terminals Or Honors', 1);
      }
    }

    return breakdown;
  }

  private calculatePayments(
    state: MahjongState,
    winner: string,
    method: 'self_draw' | 'discard',
    totalFan: number
  ): { [playerId: string]: number } {
    const payments: { [playerId: string]: number } = {};
    for (const playerId of state.playerOrder) {
      if (playerId === winner) {
        continue;
      }

      payments[playerId] = 8;
      if (method === 'self_draw' || playerId === state.lastDiscardPlayer) {
        payments[playerId] += totalFan;
      }
    }

    return payments;
  }

  private removeTilesByIds(tiles: MahjongTile[], tileIds: string[]): MahjongTile[] {
    const remainingIds = new Set(tileIds);
    return tiles.filter((tile) => {
      if (remainingIds.has(tile.id)) {
        remainingIds.delete(tile.id);
        return false;
      }
      return true;
    });
  }

  private sortTiles(tiles: MahjongTile[]): MahjongTile[] {
    const suitOrder: Suit[] = ['bamboo', 'character', 'dot'];
    const honorOrder: Honor[] = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];

    return [...tiles].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'suit' ? -1 : 1;
      }

      if (a.type === 'suit' && b.type === 'suit') {
        const suitDiff = suitOrder.indexOf(a.suit!) - suitOrder.indexOf(b.suit!);
        if (suitDiff !== 0) {
          return suitDiff;
        }
        return (a.value || 0) - (b.value || 0);
      }

      return honorOrder.indexOf(a.honor!) - honorOrder.indexOf(b.honor!);
    });
  }

  private isWindHonor(honor?: Honor): honor is Wind {
    return honor === 'east' || honor === 'south' || honor === 'west' || honor === 'north';
  }

  private isDragonHonor(honor?: Honor): honor is Dragon {
    return honor === 'red' || honor === 'green' || honor === 'white';
  }

  private isHonorTile(tile: MahjongTile): boolean {
    return tile.type === 'honor';
  }

  private isTerminalTile(tile: MahjongTile): boolean {
    return tile.type === 'suit' && (tile.value === 1 || tile.value === 9);
  }

  private getTileKey(tile: MahjongTile): string {
    if (tile.type === 'suit') {
      return tile.suit + '-' + tile.value;
    }
    return 'honor-' + tile.honor;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const mahjongMove = move.moveData as MahjongMove;
    const state = this.currentState as MahjongState;
    this.ensureStateDefaults(state);

    if (mahjongMove.action === 'draw') {
      this.drawTile(mahjongMove, state);
    } else if (mahjongMove.action === 'discard') {
      this.discardTile(mahjongMove, state);
    } else if (mahjongMove.action === 'declare_win') {
      this.declareWin(mahjongMove, state);
    } else if (mahjongMove.action === 'claim_pon') {
      this.claimPon(mahjongMove, state);
    } else if (mahjongMove.action === 'claim_chi') {
      this.claimChi(mahjongMove, state);
    } else if (mahjongMove.action === 'claim_kan') {
      this.claimKan(mahjongMove, state);
    } else if (mahjongMove.action === 'declare_kan') {
      this.declareKan(mahjongMove, state);
    } else if (mahjongMove.action === 'pass_claim') {
      this.passClaim(mahjongMove, state);
    }
  }

  private drawTile(move: MahjongMove, state: MahjongState): void {
    const isLastLiveTile = this.getLiveWallSize(state) === 1;
    const tile = state.wall.shift()!;
    state.hands[move.player]?.push(tile);
    state.claimWindow = null;
    state.lastTilePointReached = isLastLiveTile;
    state.lastDrawSource = 'live_wall';
    state.winningResult = null;

    state.lastAction = {
      action: 'draw',
      player: move.player,
      tile,
      details: move.player + ' drew a tile',
    };
  }

  private discardTile(move: MahjongMove, state: MahjongState): void {
    const tile = move.tile!;
    const playerHand = state.hands[move.player];

    if (!playerHand) return;

    const tileIndex = playerHand.findIndex((handTile) => handTile.id === tile.id);
    if (tileIndex !== -1) {
      playerHand.splice(tileIndex, 1);
    }

    state.discardPile.push(tile);
    state.lastDiscard = tile;
    state.lastDiscardPlayer = move.player;
    state.lastDrawSource = null;
    state.winningResult = null;

    state.lastAction = {
      action: 'discard',
      player: move.player,
      tile,
      details: move.player + ' discarded ' + this.getTileDescription(tile),
    };

    this.openClaimWindow(state);
  }

  private passClaim(move: MahjongMove, state: MahjongState): void {
    const claimTile = state.claimWindow?.tile ?? null;
    state.winningResult = null;

    state.lastAction = {
      action: 'pass_claim',
      player: move.player,
      tile: claimTile ?? undefined,
      details: move.player + ' passed on claiming the last discard',
    };

    this.advanceClaimWindow(state);
  }

  private removeTilesFromHandByIds(hand: MahjongTile[], tileIds: string[]): MahjongTile[] {
    const removedTiles: MahjongTile[] = [];

    for (const tileId of tileIds) {
      const tileIndex = hand.findIndex((handTile) => handTile.id === tileId);
      if (tileIndex !== -1) {
        removedTiles.push(hand.splice(tileIndex, 1)[0]!);
      }
    }

    return removedTiles;
  }

  private removeLastDiscardFromPile(state: MahjongState): void {
    const lastDiscard = state.lastDiscard;
    if (!lastDiscard) {
      return;
    }

    const discardIndex = state.discardPile.findIndex((tile) => tile.id === lastDiscard.id);
    if (discardIndex !== -1) {
      state.discardPile.splice(discardIndex, 1);
    }
  }

  private claimPon(move: MahjongMove, state: MahjongState): void {
    const claimTile = state.claimWindow!.tile;
    const claimKey = this.getTileKey(claimTile);
    const playerHand = state.hands[move.player]!;
    const claimedTiles = this.removeTilesFromHandByIds(
      playerHand,
      playerHand.filter((tile) => this.getTileKey(tile) === claimKey).slice(0, 2).map((tile) => tile.id)
    );

    const meldTiles = this.sortTiles([...claimedTiles, claimTile]);
    state.melds[move.player]!.push(meldTiles);
    state.meldStates[move.player]!.push({
      tiles: meldTiles,
      type: 'triplet',
      concealed: false,
    });
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;
    state.winningResult = null;

    state.lastAction = {
      action: 'claim_pon',
      player: move.player,
      tile: claimTile,
      details: move.player + ' claimed pon on ' + this.getTileDescription(claimTile),
    };
  }

  private claimChi(move: MahjongMove, state: MahjongState): void {
    const claimTile = state.claimWindow!.tile;
    const playerHand = state.hands[move.player]!;
    const selectedTiles = this.removeTilesFromHandByIds(
      playerHand,
      (move.tiles ?? []).map((tile) => tile.id)
    );

    const meldTiles = this.sortTiles([...selectedTiles, claimTile]);
    state.melds[move.player]!.push(meldTiles);
    state.meldStates[move.player]!.push({
      tiles: meldTiles,
      type: 'sequence',
      concealed: false,
    });
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;
    state.winningResult = null;

    state.lastAction = {
      action: 'claim_chi',
      player: move.player,
      tile: claimTile,
      details: move.player + ' claimed chi on ' + this.getTileDescription(claimTile),
    };
  }

  private drawSupplementalTile(state: MahjongState): MahjongTile | null {
    if (state.supplementalDrawsUsed >= this.MAX_KAN_DRAWS || state.wall.length === 0) {
      return null;
    }

    state.supplementalDrawsUsed++;
    const tile = state.wall.pop() ?? null;
    if (tile) {
      state.lastDrawSource = 'replacement';
    }
    return tile;
  }

  private upgradePonToKong(
    state: MahjongState,
    playerId: string,
    meldIndex: number,
    addedTile: MahjongTile
  ): void {
    const playerHand = state.hands[playerId]!;
    const addedTiles = this.removeTilesFromHandByIds(playerHand, [addedTile.id]);
    const updatedTiles = this.sortTiles([
      ...state.melds[playerId]![meldIndex]!,
      ...addedTiles,
    ]);

    state.melds[playerId]![meldIndex] = updatedTiles;
    state.meldStates[playerId]![meldIndex] = {
      tiles: updatedTiles,
      type: 'kong',
      concealed: false,
    };
  }

  private completePendingAddedKong(state: MahjongState): void {
    const pending = state.pendingAddedKong;
    if (!pending) {
      state.claimWindow = null;
      return;
    }

    this.upgradePonToKong(state, pending.player, pending.meldIndex, pending.tile);
    state.claimWindow = null;
    state.currentPlayer = pending.player;
    state.pendingAddedKong = null;
    state.winningResult = null;

    const supplementalTile = this.drawSupplementalTile(state);
    if (!supplementalTile) {
      this.finishExhaustiveDraw(
        state,
        pending.player + ' declared kan but no supplemental draw was available'
      );
      return;
    }

    state.hands[pending.player]!.push(supplementalTile);
    state.lastAction = {
      action: 'declare_kan',
      player: pending.player,
      tile: pending.tile,
      details:
        pending.player +
        ' completed an added kan on ' +
        this.getTileDescription(pending.tile) +
        ' and drew a supplemental tile',
    };
  }

  private claimKan(move: MahjongMove, state: MahjongState): void {
    const claimTile = state.claimWindow!.tile;
    const claimKey = this.getTileKey(claimTile);
    const playerHand = state.hands[move.player]!;
    const claimedTiles = this.removeTilesFromHandByIds(
      playerHand,
      playerHand
        .filter((tile) => this.getTileKey(tile) === claimKey)
        .slice(0, 3)
        .map((tile) => tile.id)
    );

    const meldTiles = this.sortTiles([...claimedTiles, claimTile]);
    state.melds[move.player]!.push(meldTiles);
    state.meldStates[move.player]!.push({
      tiles: meldTiles,
      type: 'kong',
      concealed: false,
    });
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;
    state.winningResult = null;

    const supplementalTile = this.drawSupplementalTile(state);
    if (!supplementalTile) {
      this.finishExhaustiveDraw(
        state,
        move.player + ' declared kan but no supplemental draw was available'
      );
      return;
    }

    playerHand.push(supplementalTile);
    state.lastAction = {
      action: 'claim_kan',
      player: move.player,
      tile: claimTile,
      details:
        move.player +
        ' claimed kan on ' +
        this.getTileDescription(claimTile) +
        ' and drew a supplemental tile',
    };
  }

  private declareKan(move: MahjongMove, state: MahjongState): void {
    const kanTile = move.tile!;
    const kanKey = this.getTileKey(kanTile);
    const playerHand = state.hands[move.player]!;
    const matchingHandTiles = playerHand.filter((tile) => this.getTileKey(tile) === kanKey);
    const existingPonIndex = this.findUpgradeablePonIndex(move.player, kanTile, state);
    let kanType = 'concealed';

    if (matchingHandTiles.length >= 4) {
      const kanTiles = this.sortTiles(
        this.removeTilesFromHandByIds(playerHand, matchingHandTiles.slice(0, 4).map((tile) => tile.id))
      );
      state.melds[move.player]!.push(kanTiles);
      state.meldStates[move.player]!.push({
        tiles: kanTiles,
        type: 'kong',
        concealed: true,
      });
    } else if (existingPonIndex !== -1 && matchingHandTiles.length >= 1) {
      const addedTile = matchingHandTiles[0]!;
      const robPlayers = this.getClaimPriorityPlayers(move.player, state, (playerId) => {
        return this.getWinningResult(playerId, state, 'discard', addedTile, 'rob_kong') !== null;
      });

      if (robPlayers.length > 0) {
        state.claimWindow = {
          tile: addedTile,
          discardedBy: move.player,
          nextPlayer: this.getNextPlayerAfter(move.player, state),
          phase: 'ron',
          pendingPlayers: robPlayers,
          source: 'rob_kong',
        };
        state.pendingAddedKong = {
          player: move.player,
          tile: addedTile,
          meldIndex: existingPonIndex,
        };
        state.currentPlayer = robPlayers[0]!;
        state.winningResult = null;
        state.lastAction = {
          action: 'declare_kan',
          player: move.player,
          tile: kanTile,
          details:
            move.player +
            ' attempted an added kan on ' +
            this.getTileDescription(kanTile) +
            ' and opened a robbing-the-kong window',
        };
        return;
      }

      this.upgradePonToKong(state, move.player, existingPonIndex, addedTile);
      kanType = 'added';
    }

    const supplementalTile = this.drawSupplementalTile(state);
    if (!supplementalTile) {
      this.finishExhaustiveDraw(
        state,
        move.player + ' declared kan but no supplemental draw was available'
      );
      return;
    }

    playerHand.push(supplementalTile);
    state.pendingAddedKong = null;
    state.winningResult = null;
    state.lastAction = {
      action: 'declare_kan',
      player: move.player,
      tile: kanTile,
      details:
        move.player +
        ' declared ' +
        kanType +
        ' kan on ' +
        this.getTileDescription(kanTile) +
        ' and drew a supplemental tile',
    };
  }

  private declareWin(move: MahjongMove, state: MahjongState): void {
    const method = state.claimWindow ? 'discard' : 'self_draw';
    const claimedTile = state.claimWindow?.tile;
    const winningResult = this.getWinningResult(move.player, state, method, claimedTile);

    if (!winningResult) {
      throw new Error('Winning declaration does not satisfy the Chinese Official 8-fan minimum');
    }

    if (method === 'discard' && state.claimWindow?.source === 'discard') {
      this.removeLastDiscardFromPile(state);
    }

    this.applyWinningResultToSessionScores(state, winningResult);

    state.gameOver = true;
    state.winner = move.player;
    state.gamePhase = 'finished';
    state.claimWindow = null;
    state.pendingAddedKong = null;
    state.currentPlayer = move.player;
    state.winningResult = winningResult;

    state.lastAction = {
      action: 'win',
      player: move.player,
      tile: claimedTile ?? state.lastDiscard ?? undefined,
      details:
        move.player +
        ' declares Mahjong and wins with ' +
        winningResult.totalFan +
        ' fan for ' +
        winningResult.score +
        ' points',
    };
  }

  private moveToNextPlayer(state: MahjongState): void {
    state.currentPlayer = this.getNextPlayerAfter(state.currentPlayer, state);
  }

  async startNextHand(): Promise<GameState> {
    const state = this.currentState as MahjongState;
    this.ensureStateDefaults(state);

    if (!state.gameOver || state.gamePhase !== 'finished') {
      throw new Error('Current hand is still in progress');
    }

    const nextRoundNumber = (state.roundNumber ?? 1) + 1;
    const nextDealer = this.getNextPlayerAfter(state.dealer, state);
    this.resetForNextHand(state, nextDealer, nextRoundNumber);
    await this.saveStateSnapshot();
    await this.persistState();

    return this.getGameState();
  }

  private getTileDescription(tile: MahjongTile): string {
    if (tile.type === 'suit') {
      return `${tile.value} of ${tile.suit}`;
    }
    return `${tile.honor} dragon/wind`;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as MahjongState;
    this.ensureStateDefaults(state);

    const sanitizedHands: any = {};
    for (const [playerId, hand] of Object.entries(state.hands)) {
      sanitizedHands[playerId] = {
        tiles: hand,
        tileCount: this.getPlayerTileCount(playerId, state),
      };
    }

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      hands: sanitizedHands,
      wallSize: state.wall.length,
      liveWallSize: this.getLiveWallSize(state),
      supplementalDrawsUsed: state.supplementalDrawsUsed,
      lastTilePointReached: state.lastTilePointReached,
      lastDrawSource: state.lastDrawSource,
      discardPile: state.discardPile,
      lastDiscard: state.lastDiscard,
      lastDiscardPlayer: state.lastDiscardPlayer,
      claimWindow: state.claimWindow,
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      roundNumber: state.roundNumber,
      dealer: state.dealer,
      prevalentWind: state.prevalentWind,
      seatWinds: state.seatWinds,
      sessionScores: state.sessionScores,
      lastAction: state.lastAction,
      melds: state.melds,
      winningResult: state.winningResult,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as MahjongState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as MahjongState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Mahjong',
      description: 'Chinese Official style Mahjong engine with draw-discard play, claims, and scored wins',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '45-90 minutes',
      complexity: 'advanced',
      categories: ['tile', 'strategy', 'traditional', 'asian'],
    };
  }
}

export function createMahjongGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): MahjongGame {
  return new MahjongGame(gameId, database);
}

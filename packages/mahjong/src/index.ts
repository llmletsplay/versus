import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';

type Suit = 'bamboo' | 'character' | 'dot';
type Honor = 'east' | 'south' | 'west' | 'north' | 'red' | 'green' | 'white';
type TileType = 'suit' | 'honor';

interface MahjongTile {
  type: TileType;
  suit?: Suit;
  honor?: Honor;
  value?: number;
  id: string;
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
  lastAction: {
    action: string;
    player?: string;
    tile?: MahjongTile;
    details?: string;
  } | null;
  melds: { [playerId: string]: MahjongTile[][] };
  lastDiscardPlayer: string | null;
  claimWindow: {
    tile: MahjongTile;
    discardedBy: string;
    nextPlayer: string;
    phase: 'ron' | 'pon' | 'chi';
    pendingPlayers: string[];
  } | null;
  supplementalDrawsUsed: number;
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

    for (const playerId of playerIds) {
      hands[playerId] = wall.splice(0, this.HAND_SIZE);
      melds[playerId] = [];
    }

    const dealer = playerIds[0]!;
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
      lastAction: null,
      melds,
      lastDiscardPlayer: null,
      claimWindow: null,
      supplementalDrawsUsed: 0,
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

  private getMeldTileCount(meld: MahjongTile[]): number {
    return meld.length === 4 ? 3 : meld.length;
  }

  private getPlayerTileCount(playerId: string, state: MahjongState): number {
    const concealedTiles = state.hands[playerId]?.length ?? 0;
    const meldTiles = (state.melds[playerId] ?? []).reduce(
      (sum, meld) => sum + this.getMeldTileCount(meld),
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
    state.lastAction = {
      action: 'draw_game',
      details,
    };
  }

  private openClaimWindow(state: MahjongState): void {
    const tile = state.lastDiscard;
    const discardedBy = state.lastDiscardPlayer;

    if (!tile || !discardedBy) {
      state.claimWindow = null;
      return;
    }

    const nextPlayer = this.getNextPlayerAfter(discardedBy, state);
    const ronPlayers = this.getClaimPriorityPlayers(discardedBy, state, (playerId) => {
      return this.checkWinningHand(playerId, state, tile);
    });

    if (ronPlayers.length > 0) {
      state.claimWindow = {
        tile,
        discardedBy,
        nextPlayer,
        phase: 'ron',
        pendingPlayers: ronPlayers,
      };
      state.currentPlayer = ronPlayers[0]!;
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
    const claimWindow = state.claimWindow;
    if (!claimWindow) {
      return;
    }

    claimWindow.pendingPlayers.shift();
    if (claimWindow.pendingPlayers.length > 0) {
      state.currentPlayer = claimWindow.pendingPlayers[0]!;
      return;
    }

    const { discardedBy, tile, nextPlayer, phase } = claimWindow;

    if (phase === 'ron') {
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

          if (!this.checkWinningHand(move.player, state, state.claimWindow.tile)) {
            return { valid: false, error: 'Player does not have a winning hand' };
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
      }

      if (move.action === 'declare_win') {
        if (!this.checkWinningHand(move.player, state)) {
          return { valid: false, error: 'Player does not have a winning hand' };
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
    claimedTile?: MahjongTile
  ): boolean {
    const hand = [...(state.hands[playerId] || [])];
    if (claimedTile) {
      hand.push(claimedTile);
    }

    const openMeldCount = state.melds[playerId]?.length ?? 0;
    const requiredMelds = 4 - openMeldCount;
    const requiredHandSize = 2 + requiredMelds * 3;

    if (hand.length !== requiredHandSize) {
      return false;
    }

    if (openMeldCount === 0 && hand.length === this.WINNING_HAND_SIZE && this.isSevenPairs(hand)) {
      return true;
    }

    return this.canFormWinningHand(hand, requiredMelds);
  }

  private isSevenPairs(tiles: MahjongTile[]): boolean {
    const tileCounts = new Map<string, number>();

    for (const tile of tiles) {
      const key = this.getTileKey(tile);
      tileCounts.set(key, (tileCounts.get(key) || 0) + 1);
    }

    return tileCounts.size === 7 && Array.from(tileCounts.values()).every((count) => count === 2);
  }

  private canFormWinningHand(tiles: MahjongTile[], requiredMelds: number): boolean {
    const sortedTiles = this.sortTiles(tiles);
    const uniqueKeys = [...new Set(sortedTiles.map((tile) => this.getTileKey(tile)))];

    for (const key of uniqueKeys) {
      const pairCount = sortedTiles.filter((tile) => this.getTileKey(tile) === key).length;
      if (pairCount < 2) {
        continue;
      }

      const remainingTiles = this.removeTilesByKey(sortedTiles, key, 2);
      if (this.canFormMelds(remainingTiles, requiredMelds)) {
        return true;
      }
    }

    return false;
  }

  private canFormMelds(tiles: MahjongTile[], meldsRemaining: number): boolean {
    if (meldsRemaining === 0) {
      return tiles.length === 0;
    }

    if (tiles.length !== meldsRemaining * 3) {
      return false;
    }

    const sortedTiles = this.sortTiles(tiles);
    const firstTile = sortedTiles[0]!;
    const firstKey = this.getTileKey(firstTile);
    const matchingCount = sortedTiles.filter((tile) => this.getTileKey(tile) === firstKey).length;

    if (matchingCount >= 3) {
      const withoutTriplet = this.removeTilesByKey(sortedTiles, firstKey, 3);
      if (this.canFormMelds(withoutTriplet, meldsRemaining - 1)) {
        return true;
      }
    }

    if (firstTile.type === 'suit' && firstTile.value !== undefined && firstTile.value <= 7) {
      const nextKey = firstTile.suit + '-' + (firstTile.value + 1);
      const thirdKey = firstTile.suit + '-' + (firstTile.value + 2);

      if (
        sortedTiles.some((tile) => this.getTileKey(tile) === nextKey) &&
        sortedTiles.some((tile) => this.getTileKey(tile) === thirdKey)
      ) {
        const withoutSequence = this.removeTilesByKeys(sortedTiles, [firstKey, nextKey, thirdKey]);
        if (this.canFormMelds(withoutSequence, meldsRemaining - 1)) {
          return true;
        }
      }
    }

    return false;
  }

  private removeTilesByKey(tiles: MahjongTile[], key: string, count: number): MahjongTile[] {
    let remaining = count;
    return tiles.filter((tile) => {
      if (remaining > 0 && this.getTileKey(tile) === key) {
        remaining--;
        return false;
      }
      return true;
    });
  }

  private removeTilesByKeys(tiles: MahjongTile[], keys: string[]): MahjongTile[] {
    const remainingCounts = new Map<string, number>();

    for (const key of keys) {
      remainingCounts.set(key, (remainingCounts.get(key) || 0) + 1);
    }

    return tiles.filter((tile) => {
      const key = this.getTileKey(tile);
      const remaining = remainingCounts.get(key) || 0;
      if (remaining > 0) {
        remainingCounts.set(key, remaining - 1);
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

  private getTileKey(tile: MahjongTile): string {
    if (tile.type === 'suit') {
      return `${tile.suit}-${tile.value}`;
    }
    return `honor-${tile.honor}`;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const mahjongMove = move.moveData as MahjongMove;
    const state = this.currentState as MahjongState;

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
    const tile = state.wall.shift()!;
    state.hands[move.player]?.push(tile);
    state.claimWindow = null;

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

    state.melds[move.player]!.push(this.sortTiles([...claimedTiles, claimTile]));
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;

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

    state.melds[move.player]!.push(this.sortTiles([...selectedTiles, claimTile]));
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;

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
    return state.wall.pop() ?? null;
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

    state.melds[move.player]!.push(this.sortTiles([...claimedTiles, claimTile]));
    this.removeLastDiscardFromPile(state);
    state.lastDiscard = null;
    state.lastDiscardPlayer = null;
    state.claimWindow = null;
    state.currentPlayer = move.player;

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
      const kanTiles = this.removeTilesFromHandByIds(
        playerHand,
        matchingHandTiles.slice(0, 4).map((tile) => tile.id)
      );
      state.melds[move.player]!.push(this.sortTiles(kanTiles));
    } else if (existingPonIndex !== -1 && matchingHandTiles.length >= 1) {
      const addedTile = this.removeTilesFromHandByIds(playerHand, [matchingHandTiles[0]!.id]);
      state.melds[move.player]![existingPonIndex] = this.sortTiles([
        ...state.melds[move.player]![existingPonIndex]!,
        ...addedTile,
      ]);
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
    state.gameOver = true;
    state.winner = move.player;
    state.gamePhase = 'finished';
    state.claimWindow = null;

    state.lastAction = {
      action: 'win',
      player: move.player,
      tile: state.lastDiscard ?? undefined,
      details: move.player + ' declares Mahjong and wins!',
    };
  }

  private moveToNextPlayer(state: MahjongState): void {
    state.currentPlayer = this.getNextPlayerAfter(state.currentPlayer, state);
  }

  private getTileDescription(tile: MahjongTile): string {
    if (tile.type === 'suit') {
      return `${tile.value} of ${tile.suit}`;
    }
    return `${tile.honor} dragon/wind`;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as MahjongState;

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
      discardPile: state.discardPile,
      lastDiscard: state.lastDiscard,
      lastDiscardPlayer: state.lastDiscardPlayer,
      claimWindow: state.claimWindow,
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      roundNumber: state.roundNumber,
      dealer: state.dealer,
      lastAction: state.lastAction,
      melds: state.melds,
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
      description: 'Traditional Chinese tile-based game of skill and strategy',
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
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): MahjongGame {
  return new MahjongGame(gameId, database);
}

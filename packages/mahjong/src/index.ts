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
}

interface MahjongMove {
  player: string;
  action: 'draw' | 'discard' | 'declare_win';
  tile?: MahjongTile;
}

export class MahjongGame extends BaseGame {
  private readonly HAND_SIZE = 13;
  private readonly WINNING_HAND_SIZE = 14;

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

      if (!['draw', 'discard', 'declare_win'].includes(move.action)) {
        return { valid: false, error: 'Action must be draw, discard, or declare_win' };
      }

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.action === 'draw') {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        if (state.hands[move.player]?.length !== this.HAND_SIZE) {
          return { valid: false, error: 'Player already has drawn tile' };
        }

        if (state.wall.length === 0) {
          return { valid: false, error: 'No tiles left in wall' };
        }
      }

      if (move.action === 'discard') {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        if (state.hands[move.player]?.length !== this.WINNING_HAND_SIZE) {
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

      if (move.action === 'declare_win') {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        if (!this.checkWinningHand(move.player, state)) {
          return { valid: false, error: 'Player does not have a winning hand' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private checkWinningHand(playerId: string, state: MahjongState): boolean {
    const hand = [...(state.hands[playerId] || [])];

    if (hand.length !== this.WINNING_HAND_SIZE) {
      return false;
    }

    return this.isSevenPairs(hand) || this.canFormWinningHand(hand);
  }

  private isSevenPairs(tiles: MahjongTile[]): boolean {
    const tileCounts = new Map<string, number>();

    for (const tile of tiles) {
      const key = this.getTileKey(tile);
      tileCounts.set(key, (tileCounts.get(key) || 0) + 1);
    }

    return tileCounts.size === 7 && Array.from(tileCounts.values()).every((count) => count === 2);
  }

  private canFormWinningHand(tiles: MahjongTile[]): boolean {
    const sortedTiles = this.sortTiles(tiles);
    const uniqueKeys = [...new Set(sortedTiles.map((tile) => this.getTileKey(tile)))];

    for (const key of uniqueKeys) {
      const pairCount = sortedTiles.filter((tile) => this.getTileKey(tile) === key).length;
      if (pairCount < 2) {
        continue;
      }

      const remainingTiles = this.removeTilesByKey(sortedTiles, key, 2);
      if (this.canFormMelds(remainingTiles)) {
        return true;
      }
    }

    return false;
  }

  private canFormMelds(tiles: MahjongTile[]): boolean {
    if (tiles.length === 0) {
      return true;
    }

    const sortedTiles = this.sortTiles(tiles);
    const firstTile = sortedTiles[0]!;
    const firstKey = this.getTileKey(firstTile);
    const matchingCount = sortedTiles.filter((tile) => this.getTileKey(tile) === firstKey).length;

    if (matchingCount >= 3) {
      const withoutTriplet = this.removeTilesByKey(sortedTiles, firstKey, 3);
      if (this.canFormMelds(withoutTriplet)) {
        return true;
      }
    }

    if (firstTile.type === 'suit' && firstTile.value !== undefined && firstTile.value <= 7) {
      const nextKey = `${firstTile.suit}-${firstTile.value + 1}`;
      const thirdKey = `${firstTile.suit}-${firstTile.value + 2}`;

      if (
        sortedTiles.some((tile) => this.getTileKey(tile) === nextKey) &&
        sortedTiles.some((tile) => this.getTileKey(tile) === thirdKey)
      ) {
        const withoutSequence = this.removeTilesByKeys(sortedTiles, [firstKey, nextKey, thirdKey]);
        if (this.canFormMelds(withoutSequence)) {
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
    }
  }

  private drawTile(move: MahjongMove, state: MahjongState): void {
    const tile = state.wall.shift()!;
    state.hands[move.player]?.push(tile);

    state.lastAction = {
      action: 'draw',
      player: move.player,
      tile,
      details: `${move.player} drew a tile`,
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

    state.lastAction = {
      action: 'discard',
      player: move.player,
      tile,
      details: `${move.player} discarded ${this.getTileDescription(tile)}`,
    };

    this.moveToNextPlayer(state);
  }

  private declareWin(move: MahjongMove, state: MahjongState): void {
    state.gameOver = true;
    state.winner = move.player;
    state.gamePhase = 'finished';

    state.lastAction = {
      action: 'win',
      player: move.player,
      details: `${move.player} declares Mahjong and wins!`,
    };
  }

  private moveToNextPlayer(state: MahjongState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
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
        tileCount: hand.length,
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
      discardPile: state.discardPile,
      lastDiscard: state.lastDiscard,
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

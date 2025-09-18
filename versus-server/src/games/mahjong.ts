import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Suit = 'bamboo' | 'character' | 'dot';
type Honor = 'east' | 'south' | 'west' | 'north' | 'red' | 'green' | 'white';
type TileType = 'suit' | 'honor';

interface MahjongTile {
  type: TileType;
  suit?: Suit;
  honor?: Honor;
  value?: number; // 1-9 for suit tiles
  id: string;
}

interface MahjongState extends GameState {
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
  melds: { [playerId: string]: MahjongTile[][] }; // Sets and runs
}

interface MahjongMove {
  player: string;
  action: 'draw' | 'discard' | 'declare_win';
  tile?: MahjongTile;
}

export class MahjongGame extends BaseGame {
  private readonly HAND_SIZE = 13;
  private readonly WINNING_HAND_SIZE = 14;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'mahjong', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 4);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    // Create tile set
    const wall = this.createTileSet();
    this.shuffleTiles(wall);

    // Deal hands
    const hands: { [playerId: string]: MahjongTile[] } = {};
    const melds: { [playerId: string]: MahjongTile[][] } = {};

    for (const playerId of playerIds) {
      hands[playerId] = wall.splice(0, this.HAND_SIZE);
      melds[playerId] = [];
    }

    // Dealer gets extra tile
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

    // Suit tiles (4 of each, 1-9 in each suit)
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

    // Honor tiles (4 of each)
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

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!state.hands[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      if (!['draw', 'discard', 'declare_win'].includes(move.action)) {
        return { valid: false, error: 'Action must be draw, discard, or declare_win' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Validate specific actions
      if (move.action === 'draw') {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        if (state.hands[move.player].length !== this.HAND_SIZE) {
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

        if (state.hands[move.player].length !== this.WINNING_HAND_SIZE) {
          return { valid: false, error: 'Must draw before discarding' };
        }

        if (!move.tile) {
          return { valid: false, error: 'Must specify tile to discard' };
        }

        // Check if player has this tile
        const playerHand = state.hands[move.player];
        if (!playerHand.some(tile => tile.id === move.tile!.id)) {
          return { valid: false, error: 'Player does not have this tile' };
        }
      }

      if (move.action === 'declare_win') {
        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        // Check if player has winning hand
        const hasWinningHand = this.checkWinningHand(move.player, state);
        if (!hasWinningHand) {
          return { valid: false, error: 'Player does not have a winning hand' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private checkWinningHand(playerId: string, state: MahjongState): boolean {
    const hand = [...state.hands[playerId]];

    // Simple winning condition: 4 sets + 1 pair
    // A set is either 3 identical tiles or 3 consecutive tiles of same suit

    if (hand.length !== this.WINNING_HAND_SIZE) {
      return false;
    }

    // Try to find a pair and 4 sets
    return this.canFormWinningHand(hand);
  }

  private canFormWinningHand(tiles: MahjongTile[]): boolean {
    // This is a simplified version - real Mahjong has more complex rules
    const tileCounts = new Map<string, number>();

    // Count tiles
    for (const tile of tiles) {
      const key = this.getTileKey(tile);
      tileCounts.set(key, (tileCounts.get(key) || 0) + 1);
    }

    let pairs = 0;
    let sets = 0;

    // Count pairs and triplets
    for (const count of tileCounts.values()) {
      if (count >= 2) {
        pairs += Math.floor(count / 2);
        if (count >= 3) {
          sets += Math.floor(count / 3);
        }
      }
    }

    // Simple winning condition: at least 1 pair and 4 sets (very simplified)
    return pairs >= 1 && sets >= 4;
  }

  private getTileKey(tile: MahjongTile): string {
    if (tile.type === 'suit') {
      return `${tile.suit}-${tile.value}`;
    } else {
      return `honor-${tile.honor}`;
    }
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
    state.hands[move.player].push(tile);

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

    // Remove tile from hand
    const tileIndex = playerHand.findIndex(handTile => handTile.id === tile.id);
    if (tileIndex !== -1) {
      playerHand.splice(tileIndex, 1);
    }

    // Add to discard pile
    state.discardPile.push(tile);
    state.lastDiscard = tile;

    state.lastAction = {
      action: 'discard',
      player: move.player,
      tile,
      details: `${move.player} discarded ${this.getTileDescription(tile)}`,
    };

    // Move to next player
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
    } else {
      return `${tile.honor} dragon/wind`;
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as MahjongState;

    // Hide other players' hands
    const sanitizedHands: any = {};
    for (const [playerId, hand] of Object.entries(state.hands)) {
      sanitizedHands[playerId] = {
        tiles: hand, // In a real game, you'd hide other players' tiles
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

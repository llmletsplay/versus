import { InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';
import type { DatabaseProvider } from '@llmletsplay/versus-game-core';
import { BaseGame } from '@llmletsplay/versus-game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@llmletsplay/versus-game-core';

type Player = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';
type PlayerCount = 2 | 3 | 4 | 6;
type HomeArea = 'north' | 'northeast' | 'southeast' | 'south' | 'southwest' | 'northwest';

interface Position {
  row: number;
  col: number;
}

export interface ChineseCheckersState extends GameState {
  board: (Player | null)[][];
  players: Player[];
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | null;
  startingPositions: { [player in Player]?: Position[] };
  targetPositions: { [player in Player]?: Position[] };
  lastAction: {
    action: string;
    player?: Player;
    from?: Position;
    to?: Position;
    details?: string;
  } | null;
  moveCount: number;
}

interface ChineseCheckersMove {
  player: Player;
  from: Position;
  to: Position;
}

const BOARD_ROWS: readonly number[][] = [
  [12],
  [11, 13],
  [10, 12, 14],
  [9, 11, 13, 15],
  [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23],
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
  [3, 5, 7, 9, 11, 13, 15, 17, 19, 21],
  [4, 6, 8, 10, 12, 14, 16, 18, 20],
  [3, 5, 7, 9, 11, 13, 15, 17, 19, 21],
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
  [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23],
  [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  [9, 11, 13, 15],
  [10, 12, 14],
  [11, 13],
  [12],
] as const;

const AREA_POSITIONS: Readonly<Record<HomeArea, readonly Position[]>> = {
  north: [
    { row: 0, col: 12 },
    { row: 1, col: 11 },
    { row: 1, col: 13 },
    { row: 2, col: 10 },
    { row: 2, col: 12 },
    { row: 2, col: 14 },
    { row: 3, col: 9 },
    { row: 3, col: 11 },
    { row: 3, col: 13 },
    { row: 3, col: 15 },
  ],
  northeast: [
    { row: 4, col: 18 },
    { row: 4, col: 20 },
    { row: 4, col: 22 },
    { row: 4, col: 24 },
    { row: 5, col: 19 },
    { row: 5, col: 21 },
    { row: 5, col: 23 },
    { row: 6, col: 20 },
    { row: 6, col: 22 },
    { row: 7, col: 21 },
  ],
  southeast: [
    { row: 9, col: 21 },
    { row: 10, col: 20 },
    { row: 10, col: 22 },
    { row: 11, col: 19 },
    { row: 11, col: 21 },
    { row: 11, col: 23 },
    { row: 12, col: 18 },
    { row: 12, col: 20 },
    { row: 12, col: 22 },
    { row: 12, col: 24 },
  ],
  south: [
    { row: 13, col: 9 },
    { row: 13, col: 11 },
    { row: 13, col: 13 },
    { row: 13, col: 15 },
    { row: 14, col: 10 },
    { row: 14, col: 12 },
    { row: 14, col: 14 },
    { row: 15, col: 11 },
    { row: 15, col: 13 },
    { row: 16, col: 12 },
  ],
  southwest: [
    { row: 9, col: 3 },
    { row: 10, col: 2 },
    { row: 10, col: 4 },
    { row: 11, col: 1 },
    { row: 11, col: 3 },
    { row: 11, col: 5 },
    { row: 12, col: 0 },
    { row: 12, col: 2 },
    { row: 12, col: 4 },
    { row: 12, col: 6 },
  ],
  northwest: [
    { row: 4, col: 0 },
    { row: 4, col: 2 },
    { row: 4, col: 4 },
    { row: 4, col: 6 },
    { row: 5, col: 1 },
    { row: 5, col: 3 },
    { row: 5, col: 5 },
    { row: 6, col: 2 },
    { row: 6, col: 4 },
    { row: 7, col: 3 },
  ],
} as const;

const PLAYER_SETUPS: Readonly<
  Record<
    PlayerCount,
    readonly { player: Player; home: HomeArea; target: HomeArea }[]
  >
> = {
  2: [
    { player: 'red', home: 'north', target: 'south' },
    { player: 'blue', home: 'south', target: 'north' },
  ],
  3: [
    { player: 'red', home: 'north', target: 'south' },
    { player: 'blue', home: 'southwest', target: 'northeast' },
    { player: 'green', home: 'southeast', target: 'northwest' },
  ],
  4: [
    { player: 'red', home: 'northwest', target: 'southeast' },
    { player: 'blue', home: 'northeast', target: 'southwest' },
    { player: 'green', home: 'southwest', target: 'northeast' },
    { player: 'yellow', home: 'southeast', target: 'northwest' },
  ],
  6: [
    { player: 'red', home: 'north', target: 'south' },
    { player: 'blue', home: 'south', target: 'north' },
    { player: 'green', home: 'northwest', target: 'southeast' },
    { player: 'yellow', home: 'southeast', target: 'northwest' },
    { player: 'orange', home: 'northeast', target: 'southwest' },
    { player: 'purple', home: 'southwest', target: 'northeast' },
  ],
} as const;

function clonePositions(positions: readonly Position[]): Position[] {
  return positions.map((position) => ({ ...position }));
}

export class ChineseCheckersGame extends BaseGame<ChineseCheckersState> {
  declare protected currentState: ChineseCheckersState;

  private readonly BOARD_HEIGHT = BOARD_ROWS.length;
  private readonly BOARD_WIDTH = 25;
  private readonly VALID_POSITIONS = new Set(
    BOARD_ROWS.flatMap((cols, row) => cols.map((col) => `${row},${col}`))
  );
  private readonly STEP_DIRECTIONS: readonly Position[] = [
    { row: 0, col: -2 },
    { row: 0, col: 2 },
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ];

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'chinese-checkers', database);
  }

  async initializeGame(config?: GameConfig): Promise<ChineseCheckersState> {
    const playerCount = this.resolvePlayerCount(config);
    const playerSetup = PLAYER_SETUPS[playerCount];
    const players = playerSetup.map((entry) => entry.player);
    const board = this.createBoard();
    const startingPositions: ChineseCheckersState['startingPositions'] = {};
    const targetPositions: ChineseCheckersState['targetPositions'] = {};

    for (const entry of playerSetup) {
      const start = clonePositions(AREA_POSITIONS[entry.home]);
      const target = clonePositions(AREA_POSITIONS[entry.target]);
      startingPositions[entry.player] = start;
      targetPositions[entry.player] = target;

      for (const position of start) {
        board[position.row]![position.col] = entry.player;
      }
    }

    const initialState: ChineseCheckersState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board,
      players,
      currentPlayer: players[0]!,
      gameOver: false,
      winner: null,
      startingPositions,
      targetPositions,
      lastAction: null,
      moveCount: 0,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private resolvePlayerCount(config?: GameConfig): PlayerCount {
    const requestedPlayerCount =
      (config as any)?.playerCount ?? (config as any)?.customRules?.playerCount ?? 2;

    if (![2, 3, 4, 6].includes(requestedPlayerCount)) {
      throw new Error('Official Chinese Checkers supports 2, 3, 4, or 6 players');
    }

    return requestedPlayerCount as PlayerCount;
  }

  private createBoard(): (Player | null)[][] {
    return Array.from({ length: this.BOARD_HEIGHT }, () => Array(this.BOARD_WIDTH).fill(null));
  }

  private isValidPosition(position: Position): boolean {
    return (
      Number.isInteger(position.row) &&
      Number.isInteger(position.col) &&
      this.VALID_POSITIONS.has(this.getPositionKey(position))
    );
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as ChineseCheckersMove;
      const state = this.currentState as ChineseCheckersState;

      if (!move.player || !move.from || !move.to) {
        return { valid: false, error: 'Move must include player, from, and to positions' };
      }

      if (!state.players.includes(move.player)) {
        return { valid: false, error: 'Invalid player' };
      }

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      if (!this.isValidPosition(move.from) || !this.isValidPosition(move.to)) {
        return { valid: false, error: 'Invalid board positions' };
      }

      if (state.board[move.from.row]![move.from.col] !== move.player) {
        return { valid: false, error: 'No piece of yours at the from position' };
      }

      if (state.board[move.to.row]![move.to.col] !== null) {
        return { valid: false, error: 'Destination position is occupied' };
      }

      return this.validateMovePattern(move, state);
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateMovePattern(
    move: ChineseCheckersMove,
    state: ChineseCheckersState
  ): MoveValidationResult {
    if (this.isAdjacentMove(move.from, move.to)) {
      return { valid: true };
    }

    if (this.canReachByJumpSequence(move.from, move.to, state)) {
      return { valid: true };
    }

    const isDirectJumpAttempt = this.STEP_DIRECTIONS.some(
      (direction) =>
        move.from.row + direction.row * 2 === move.to.row &&
        move.from.col + direction.col * 2 === move.to.col
    );

    if (isDirectJumpAttempt) {
      const middle = {
        row: move.from.row + (move.to.row - move.from.row) / 2,
        col: move.from.col + (move.to.col - move.from.col) / 2,
      };

      if (state.board[middle.row]![middle.col] === null) {
        return { valid: false, error: 'No piece to jump over' };
      }
    }

    return { valid: false, error: 'Invalid move pattern' };
  }

  private isAdjacentMove(from: Position, to: Position): boolean {
    return this.STEP_DIRECTIONS.some(
      (direction) => from.row + direction.row === to.row && from.col + direction.col === to.col
    );
  }

  private canReachByJumpSequence(
    from: Position,
    to: Position,
    state: ChineseCheckersState
  ): boolean {
    const queue: Position[] = [from];
    const visited = new Set([this.getPositionKey(from)]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const jumpDestinations = this.getJumpDestinations(current, state);

      for (const destination of jumpDestinations) {
        const key = this.getPositionKey(destination);
        if (visited.has(key)) {
          continue;
        }

        if (destination.row === to.row && destination.col === to.col) {
          return true;
        }

        visited.add(key);
        queue.push(destination);
      }
    }

    return false;
  }

  private getJumpDestinations(from: Position, state: ChineseCheckersState): Position[] {
    const destinations: Position[] = [];

    for (const direction of this.STEP_DIRECTIONS) {
      const middle = {
        row: from.row + direction.row,
        col: from.col + direction.col,
      };
      const landing = {
        row: from.row + direction.row * 2,
        col: from.col + direction.col * 2,
      };

      if (!this.isValidPosition(middle) || !this.isValidPosition(landing)) {
        continue;
      }

      if (state.board[middle.row]![middle.col] === null) {
        continue;
      }

      if (state.board[landing.row]![landing.col] !== null) {
        continue;
      }

      destinations.push(landing);
    }

    return destinations;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const chineseCheckersMove = move.moveData as ChineseCheckersMove;
    const state = this.currentState as ChineseCheckersState;

    this.movePiece(chineseCheckersMove, state);
    this.checkWinCondition(state, chineseCheckersMove.player);

    if (!state.gameOver) {
      this.moveToNextPlayer(state);
    }
  }

  private movePiece(move: ChineseCheckersMove, state: ChineseCheckersState): void {
    state.board[move.from.row]![move.from.col] = null;
    state.board[move.to.row]![move.to.col] = move.player;
    state.moveCount++;
    state.lastAction = {
      action: 'move',
      player: move.player,
      from: move.from,
      to: move.to,
      details: `${move.player} moved from (${move.from.row},${move.from.col}) to (${move.to.row},${move.to.col})`,
    };
  }

  private checkWinCondition(state: ChineseCheckersState, player: Player): void {
    const targetPositions = state.targetPositions[player];
    if (!targetPositions) {
      return;
    }

    const hasFilledTargetArea = targetPositions.every(
      (position) => state.board[position.row]![position.col] === player
    );

    if (!hasFilledTargetArea) {
      return;
    }

    state.gameOver = true;
    state.winner = player;
    state.lastAction = {
      action: 'win',
      player,
      details: `${player} wins by occupying the opposite home triangle.`,
    };
  }

  private moveToNextPlayer(state: ChineseCheckersState): void {
    const currentIndex = state.players.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.players.length;
    state.currentPlayer = state.players[nextIndex]!;
  }

  private getPositionKey(position: Position): string {
    return `${position.row},${position.col}`;
  }

  async getGameState(): Promise<ChineseCheckersState> {
    const state = this.currentState as ChineseCheckersState;

    return {
      gameId: this.gameId,
      gameType: state.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      board: state.board,
      players: state.players,
      startingPositions: state.startingPositions,
      targetPositions: state.targetPositions,
      lastAction: state.lastAction,
      moveCount: state.moveCount,
      validPositions: Array.from(this.VALID_POSITIONS),
      boardDimensions: {
        rows: this.BOARD_HEIGHT,
        cols: this.BOARD_WIDTH,
      },
    };
  }

  async isGameOver(): Promise<boolean> {
    return (this.currentState as ChineseCheckersState).gameOver;
  }

  async getWinner(): Promise<string | null> {
    return (this.currentState as ChineseCheckersState).winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Chinese Checkers',
      description:
        'Strategic star-board race game with official home triangles, adjacent steps, and chained jumps',
      minPlayers: 2,
      maxPlayers: 6,
      estimatedDuration: '30-60 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'board', 'jumping', 'classic'],
    };
  }
}

export function createChineseCheckersGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): ChineseCheckersGame {
  return new ChineseCheckersGame(gameId, database);
}

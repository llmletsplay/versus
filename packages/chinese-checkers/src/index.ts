import { InMemoryDatabaseProvider } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';

type Player = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';

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

export class ChineseCheckersGame extends BaseGame {
  private readonly BOARD_SIZE = 17;
  private readonly VALID_POSITIONS: Set<string> = new Set();
  private readonly STEP_DIRECTIONS: Position[] = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ];

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'chinese-checkers', database);
    this.initializeValidPositions();
  }

  private initializeValidPositions(): void {
    for (let row = 6; row <= 10; row++) {
      for (let col = 6; col <= 10; col++) {
        if (this.isValidCenterPosition(row, col)) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }

    for (let row = 0; row < 6; row++) {
      for (let col = 6 + row; col <= 10 - row; col++) {
        this.VALID_POSITIONS.add(`${row},${col}`);
      }
    }

    for (let row = 11; row < 17; row++) {
      const offset = row - 10;
      for (let col = 6 + offset; col <= 10 - offset; col++) {
        this.VALID_POSITIONS.add(`${row},${col}`);
      }
    }

    for (let row = 6; row <= 10; row++) {
      for (let col = 0; col < 6; col++) {
        if (this.isValidSidePosition(row, col, 'left')) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }

    for (let row = 6; row <= 10; row++) {
      for (let col = 11; col < 17; col++) {
        if (this.isValidSidePosition(row, col, 'right')) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }
  }

  private isValidCenterPosition(row: number, col: number): boolean {
    const centerRow = 8;
    const centerCol = 8;
    const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    return distance <= 2;
  }

  private isValidSidePosition(row: number, col: number, side: 'left' | 'right'): boolean {
    if (side === 'left') {
      return col <= 5 - Math.abs(row - 8);
    }
    return col >= 11 + Math.abs(row - 8);
  }

  private isValidPosition(pos: Position): boolean {
    return this.VALID_POSITIONS.has(`${pos.row},${pos.col}`);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 6);
    const availablePlayers: Player[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];
    const players = availablePlayers.slice(0, playerCount);

    const board: (Player | null)[][] = Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));

    const startingPositions: { [player in Player]?: Position[] } = {};
    const targetPositions: { [player in Player]?: Position[] } = {};

    this.setupPlayerPositions(players, board, startingPositions, targetPositions);

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

  private setupPlayerPositions(
    players: Player[],
    board: (Player | null)[][],
    startingPositions: { [player in Player]?: Position[] },
    targetPositions: { [player in Player]?: Position[] }
  ): void {
    const playerSetups: { [player in Player]?: { start: Position[]; target: Position[] } } = {
      red: {
        start: [
          { row: 0, col: 8 },
          { row: 1, col: 7 },
          { row: 1, col: 8 },
          { row: 1, col: 9 },
          { row: 2, col: 6 },
          { row: 2, col: 7 },
          { row: 2, col: 8 },
          { row: 2, col: 9 },
          { row: 2, col: 10 },
          { row: 3, col: 7 },
          { row: 3, col: 8 },
          { row: 3, col: 9 },
        ],
        target: [
          { row: 16, col: 8 },
          { row: 15, col: 7 },
          { row: 15, col: 8 },
          { row: 15, col: 9 },
          { row: 14, col: 6 },
          { row: 14, col: 7 },
          { row: 14, col: 8 },
          { row: 14, col: 9 },
          { row: 14, col: 10 },
          { row: 13, col: 7 },
          { row: 13, col: 8 },
          { row: 13, col: 9 },
        ],
      },
      blue: {
        start: [
          { row: 16, col: 8 },
          { row: 15, col: 7 },
          { row: 15, col: 8 },
          { row: 15, col: 9 },
          { row: 14, col: 6 },
          { row: 14, col: 7 },
          { row: 14, col: 8 },
          { row: 14, col: 9 },
          { row: 14, col: 10 },
          { row: 13, col: 7 },
          { row: 13, col: 8 },
          { row: 13, col: 9 },
        ],
        target: [
          { row: 0, col: 8 },
          { row: 1, col: 7 },
          { row: 1, col: 8 },
          { row: 1, col: 9 },
          { row: 2, col: 6 },
          { row: 2, col: 7 },
          { row: 2, col: 8 },
          { row: 2, col: 9 },
          { row: 2, col: 10 },
          { row: 3, col: 7 },
          { row: 3, col: 8 },
          { row: 3, col: 9 },
        ],
      },
    };

    for (const player of players) {
      const setup = playerSetups[player];
      if (!setup) {
        continue;
      }

      startingPositions[player] = setup.start;
      targetPositions[player] = setup.target;

      for (const pos of setup.start) {
        if (this.isValidPosition(pos)) {
          board[pos.row]![pos.col] = player;
        }
      }
    }
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
    const { from, to } = move;

    if (this.isAdjacentMove(from, to)) {
      return { valid: true };
    }

    if (this.canReachByJumpSequence(from, to, state)) {
      return { valid: true };
    }

    const isDirectJumpAttempt = this.STEP_DIRECTIONS.some(
      (direction) =>
        from.row + direction.row * 2 === to.row && from.col + direction.col * 2 === to.col
    );

    if (isDirectJumpAttempt) {
      const midRow = Math.floor((from.row + to.row) / 2);
      const midCol = Math.floor((from.col + to.col) / 2);
      if (state.board[midRow]![midCol] === null) {
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
    const visited = new Set([`${from.row},${from.col}`]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const destinations = this.getJumpDestinations(current, state);

      for (const destination of destinations) {
        const key = `${destination.row},${destination.col}`;
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
      const middle = { row: from.row + direction.row, col: from.col + direction.col };
      const landing = { row: from.row + direction.row * 2, col: from.col + direction.col * 2 };

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
    const checkersMove = move.moveData as ChineseCheckersMove;
    const state = this.currentState as ChineseCheckersState;

    this.movePiece(checkersMove, state);
    this.checkWinCondition(state);

    if (!state.gameOver) {
      this.moveToNextPlayer(state);
    }
  }

  private movePiece(move: ChineseCheckersMove, state: ChineseCheckersState): void {
    const { player, from, to } = move;

    state.board[from.row]![from.col] = null;
    state.board[to.row]![to.col] = player;
    state.moveCount++;

    state.lastAction = {
      action: 'move',
      player,
      from,
      to,
      details: `${player} moved from (${from.row},${from.col}) to (${to.row},${to.col})`,
    };
  }

  private checkWinCondition(state: ChineseCheckersState): void {
    const targetPositions = state.targetPositions[state.currentPlayer];
    if (!targetPositions) {
      return;
    }

    let piecesInTarget = 0;
    for (const pos of targetPositions) {
      if (state.board[pos.row]![pos.col] === state.currentPlayer) {
        piecesInTarget++;
      }
    }

    const startingPositions = state.startingPositions[state.currentPlayer];
    const totalPieces = startingPositions?.length || 0;

    if (piecesInTarget === totalPieces) {
      state.gameOver = true;
      state.winner = state.currentPlayer;
      state.lastAction = {
        action: 'win',
        player: state.currentPlayer,
        details: `${state.currentPlayer} wins by getting all pieces to the target area!`,
      };
    }
  }

  private moveToNextPlayer(state: ChineseCheckersState): void {
    const currentIndex = state.players.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.players.length;
    state.currentPlayer = state.players[nextIndex]!;
  }

  async getGameState(): Promise<GameState> {
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
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as ChineseCheckersState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as ChineseCheckersState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Chinese Checkers',
      description: 'Strategic board game played on a star-shaped board with jumping mechanics',
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
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): ChineseCheckersGame {
  return new ChineseCheckersGame(gameId, database);
}

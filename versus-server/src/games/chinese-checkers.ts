/* eslint-disable no-unused-vars */
import { DatabaseProvider } from '../core/database.js';
import { BaseGame } from '../core/base-game.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Player = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';

interface Position {
  row: number;
  col: number;
}

interface ChineseCheckersState extends GameState {
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
  private readonly BOARD_SIZE = 17; // Star-shaped board fits in 17x17 grid

  // Define the star-shaped board layout
  private readonly VALID_POSITIONS: Set<string> = new Set();

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'chinese-checkers', database);
    this.initializeValidPositions();
  }

  private initializeValidPositions(): void {
    // Define the star-shaped board positions
    // This is a simplified representation - real Chinese Checkers has a more complex star shape

    // Center hexagon
    for (let row = 6; row <= 10; row++) {
      for (let col = 6; col <= 10; col++) {
        if (this.isValidCenterPosition(row, col)) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }

    // Top triangle
    for (let row = 0; row < 6; row++) {
      for (let col = 6 + row; col <= 10 - row; col++) {
        this.VALID_POSITIONS.add(`${row},${col}`);
      }
    }

    // Bottom triangle
    for (let row = 11; row < 17; row++) {
      const offset = row - 10;
      for (let col = 6 + offset; col <= 10 - offset; col++) {
        this.VALID_POSITIONS.add(`${row},${col}`);
      }
    }

    // Left triangles
    for (let row = 6; row <= 10; row++) {
      for (let col = 0; col < 6; col++) {
        if (this.isValidSidePosition(row, col, 'left')) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }

    // Right triangles
    for (let row = 6; row <= 10; row++) {
      for (let col = 11; col < 17; col++) {
        if (this.isValidSidePosition(row, col, 'right')) {
          this.VALID_POSITIONS.add(`${row},${col}`);
        }
      }
    }
  }

  private isValidCenterPosition(row: number, col: number): boolean {
    // Simple diamond shape for center
    const centerRow = 8;
    const centerCol = 8;
    const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    return distance <= 2;
  }

  private isValidSidePosition(row: number, col: number, side: 'left' | 'right'): boolean {
    if (side === 'left') {
      return col <= 5 - Math.abs(row - 8);
    } else {
      return col >= 11 + Math.abs(row - 8);
    }
  }

  private isValidPosition(pos: Position): boolean {
    return this.VALID_POSITIONS.has(`${pos.row},${pos.col}`);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 6);
    const availablePlayers: Player[] = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];
    const players = availablePlayers.slice(0, playerCount);

    // Initialize empty board
    const board: (Player | null)[][] = Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));

    // Set up starting positions for each player
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
    // Simplified setup - place pieces in triangular formations
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
      // Add more players as needed
    };

    for (let i = 0; i < players.length; i++) {
      const player = players[i]!;
      const setup = playerSetups[player];

      if (setup) {
        startingPositions[player] = setup.start;
        targetPositions[player] = setup.target;

        // Place pieces on board
        for (const pos of setup.start) {
          if (this.isValidPosition(pos)) {
            board[pos.row]![pos.col] = player;
          }
        }
      }
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as ChineseCheckersMove;
      const state = this.currentState as ChineseCheckersState;

      // Validate required fields
      if (!move.player || !move.from || !move.to) {
        return { valid: false, error: 'Move must include player, from, and to positions' };
      }

      if (!state.players.includes(move.player)) {
        return { valid: false, error: 'Invalid player' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Check if it's the player's turn
      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Validate positions are on the board
      if (!this.isValidPosition(move.from) || !this.isValidPosition(move.to)) {
        return { valid: false, error: 'Invalid board positions' };
      }

      // Check if there's a piece at the from position
      if (state.board[move.from.row]![move.from.col] !== move.player) {
        return { valid: false, error: 'No piece of yours at the from position' };
      }

      // Check if the to position is empty
      if (state.board[move.to.row]![move.to.col] !== null) {
        return { valid: false, error: 'Destination position is occupied' };
      }

      // Validate the move (adjacent or jumping)
      const moveValidation = this.validateMovePattern(move, state);
      if (!moveValidation.valid) {
        return moveValidation;
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateMovePattern(
    move: ChineseCheckersMove,
    state: ChineseCheckersState
  ): MoveValidationResult {
    const { from, to } = move;
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // Adjacent move (one step)
    if (
      (rowDiff === 1 && colDiff === 0) ||
      (rowDiff === 0 && colDiff === 1) ||
      (rowDiff === 1 && colDiff === 1)
    ) {
      return { valid: true };
    }

    // Jumping move - must jump over exactly one piece
    if (rowDiff === 2 || colDiff === 2) {
      const midRow = Math.floor((from.row + to.row) / 2);
      const midCol = Math.floor((from.col + to.col) / 2);

      // Check if there's a piece to jump over
      if (state.board[midRow]![midCol] === null) {
        return { valid: false, error: 'No piece to jump over' };
      }

      return { valid: true };
    }

    // Multi-jump validation would be more complex
    return { valid: false, error: 'Invalid move pattern' };
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

    // Move the piece
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
    // Check if current player has all pieces in target area
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

    // Check if all pieces are in target (simplified - real game has more complex rules)
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
      gameType: this.gameType,
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

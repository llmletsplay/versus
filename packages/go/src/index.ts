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

type Player = 'black' | 'white';
type Cell = Player | null;
type Board = Cell[][];

export interface GoState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  capturedStones: {
    black: number;
    white: number;
  };
  passCount: number;
  koPosition: { row: number; col: number } | null;
  moveHistory: Array<{
    player: Player;
    row?: number;
    col?: number;
    action: 'place' | 'pass' | 'resign';
    capturedStones: number;
  }>;
  territory: {
    black: number;
    white: number;
    neutral: number;
  };
  gamePhase: 'playing' | 'scoring' | 'finished';
  handicap: number;
  komi: number; // Compensation points for white
}

interface GoMove {
  player: Player;
  row?: number;
  col?: number;
  action: 'place' | 'pass' | 'resign';
}

export class GoGame extends BaseGame {
  private readonly BOARD_SIZE = 19; // Standard Go board
  private readonly KOMI = 6.5; // Standard compensation for white

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'go', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const boardSize = (config as any)?.boardSize || this.BOARD_SIZE;
    const handicap = (config as any)?.handicap || 0;
    const komi = (config as any)?.komi || this.KOMI;

    const initialState: GoState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: Array(boardSize)
        .fill(null)
        .map(() => Array(boardSize).fill(null)),
      currentPlayer: handicap > 0 ? 'black' : 'black', // Black always starts
      gameOver: false,
      winner: null,
      capturedStones: {
        black: 0,
        white: 0,
      },
      passCount: 0,
      koPosition: null,
      moveHistory: [],
      territory: {
        black: 0,
        white: 0,
        neutral: 0,
      },
      gamePhase: 'playing',
      handicap,
      komi,
    };

    // Place handicap stones if applicable
    if (handicap > 0) {
      this.placeHandicapStones(initialState, handicap);
      initialState.currentPlayer = 'white'; // White plays first after handicap
    }

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private placeHandicapStones(state: GoState, handicap: number): void {
    const size = state.board.length;
    const handicapPositions = this.getHandicapPositions(size, handicap);

    for (const pos of handicapPositions) {
      if (state.board[pos.row] && state.board[pos.row]![pos.col] !== undefined) {
        state.board[pos.row]![pos.col] = 'black';
      }
    }
  }

  private getHandicapPositions(
    size: number,
    handicap: number
  ): Array<{ row: number; col: number }> {
    // Standard handicap positions for 19x19 board
    const edge = size >= 13 ? 3 : 2; // Distance from edge
    const center = Math.floor(size / 2);

    // Standard 9 handicap positions
    const standardPositions = [
      { row: edge, col: edge }, // Top-left
      { row: edge, col: size - 1 - edge }, // Top-right
      { row: size - 1 - edge, col: edge }, // Bottom-left
      { row: size - 1 - edge, col: size - 1 - edge }, // Bottom-right
      { row: edge, col: center }, // Top-center
      { row: size - 1 - edge, col: center }, // Bottom-center
      { row: center, col: edge }, // Left-center
      { row: center, col: size - 1 - edge }, // Right-center
      { row: center, col: center }, // Center
    ];

    return standardPositions.slice(0, Math.min(handicap, 9));
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as GoMove;
      const state = this.currentState as GoState;

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['black', 'white'].includes(move.player)) {
        return { valid: false, error: 'Player must be black or white' };
      }

      if (!['place', 'pass', 'resign'].includes(move.action)) {
        return { valid: false, error: 'Action must be place, pass, or resign' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Check if it's the player's turn
      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Validate place action
      if (move.action === 'place') {
        if (typeof move.row !== 'number' || typeof move.col !== 'number') {
          return { valid: false, error: 'Row and col must be numbers for place action' };
        }

        // Check bounds
        if (
          move.row < 0 ||
          move.row >= state.board.length ||
          move.col < 0 ||
          move.col >= state.board[0]!.length
        ) {
          return { valid: false, error: 'Move coordinates out of bounds' };
        }

        // Check if position is empty
        if (state.board[move.row]?.[move.col] !== null) {
          return { valid: false, error: 'Position is already occupied' };
        }

        // Check ko rule
        if (
          state.koPosition &&
          move.row === state.koPosition.row &&
          move.col === state.koPosition.col
        ) {
          return { valid: false, error: 'Ko rule violation - cannot immediately recapture' };
        }

        // Check if move is suicide (not allowed unless it captures opponent stones)
        if (this.isSuicideMove(move, state)) {
          return { valid: false, error: 'Suicide move not allowed' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private isSuicideMove(move: GoMove, state: GoState): boolean {
    if (move.action !== 'place' || move.row === undefined || move.col === undefined) {
      return false;
    }

    // Create a copy of the board with the move applied
    const testBoard = state.board.map((row) => [...row]);
    if (testBoard[move.row] && testBoard[move.row]![move.col] !== undefined) {
      testBoard[move.row]![move.col] = move.player;
    }

    // Check if this move captures any opponent groups
    const opponent = move.player === 'black' ? 'white' : 'black';
    const neighbors = this.getNeighbors(move.row, move.col, testBoard);

    for (const neighbor of neighbors) {
      if (testBoard[neighbor.row]?.[neighbor.col] === opponent) {
        const group = this.getGroup(neighbor.row, neighbor.col, testBoard);
        if (this.getLiberties(group, testBoard).length === 0) {
          return false; // This move captures opponent stones, so it's not suicide
        }
      }
    }

    // Check if the placed stone's group has liberties
    const placedGroup = this.getGroup(move.row, move.col, testBoard);
    return this.getLiberties(placedGroup, testBoard).length === 0;
  }

  private getNeighbors(
    row: number,
    col: number,
    board: Board
  ): Array<{ row: number; col: number }> {
    const neighbors = [];
    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (const [dr, dc] of directions) {
      if (dr === undefined || dc === undefined) continue;
      const newRow = row + dr;
      const newCol = col + dc;

      if (newRow >= 0 && newRow < board.length && newCol >= 0 && newCol < board[0]!.length) {
        neighbors.push({ row: newRow, col: newCol });
      }
    }

    return neighbors;
  }

  private getGroup(row: number, col: number, board: Board): Array<{ row: number; col: number }> {
    const color = board[row]?.[col];
    if (!color) {
      return [];
    }

    const group = [];
    const visited = new Set<string>();
    const stack = [{ row, col }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = `${current.row},${current.col}`;

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (board[current.row]?.[current.col] === color) {
        group.push(current);

        const neighbors = this.getNeighbors(current.row, current.col, board);
        for (const neighbor of neighbors) {
          const neighborKey = `${neighbor.row},${neighbor.col}`;
          if (!visited.has(neighborKey)) {
            stack.push(neighbor);
          }
        }
      }
    }

    return group;
  }

  private getLiberties(
    group: Array<{ row: number; col: number }>,
    board: Board
  ): Array<{ row: number; col: number }> {
    const liberties = new Set<string>();

    for (const stone of group) {
      const neighbors = this.getNeighbors(stone.row, stone.col, board);
      for (const neighbor of neighbors) {
        if (board[neighbor.row]?.[neighbor.col] === null) {
          liberties.add(`${neighbor.row},${neighbor.col}`);
        }
      }
    }

    return Array.from(liberties).map((key) => {
      const [row, col] = key.split(',').map(Number);
      return { row: row!, col: col! };
    });
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const goMove = move.moveData as GoMove;
    const state = this.currentState as GoState;

    let capturedStones = 0;

    if (goMove.action === 'place' && goMove.row !== undefined && goMove.col !== undefined) {
      // Place the stone
      if (state.board[goMove.row]) {
        state.board[goMove.row]![goMove.col] = goMove.player;
      }

      // Check for captures
      capturedStones = this.processCapturesAt(goMove.row, goMove.col, state);

      // Update ko position
      state.koPosition = this.getKoPosition(goMove, state, capturedStones);

      state.passCount = 0; // Reset pass count
    } else if (goMove.action === 'pass') {
      state.passCount++;
      state.koPosition = null; // Clear ko position on pass
    } else if (goMove.action === 'resign') {
      state.gameOver = true;
      state.winner = goMove.player === 'black' ? 'white' : 'black';
      state.gamePhase = 'finished';
    }

    // Add to move history
    state.moveHistory.push({
      player: goMove.player,
      row: goMove.row,
      col: goMove.col,
      action: goMove.action,
      capturedStones,
    });

    // Check for game end (two consecutive passes)
    if (state.passCount >= 2) {
      state.gamePhase = 'scoring';
      this.calculateTerritory(state);
      this.determineWinner(state);
    }

    // Switch players
    if (!state.gameOver) {
      state.currentPlayer = state.currentPlayer === 'black' ? 'white' : 'black';
    }
  }

  private processCapturesAt(row: number, col: number, state: GoState): number {
    const opponent = state.currentPlayer === 'black' ? 'white' : 'black';
    const neighbors = this.getNeighbors(row, col, state.board);
    let totalCaptured = 0;

    // Check each neighboring opponent group for capture
    for (const neighbor of neighbors) {
      if (state.board[neighbor.row]?.[neighbor.col] === opponent) {
        const group = this.getGroup(neighbor.row, neighbor.col, state.board);
        const liberties = this.getLiberties(group, state.board);

        if (liberties.length === 0) {
          // Capture this group
          for (const stone of group) {
            if (state.board[stone.row]) {
              state.board[stone.row]![stone.col] = null;
            }
            totalCaptured++;
          }
        }
      }
    }

    // Update captured stone count
    if (opponent === 'black') {
      state.capturedStones.black += totalCaptured;
    } else {
      state.capturedStones.white += totalCaptured;
    }

    return totalCaptured;
  }

  private getKoPosition(
    move: GoMove,
    state: GoState,
    capturedStones: number
  ): { row: number; col: number } | null {
    // Ko rule only applies if exactly one stone was captured
    if (capturedStones !== 1 || move.row === undefined || move.col === undefined) {
      return null;
    }

    // Find the position where the stone was captured
    const neighbors = this.getNeighbors(move.row, move.col, state.board);
    for (const neighbor of neighbors) {
      if (state.board[neighbor.row]?.[neighbor.col] === null) {
        // This could be the ko position
        // Additional validation would be needed for a complete implementation
        return neighbor;
      }
    }

    return null;
  }

  private calculateTerritory(state: GoState): void {
    const board = state.board;
    const visited = new Set<string>();
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let neutralTerritory = 0;

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row]!.length; col++) {
        const key = `${row},${col}`;

        if (!visited.has(key) && board[row]![col] === null) {
          const territory = this.getTerritory(row, col, board, visited);
          const owner = this.getTerritoryOwner(territory, board);

          if (owner === 'black') {
            blackTerritory += territory.length;
          } else if (owner === 'white') {
            whiteTerritory += territory.length;
          } else {
            neutralTerritory += territory.length;
          }
        }
      }
    }

    state.territory = {
      black: blackTerritory,
      white: whiteTerritory,
      neutral: neutralTerritory,
    };
  }

  private getTerritory(
    row: number,
    col: number,
    board: Board,
    visited: Set<string>
  ): Array<{ row: number; col: number }> {
    const territory = [];
    const stack = [{ row, col }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const key = `${current.row},${current.col}`;

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (board[current.row]?.[current.col] === null) {
        territory.push(current);

        const neighbors = this.getNeighbors(current.row, current.col, board);
        for (const neighbor of neighbors) {
          const neighborKey = `${neighbor.row},${neighbor.col}`;
          if (!visited.has(neighborKey)) {
            stack.push(neighbor);
          }
        }
      }
    }

    return territory;
  }

  private getTerritoryOwner(
    territory: Array<{ row: number; col: number }>,
    board: Board
  ): Player | null {
    const surroundingColors = new Set<Player>();

    for (const point of territory) {
      const neighbors = this.getNeighbors(point.row, point.col, board);
      for (const neighbor of neighbors) {
        const color = board[neighbor.row]?.[neighbor.col];
        if (color) {
          surroundingColors.add(color);
        }
      }
    }

    // Territory belongs to a player only if surrounded by stones of one color
    if (surroundingColors.size === 1) {
      return Array.from(surroundingColors)[0]!;
    }

    return null; // Neutral territory
  }

  private determineWinner(state: GoState): void {
    const blackScore = state.territory.black + state.capturedStones.white;
    const whiteScore = state.territory.white + state.capturedStones.black + state.komi;

    if (blackScore > whiteScore) {
      state.winner = 'black';
    } else if (whiteScore > blackScore) {
      state.winner = 'white';
    } else {
      state.winner = 'draw';
    }

    state.gameOver = true;
    state.gamePhase = 'finished';
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as GoState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      board: state.board,
      capturedStones: state.capturedStones,
      passCount: state.passCount,
      moveHistory: state.moveHistory,
      territory: state.territory,
      gamePhase: state.gamePhase,
      handicap: state.handicap,
      komi: state.komi,
      koPosition: state.koPosition,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as GoState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as GoState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Go',
      description: 'Ancient strategy game of territorial control using black and white stones',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '30-120 minutes',
      complexity: 'advanced',
      categories: ['strategy', 'abstract', 'territory', 'classic'],
    };
  }
}

export function createGoGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): GoGame {
  return new GoGame(gameId, database);
}


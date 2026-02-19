import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Player = 'player1' | 'player2';
type CellState = 'empty' | 'ship' | 'hit' | 'miss';
type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

interface Ship {
  type: ShipType;
  length: number;
  positions: Array<{ row: number; col: number }>;
  hits: number;
  sunk: boolean;
}

interface Board {
  cells: CellState[][];
  ships: Ship[];
}

interface BattleshipState extends GameState {
  boards: Record<Player, Board>;
  currentPlayer: Player;
  phase: 'setup' | 'play' | 'end';
  gameOver: boolean;
  winner: Player | null;
  setupComplete: Record<Player, boolean>;
}

const SHIP_CONFIGS: Record<ShipType, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export class BattleshipGame extends BaseGame {
  private readonly BOARD_SIZE = 10;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'battleship', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialState: BattleshipState = {
      gameId: this.gameId,
      gameType: this.gameType,
      boards: {
        player1: this.createEmptyBoard(),
        player2: this.createEmptyBoard(),
      },
      currentPlayer: 'player1',
      phase: 'setup',
      gameOver: false,
      winner: null,
      setupComplete: {
        player1: false,
        player2: false,
      },
    };

    // Auto-place ships for both players for simplicity
    this.autoPlaceShips(initialState.boards.player1);
    this.autoPlaceShips(initialState.boards.player2);

    initialState.setupComplete.player1 = true;
    initialState.setupComplete.player2 = true;
    initialState.phase = 'play';

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createEmptyBoard(): Board {
    return {
      cells: Array(this.BOARD_SIZE)
        .fill(null)
        .map(() => Array(this.BOARD_SIZE).fill('empty')),
      ships: [],
    };
  }

  private autoPlaceShips(board: Board): void {
    const shipTypes = Object.keys(SHIP_CONFIGS) as ShipType[];

    for (const shipType of shipTypes) {
      const length = SHIP_CONFIGS[shipType];
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 100) {
        const horizontal = Math.random() < 0.5;
        const startRow = Math.floor(Math.random() * this.BOARD_SIZE);
        const startCol = Math.floor(Math.random() * this.BOARD_SIZE);

        if (this.canPlaceShip(board, startRow, startCol, length, horizontal)) {
          this.placeShip(board, shipType, startRow, startCol, length, horizontal);
          placed = true;
        }
        attempts++;
      }
    }
  }

  private canPlaceShip(
    board: Board,
    row: number,
    col: number,
    length: number,
    horizontal: boolean
  ): boolean {
    if (horizontal) {
      if (col + length > this.BOARD_SIZE) {
        return false;
      }
      for (let i = 0; i < length; i++) {
        if (board.cells[row]?.[col + i] !== 'empty') {
          return false;
        }
      }
    } else {
      if (row + length > this.BOARD_SIZE) {
        return false;
      }
      for (let i = 0; i < length; i++) {
        if (board.cells[row + i]?.[col] !== 'empty') {
          return false;
        }
      }
    }
    return true;
  }

  private placeShip(
    board: Board,
    type: ShipType,
    row: number,
    col: number,
    length: number,
    horizontal: boolean
  ): void {
    const positions: Array<{ row: number; col: number }> = [];

    for (let i = 0; i < length; i++) {
      const shipRow = horizontal ? row : row + i;
      const shipCol = horizontal ? col + i : col;

      if (board.cells[shipRow]) {
        board.cells[shipRow]![shipCol] = 'ship';
      }
      positions.push({ row: shipRow, col: shipCol });
    }

    board.ships.push({
      type,
      length,
      positions,
      hits: 0,
      sunk: false,
    });
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const { row, col, player } = moveData;

      // Validate required fields
      if (typeof row !== 'number' || typeof col !== 'number') {
        return { valid: false, error: 'Row and col must be numbers' };
      }

      if (typeof player !== 'string' || !['player1', 'player2'].includes(player)) {
        return { valid: false, error: 'Player must be player1 or player2' };
      }

      // Check bounds
      if (row < 0 || row >= this.BOARD_SIZE || col < 0 || col >= this.BOARD_SIZE) {
        return { valid: false, error: `Row and col must be between 0 and ${this.BOARD_SIZE - 1}` };
      }

      const state = this.currentState as BattleshipState;

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Check if it's the player's turn
      if (player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Check if position has already been shot
      const opponentBoard = state.boards[player === 'player1' ? 'player2' : 'player1'];
      const cellState = opponentBoard.cells[row]?.[col];
      if (cellState === 'hit' || cellState === 'miss') {
        return { valid: false, error: 'Position already shot' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { row, col, player } = move.moveData;
    const state = this.currentState as BattleshipState;

    // Determine which board to shoot at (opponent's board)
    const opponent = player === 'player1' ? 'player2' : 'player1';
    const targetBoard = state.boards[opponent];

    const cellState = targetBoard.cells[row]?.[col];

    if (cellState === 'ship') {
      // Hit!
      if (targetBoard.cells[row]) {
        targetBoard.cells[row]![col] = 'hit';
      }

      // Find the ship that was hit and update it
      const hitShip = targetBoard.ships.find((ship) =>
        ship.positions.some((pos) => pos.row === row && pos.col === col)
      );

      if (hitShip) {
        hitShip.hits++;
        if (hitShip.hits >= hitShip.length) {
          hitShip.sunk = true;
        }
      }

      // Check if all ships are sunk (game over)
      const allShipsSunk = targetBoard.ships.every((ship) => ship.sunk);
      if (allShipsSunk) {
        state.gameOver = true;
        state.winner = player as Player;
        state.phase = 'end';
      }

      // Player gets another turn after a hit
    } else {
      // Miss
      if (targetBoard.cells[row]) {
        targetBoard.cells[row]![col] = 'miss';
      }

      // Switch players
      state.currentPlayer = opponent;
    }

    this.currentState = state;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as BattleshipState;

    // Return public view (don't reveal ship positions)
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      phase: state.phase,
      gameOver: state.gameOver,
      winner: state.winner,
      boards: {
        player1: this.getPublicBoard(state.boards.player1),
        player2: this.getPublicBoard(state.boards.player2),
      },
    };
  }

  private getPublicBoard(board: Board) {
    return {
      cells: board.cells.map((row) => row.map((cell) => (cell === 'ship' ? 'empty' : cell))),
      ships: board.ships.map((ship) => ({
        type: ship.type,
        length: ship.length,
        hits: ship.hits,
        sunk: ship.sunk,
        // Don't reveal positions unless sunk
        positions: ship.sunk ? ship.positions : [],
      })),
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as BattleshipState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as BattleshipState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Battleship',
      description:
        "Naval strategy game where players try to sink each other's ships by guessing coordinates",
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '10-20 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'classic', 'guessing'],
    };
  }
}

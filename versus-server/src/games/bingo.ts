import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

interface BingoCell {
  value: string | number;
  marked: boolean;
  isCenter?: boolean;
}

interface BingoCard {
  cells: BingoCell[][];
  playerId: string;
}

interface BingoState extends GameState {
  cards: { [playerId: string]: BingoCard };
  calledNumbers: (string | number)[];
  currentCall: string | number | null;
  gameOver: boolean;
  winners: string[];
  playerOrder: string[];
  gamePhase: 'waiting' | 'playing' | 'finished';
  winningPatterns: string[];
  customCriteria: BingoCriteria[];
  lastAction: {
    action: string;
    details?: string;
    call?: string | number;
  } | null;
  callHistory: Array<{
    value: string | number;
    timestamp: number;
  }>;
  winConditions: WinCondition[];
}

interface BingoCriteria {
  id: string;
  description: string;
  values: (string | number)[];
  category?: string;
}

interface WinCondition {
  name: string;
  pattern: number[][]; // Array of [row, col] positions that must be marked
  description: string;
}

interface BingoMove {
  player: string;
  action: 'call' | 'mark' | 'claim_bingo' | 'start_game';
  value?: string | number;
  position?: { row: number; col: number };
}

export class BingoGame extends BaseGame {
  private readonly CARD_SIZE = 5;

  // Default number ranges for traditional Bingo
  private readonly DEFAULT_CRITERIA: BingoCriteria[] = [
    {
      id: 'B',
      description: 'B Column (1-15)',
      values: Array.from({ length: 15 }, (_, i) => i + 1),
      category: 'B',
    },
    {
      id: 'I',
      description: 'I Column (16-30)',
      values: Array.from({ length: 15 }, (_, i) => i + 16),
      category: 'I',
    },
    {
      id: 'N',
      description: 'N Column (31-45)',
      values: Array.from({ length: 15 }, (_, i) => i + 31),
      category: 'N',
    },
    {
      id: 'G',
      description: 'G Column (46-60)',
      values: Array.from({ length: 15 }, (_, i) => i + 46),
      category: 'G',
    },
    {
      id: 'O',
      description: 'O Column (61-75)',
      values: Array.from({ length: 15 }, (_, i) => i + 61),
      category: 'O',
    },
  ];

  // Standard winning patterns
  private readonly DEFAULT_WIN_CONDITIONS: WinCondition[] = [
    {
      name: 'Top Row',
      pattern: [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
      ],
      description: 'Complete the top row',
    },
    {
      name: 'Middle Row',
      pattern: [
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
        [1, 4],
      ],
      description: 'Complete the middle row',
    },
    {
      name: 'Bottom Row',
      pattern: [
        [2, 0],
        [2, 1],
        [2, 2],
        [2, 3],
        [2, 4],
      ],
      description: 'Complete the bottom row',
    },
    {
      name: 'Fourth Row',
      pattern: [
        [3, 0],
        [3, 1],
        [3, 2],
        [3, 3],
        [3, 4],
      ],
      description: 'Complete the fourth row',
    },
    {
      name: 'Fifth Row',
      pattern: [
        [4, 0],
        [4, 1],
        [4, 2],
        [4, 3],
        [4, 4],
      ],
      description: 'Complete the fifth row',
    },
    {
      name: 'First Column',
      pattern: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
      description: 'Complete the first column',
    },
    {
      name: 'Second Column',
      pattern: [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
      ],
      description: 'Complete the second column',
    },
    {
      name: 'Third Column',
      pattern: [
        [0, 2],
        [1, 2],
        [2, 2],
        [3, 2],
        [4, 2],
      ],
      description: 'Complete the third column',
    },
    {
      name: 'Fourth Column',
      pattern: [
        [0, 3],
        [1, 3],
        [2, 3],
        [3, 3],
        [4, 3],
      ],
      description: 'Complete the fourth column',
    },
    {
      name: 'Fifth Column',
      pattern: [
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [4, 4],
      ],
      description: 'Complete the fifth column',
    },
    {
      name: 'Main Diagonal',
      pattern: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ],
      description: 'Complete the main diagonal',
    },
    {
      name: 'Anti Diagonal',
      pattern: [
        [0, 4],
        [1, 3],
        [2, 2],
        [3, 1],
        [4, 0],
      ],
      description: 'Complete the anti-diagonal',
    },
    {
      name: 'Four Corners',
      pattern: [
        [0, 0],
        [0, 4],
        [4, 0],
        [4, 4],
      ],
      description: 'Mark all four corners',
    },
    {
      name: 'Full Card',
      pattern: Array.from({ length: 25 }, (_, i) => [Math.floor(i / 5), i % 5]),
      description: 'Mark all spaces on the card',
    },
  ];

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'bingo', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 20);
    const customCriteria = (config as any)?.customCriteria as BingoCriteria[] | undefined;
    const customWinConditions = (config as any)?.winConditions as WinCondition[] | undefined;

    const criteria = customCriteria || this.DEFAULT_CRITERIA;
    const winConditions = customWinConditions || this.DEFAULT_WIN_CONDITIONS.slice(0, 13); // Standard patterns

    // Create players
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);
    const cards: { [playerId: string]: BingoCard } = {};

    // Generate cards for each player
    for (const playerId of playerIds) {
      cards[playerId] = this.generateBingoCard(playerId, criteria);
    }

    const initialState: BingoState = {
      gameId: this.gameId,
      gameType: this.gameType,
      cards,
      calledNumbers: [],
      currentCall: null,
      gameOver: false,
      winners: [],
      playerOrder: playerIds,
      gamePhase: 'waiting',
      winningPatterns: [],
      customCriteria: criteria,
      lastAction: null,
      callHistory: [],
      winConditions,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private generateBingoCard(playerId: string, criteria: BingoCriteria[]): BingoCard {
    const card: BingoCell[][] = [];

    for (let row = 0; row < this.CARD_SIZE; row++) {
      card[row] = [];
      for (let col = 0; col < this.CARD_SIZE; col++) {
        // Use criteria for each column if available
        const columnCriteria = criteria[col] || criteria[0]!;
        const availableValues = [...columnCriteria.values];

        // Shuffle and pick a value
        const shuffledValues = this.shuffleArray(availableValues);
        const value = shuffledValues[0]!;

        const isCenter = row === 2 && col === 2;
        card[row]![col] = {
          value,
          marked: isCenter, // Center is typically free
          isCenter,
        };
      }
    }

    return {
      cells: card,
      playerId,
    };
  }

  protected shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as BingoMove;
      const state = this.currentState as BingoState;

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!state.cards[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      if (!['call', 'mark', 'claim_bingo', 'start_game'].includes(move.action)) {
        return { valid: false, error: 'Action must be call, mark, claim_bingo, or start_game' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Validate specific actions
      if (move.action === 'start_game') {
        if (state.gamePhase !== 'waiting') {
          return { valid: false, error: 'Game has already started' };
        }
      }

      if (move.action === 'call') {
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'Game is not in playing phase' };
        }

        if (move.value === undefined) {
          return { valid: false, error: 'Must provide value to call' };
        }

        if (state.calledNumbers.includes(move.value)) {
          return { valid: false, error: 'Value has already been called' };
        }

        // Check if value exists in any criteria
        const validValue = state.customCriteria.some((criteria) =>
          criteria.values.includes(move.value!)
        );

        if (!validValue) {
          return { valid: false, error: 'Invalid value for this game' };
        }
      }

      if (move.action === 'mark') {
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'Game is not in playing phase' };
        }

        if (
          !move.position ||
          typeof move.position.row !== 'number' ||
          typeof move.position.col !== 'number'
        ) {
          return { valid: false, error: 'Must provide valid position' };
        }

        if (
          move.position.row < 0 ||
          move.position.row >= this.CARD_SIZE ||
          move.position.col < 0 ||
          move.position.col >= this.CARD_SIZE
        ) {
          return { valid: false, error: 'Position out of bounds' };
        }

        const card = state.cards[move.player]!;
        const cell = card.cells[move.position.row]![move.position.col]!;

        if (cell.marked) {
          return { valid: false, error: 'Cell is already marked' };
        }

        // Check if the current call matches this cell
        if (state.currentCall !== cell.value) {
          return { valid: false, error: 'Can only mark cells that match the current call' };
        }
      }

      if (move.action === 'claim_bingo') {
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'Game is not in playing phase' };
        }

        // Validate that player actually has a winning pattern
        const hasWin = this.checkWinConditions(move.player, state);
        if (!hasWin.hasWin) {
          return { valid: false, error: 'No valid bingo pattern found' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const bingoMove = move.moveData as BingoMove;
    const state = this.currentState as BingoState;

    if (bingoMove.action === 'start_game') {
      this.startGame(state);
    } else if (bingoMove.action === 'call') {
      this.callNumber(bingoMove, state);
    } else if (bingoMove.action === 'mark') {
      this.markCell(bingoMove, state);
    } else if (bingoMove.action === 'claim_bingo') {
      this.claimBingo(bingoMove, state);
    }
  }

  private startGame(state: BingoState): void {
    state.gamePhase = 'playing';
    state.lastAction = {
      action: 'start_game',
      details: 'Game started! Waiting for first call.',
    };
  }

  private callNumber(move: BingoMove, state: BingoState): void {
    const value = move.value!;
    state.calledNumbers.push(value);
    state.currentCall = value;

    state.callHistory.push({
      value,
      timestamp: Date.now(),
    });

    state.lastAction = {
      action: 'call',
      call: value,
      details: `Called: ${value}`,
    };
  }

  private markCell(move: BingoMove, state: BingoState): void {
    const card = state.cards[move.player]!;
    const position = move.position!;

    card.cells[position.row]![position.col]!.marked = true;

    state.lastAction = {
      action: 'mark',
      details: `${move.player} marked ${state.currentCall} at (${position.row}, ${position.col})`,
    };
  }

  private claimBingo(move: BingoMove, state: BingoState): void {
    const winResult = this.checkWinConditions(move.player, state);

    if (winResult.hasWin) {
      if (!state.winners.includes(move.player)) {
        state.winners.push(move.player);
        state.winningPatterns.push(...winResult.patterns);
      }

      state.lastAction = {
        action: 'bingo',
        details: `${move.player} achieved BINGO with pattern(s): ${winResult.patterns.join(', ')}`,
      };

      // Check if game should end (can be configured to continue for multiple winners)
      state.gameOver = true;
      state.gamePhase = 'finished';
    }
  }

  private checkWinConditions(
    playerId: string,
    state: BingoState
  ): { hasWin: boolean; patterns: string[] } {
    const card = state.cards[playerId]!;
    const patterns: string[] = [];

    for (const condition of state.winConditions) {
      const isComplete = condition.pattern.every(([row, col]) => {
        if (typeof row !== 'number' || typeof col !== 'number') return false;
        return card.cells[row]?.[col]?.marked === true;
      });

      if (isComplete) {
        patterns.push(condition.name);
      }
    }

    return {
      hasWin: patterns.length > 0,
      patterns,
    };
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as BingoState;

    // Create sanitized cards (hide other players' exact values but show marked status)
    const sanitizedCards: any = {};
    for (const [playerId, card] of Object.entries(state.cards)) {
      sanitizedCards[playerId] = {
        cells: card.cells.map((row) =>
          row.map((cell) => ({
            value: cell.value,
            marked: cell.marked,
            isCenter: cell.isCenter,
          }))
        ),
        playerId: card.playerId,
      };
    }

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: state.gameOver,
      winners: state.winners,
      cards: sanitizedCards,
      calledNumbers: state.calledNumbers,
      currentCall: state.currentCall,
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      winningPatterns: state.winningPatterns,
      lastAction: state.lastAction,
      callHistory: state.callHistory,
      winConditions: state.winConditions,
      customCriteria: state.customCriteria,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as BingoState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as BingoState;
    return state.winners.length > 0 ? state.winners[0]! : null;
  }

  async getWinners(): Promise<string[]> {
    const state = this.currentState as BingoState;
    return state.winners;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Bingo',
      description: 'Classic number-calling game with customizable criteria and winning patterns',
      minPlayers: 2,
      maxPlayers: 20,
      estimatedDuration: '15-45 minutes',
      complexity: 'beginner',
      categories: ['luck', 'classic', 'social', 'family'],
    };
  }
}

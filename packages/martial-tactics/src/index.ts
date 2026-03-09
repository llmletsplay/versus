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

type Player = 'red' | 'blue';
type PieceType = 'master' | 'student' | null;
type Cell = { player: Player; type: PieceType } | null;
type Board = Cell[][];

interface MovementCard {
  name: string;
  moves: Array<{ row: number; col: number }>;
  description: string;
}

export interface MartialTacticsState extends GameState {
  board: Board;
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | null;
  moveCount: number;
  playerCards: {
    red: MovementCard[];
    blue: MovementCard[];
  };
  neutralCard: MovementCard;
}

interface MartialTacticsMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  cardName: string;
  player: Player;
}

export class MartialTacticsGame extends BaseGame {
  private readonly BOARD_SIZE = 5;

  private readonly MOVEMENT_CARDS: MovementCard[] = [
    {
      name: 'Tiger',
      moves: [
        { row: -2, col: 0 },
        { row: 1, col: 0 },
      ],
      description: 'Move 2 forward or 1 backward',
    },
    {
      name: 'Dragon',
      moves: [
        { row: -1, col: -2 },
        { row: -1, col: 2 },
        { row: 1, col: -1 },
        { row: 1, col: 1 },
      ],
      description: 'Move like a dragon',
    },
    {
      name: 'Frog',
      moves: [
        { row: -1, col: -1 },
        { row: 0, col: -2 },
        { row: 1, col: 1 },
      ],
      description: 'Move like a frog',
    },
    {
      name: 'Rabbit',
      moves: [
        { row: -1, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: -1 },
      ],
      description: 'Move like a rabbit',
    },
    {
      name: 'Crab',
      moves: [
        { row: -1, col: 0 },
        { row: 0, col: -2 },
        { row: 0, col: 2 },
      ],
      description: 'Move like a crab',
    },
    {
      name: 'Elephant',
      moves: [
        { row: -1, col: -1 },
        { row: -1, col: 1 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
      ],
      description: 'Move like an elephant',
    },
    {
      name: 'Goose',
      moves: [
        { row: -1, col: -1 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
      ],
      description: 'Move like a goose',
    },
    {
      name: 'Rooster',
      moves: [
        { row: -1, col: 1 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
        { row: 1, col: -1 },
      ],
      description: 'Move like a rooster',
    },
    {
      name: 'Monkey',
      moves: [
        { row: -1, col: -1 },
        { row: -1, col: 1 },
        { row: 1, col: -1 },
        { row: 1, col: 1 },
      ],
      description: 'Move diagonally',
    },
    {
      name: 'Mantis',
      moves: [
        { row: -1, col: -1 },
        { row: -1, col: 1 },
        { row: 1, col: 0 },
      ],
      description: 'Move like a mantis',
    },
    {
      name: 'Horse',
      moves: [
        { row: -1, col: 0 },
        { row: 0, col: -1 },
        { row: 1, col: 0 },
      ],
      description: 'Move in a cross pattern',
    },
    {
      name: 'Ox',
      moves: [
        { row: -1, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ],
      description: 'Move in an ox pattern',
    },
    {
      name: 'Crane',
      moves: [
        { row: -1, col: 0 },
        { row: 1, col: -1 },
        { row: 1, col: 1 },
      ],
      description: 'Move like a crane',
    },
    {
      name: 'Boar',
      moves: [
        { row: -1, col: 0 },
        { row: 0, col: -1 },
        { row: 0, col: 1 },
      ],
      description: 'Move like a boar',
    },
    {
      name: 'Eel',
      moves: [
        { row: -1, col: -1 },
        { row: 0, col: 1 },
        { row: 1, col: -1 },
      ],
      description: 'Move like an eel',
    },
    {
      name: 'Cobra',
      moves: [
        { row: -1, col: 1 },
        { row: 0, col: -1 },
        { row: 1, col: 1 },
      ],
      description: 'Move like a cobra',
    },
  ];

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'martial-tactics', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialBoard = this.createInitialBoard();

    // Shuffle and deal cards
    const shuffledCards = [...this.MOVEMENT_CARDS].sort(() => Math.random() - 0.5);
    const redCards = shuffledCards.slice(0, 2);
    const blueCards = shuffledCards.slice(2, 4);
    const neutralCard = shuffledCards[4]!;

    const initialState: MartialTacticsState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: initialBoard,
      currentPlayer: 'red', // Red goes first
      gameOver: false,
      winner: null,
      moveCount: 0,
      playerCards: {
        red: redCards,
        blue: blueCards,
      },
      neutralCard,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): Board {
    const board: Board = Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));

    // Place red pieces (bottom)
    board[4]![0] = { player: 'red', type: 'student' };
    board[4]![1] = { player: 'red', type: 'student' };
    board[4]![2] = { player: 'red', type: 'master' };
    board[4]![3] = { player: 'red', type: 'student' };
    board[4]![4] = { player: 'red', type: 'student' };

    // Place blue pieces (top)
    board[0]![0] = { player: 'blue', type: 'student' };
    board[0]![1] = { player: 'blue', type: 'student' };
    board[0]![2] = { player: 'blue', type: 'master' };
    board[0]![3] = { player: 'blue', type: 'student' };
    board[0]![4] = { player: 'blue', type: 'student' };

    return board;
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as MartialTacticsMove;

      if (!move.from || !move.to || !move.cardName || !move.player) {
        return { valid: false, error: 'Move must include from, to, cardName, and player' };
      }

      if (
        typeof move.from.row !== 'number' ||
        typeof move.from.col !== 'number' ||
        typeof move.to.row !== 'number' ||
        typeof move.to.col !== 'number'
      ) {
        return { valid: false, error: 'From and to positions must have row and col numbers' };
      }

      if (!['red', 'blue'].includes(move.player)) {
        return { valid: false, error: 'Player must be red or blue' };
      }

      const state = this.currentState as MartialTacticsState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      // Check if player has the card
      const playerCards = state.playerCards[move.player];
      const card = playerCards.find((c) => c.name === move.cardName);
      if (!card) {
        return { valid: false, error: `Player doesn't have card: ${move.cardName}` };
      }

      // Check bounds
      if (!this.isValidPosition(move.from) || !this.isValidPosition(move.to)) {
        return { valid: false, error: 'Positions must be within board bounds' };
      }

      // Check if from position has player's piece
      const fromPiece = state.board[move.from.row]?.[move.from.col];
      if (!fromPiece || fromPiece.player !== move.player) {
        return { valid: false, error: 'No piece of yours at from position' };
      }

      // Check if destination has own piece first
      const toPiece = state.board[move.to.row]?.[move.to.col];
      if (toPiece && toPiece.player === move.player) {
        return { valid: false, error: 'Cannot capture your own piece' };
      }

      // Check if move is valid according to card
      const rowDiff = move.to.row - move.from.row;
      const colDiff = move.to.col - move.from.col;

      // For blue player, flip the card moves vertically
      const validMoves =
        move.player === 'blue' ? card.moves.map((m) => ({ row: -m.row, col: m.col })) : card.moves;

      const isValidCardMove = validMoves.some((m) => m.row === rowDiff && m.col === colDiff);
      if (!isValidCardMove) {
        return { valid: false, error: `Invalid move for card ${move.cardName}` };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private isValidPosition(pos: { row: number; col: number }): boolean {
    return pos.row >= 0 && pos.row < this.BOARD_SIZE && pos.col >= 0 && pos.col < this.BOARD_SIZE;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const martialMove = move.moveData as MartialTacticsMove;
    const state = this.currentState as MartialTacticsState;

    // Move the piece
    const piece = state.board[martialMove.from.row]![martialMove.from.col]!;
    state.board[martialMove.from.row]![martialMove.from.col] = null;
    state.board[martialMove.to.row]![martialMove.to.col] = piece;

    state.moveCount++;

    // Check for victory conditions
    const winner = this.checkWinner(state);
    if (winner) {
      state.gameOver = true;
      state.winner = winner;
    } else {
      // Exchange cards: used card goes to neutral, neutral goes to opponent
      const playerCards = state.playerCards[martialMove.player];
      const cardIndex = playerCards.findIndex((c) => c.name === martialMove.cardName);
      const usedCard = playerCards[cardIndex]!;

      playerCards[cardIndex] = state.neutralCard;
      state.neutralCard = usedCard;

      // Switch players
      state.currentPlayer = state.currentPlayer === 'red' ? 'blue' : 'red';
    }

    this.currentState = state;
  }

  private checkWinner(state: MartialTacticsState): Player | null {
    // Victory condition 1: Capture opponent's master
    let redHasMaster = false;
    let blueHasMaster = false;

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.type === 'master') {
          if (piece.player === 'red') {
            redHasMaster = true;
          }
          if (piece.player === 'blue') {
            blueHasMaster = true;
          }
        }
      }
    }

    if (!redHasMaster) {
      return 'blue';
    }
    if (!blueHasMaster) {
      return 'red';
    }

    // Victory condition 2: Move master to opponent's temple (middle of opposite end)
    const redMasterPos = this.findMaster(state, 'red');
    const blueMasterPos = this.findMaster(state, 'blue');

    if (redMasterPos && redMasterPos.row === 0 && redMasterPos.col === 2) {
      return 'red'; // Red master reached blue temple
    }

    if (blueMasterPos && blueMasterPos.row === 4 && blueMasterPos.col === 2) {
      return 'blue'; // Blue master reached red temple
    }

    return null;
  }

  private findMaster(
    state: MartialTacticsState,
    player: Player
  ): { row: number; col: number } | null {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.player === player && piece.type === 'master') {
          return { row, col };
        }
      }
    }
    return null;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as MartialTacticsState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      moveCount: state.moveCount,
      playerCards: state.playerCards,
      neutralCard: state.neutralCard,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as MartialTacticsState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as MartialTacticsState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Martial Tactics',
      description:
        'Strategic board game inspired by Onitama where players move pieces using animal movement cards',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '15-30 minutes',
      complexity: 'intermediate',
      categories: ['strategy', 'abstract', 'card-driven', 'martial arts'],
    };
  }
}

export function createMartialTacticsGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): MartialTacticsGame {
  return new MartialTacticsGame(gameId, database);
}


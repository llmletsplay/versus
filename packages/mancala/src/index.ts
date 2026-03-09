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

type Player = 'player1' | 'player2';

export interface MancalaState extends GameState {
  board: number[]; // 14 positions: [player1 pits (0-5), player1 store (6), player2 pits (7-12), player2 store (13)]
  currentPlayer: Player;
  gameOver: boolean;
  winner: Player | 'draw' | null;
}

interface MancalaMove {
  pit: number;
  player: Player;
}

const PITS_PER_PLAYER = 6;
const STONES_PER_PIT = 4;
const PLAYER1_STORE = 6;
const PLAYER2_STORE = 13;

export class MancalaGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'mancala', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const initialState: MancalaState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: this.createInitialBoard(),
      currentPlayer: 'player1',
      gameOver: false,
      winner: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): number[] {
    const board = new Array(14).fill(0);

    // Fill player1 pits (0-5) with 4 stones each
    for (let i = 0; i < PITS_PER_PLAYER; i++) {
      board[i] = STONES_PER_PIT;
    }

    // Fill player2 pits (7-12) with 4 stones each
    for (let i = 7; i < 7 + PITS_PER_PLAYER; i++) {
      board[i] = STONES_PER_PIT;
    }

    // Stores (6 and 13) remain 0
    return board;
  }

  private getPlayerPits(player: Player): number[] {
    if (player === 'player1') {
      return [0, 1, 2, 3, 4, 5];
    } else {
      return [7, 8, 9, 10, 11, 12];
    }
  }

  private getPlayerStore(player: Player): number {
    return player === 'player1' ? PLAYER1_STORE : PLAYER2_STORE;
  }

  private getOpponent(player: Player): Player {
    return player === 'player1' ? 'player2' : 'player1';
  }

  private getOppositePit(pit: number): number {
    // Opposite pits: 0<->12, 1<->11, 2<->10, 3<->9, 4<->8, 5<->7
    return 12 - pit;
  }

  private isPlayerPit(pit: number, player: Player): boolean {
    const playerPits = this.getPlayerPits(player);
    return playerPits.includes(pit);
  }

  private distributeStones(
    state: MancalaState,
    startPit: number
  ): { lastPit: number; extraTurn: boolean } {
    const board = [...state.board];
    let stones = board[startPit] || 0;
    board[startPit] = 0; // Empty the starting pit

    let currentPit = startPit;
    const currentPlayer = state.currentPlayer;
    const opponentStore = this.getPlayerStore(this.getOpponent(currentPlayer));

    // Distribute stones one by one
    while (stones > 0) {
      currentPit = (currentPit + 1) % 14;

      // Skip opponent's store
      if (currentPit === opponentStore) {
        currentPit = (currentPit + 1) % 14;
      }

      board[currentPit] = (board[currentPit] || 0) + 1;
      stones--;
    }

    state.board = board;

    // Check for extra turn (last stone lands in player's store)
    const playerStore = this.getPlayerStore(currentPlayer);
    const extraTurn = currentPit === playerStore;

    // Check for capture (last stone lands in empty pit on player's side)
    if (
      !extraTurn &&
      (board[currentPit] || 0) === 1 &&
      this.isPlayerPit(currentPit, currentPlayer)
    ) {
      const oppositePit = this.getOppositePit(currentPit);
      const capturedStones = board[oppositePit] || 0;

      if (capturedStones > 0) {
        // Capture stones from opposite pit and the stone just placed
        board[playerStore] = (board[playerStore] || 0) + capturedStones + 1;
        board[currentPit] = 0;
        board[oppositePit] = 0;
      }
    }

    return { lastPit: currentPit, extraTurn };
  }

  private checkGameOver(state: MancalaState): void {
    const player1Pits = this.getPlayerPits('player1');
    const player2Pits = this.getPlayerPits('player2');

    const player1HasStones = player1Pits.some((pit) => (state.board[pit] || 0) > 0);
    const player2HasStones = player2Pits.some((pit) => (state.board[pit] || 0) > 0);

    if (!player1HasStones || !player2HasStones) {
      // Game over - collect remaining stones
      let player1Remaining = 0;
      let player2Remaining = 0;

      for (const pit of player1Pits) {
        player1Remaining += state.board[pit] || 0;
        state.board[pit] = 0;
      }

      for (const pit of player2Pits) {
        player2Remaining += state.board[pit] || 0;
        state.board[pit] = 0;
      }

      state.board[PLAYER1_STORE] = (state.board[PLAYER1_STORE] || 0) + player1Remaining;
      state.board[PLAYER2_STORE] = (state.board[PLAYER2_STORE] || 0) + player2Remaining;

      // Determine winner
      const player1Score = state.board[PLAYER1_STORE] || 0;
      const player2Score = state.board[PLAYER2_STORE] || 0;

      if (player1Score > player2Score) {
        state.winner = 'player1';
      } else if (player2Score > player1Score) {
        state.winner = 'player2';
      } else {
        state.winner = 'draw';
      }

      state.gameOver = true;
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const { pit, player } = moveData;

      if (typeof pit !== 'number') {
        return { valid: false, error: 'Pit must be a number' };
      }

      if (typeof player !== 'string' || !['player1', 'player2'].includes(player)) {
        return { valid: false, error: 'Player must be "player1" or "player2"' };
      }

      const state = this.currentState as MancalaState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      const playerPits = this.getPlayerPits(player as Player);
      if (!playerPits.includes(pit)) {
        return { valid: false, error: 'Invalid pit for this player' };
      }

      if (state.board[pit] === 0) {
        return { valid: false, error: 'Cannot move from empty pit' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { pit } = move.moveData as MancalaMove;
    const state = this.currentState as MancalaState;

    // Distribute stones
    const { extraTurn } = this.distributeStones(state, pit);

    // Switch players unless extra turn
    if (!extraTurn) {
      state.currentPlayer = this.getOpponent(state.currentPlayer);
    }

    // Check for game over
    this.checkGameOver(state);

    this.currentState = state;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as MancalaState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      board: state.board,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      player1Score: state.board[PLAYER1_STORE],
      player2Score: state.board[PLAYER2_STORE],
      validMoves: this.getValidMoves(state),
    };
  }

  private getValidMoves(state: MancalaState): number[] {
    if (state.gameOver) {
      return [];
    }

    const playerPits = this.getPlayerPits(state.currentPlayer);
    return playerPits.filter((pit) => (state.board[pit] || 0) > 0);
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as MancalaState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as MancalaState;
    if (!state.gameOver) {
      return null;
    }
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Mancala',
      description:
        'Ancient strategy game where you collect stones by distributing them around the board',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '10-20 minutes',
      complexity: 'beginner',
      categories: ['strategy', 'board', 'classic', 'family'],
    };
  }
}

export function createMancalaGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): MancalaGame {
  return new MancalaGame(gameId, database);
}


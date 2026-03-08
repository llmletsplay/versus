import type { GameStateData } from '../core/database.js';

export interface GameMove {
  player: string;
  moveData: Record<string, any>;
  timestamp: number;
}

export interface GameHistory {
  moves: GameMove[];
  currentState: Record<string, any>;
}

export interface GameState {
  gameId: string;
  gameType: string;
  currentPlayer?: string;
  gameOver: boolean;
  winner?: string | null;
  [key: string]: any;
}

export interface MoveValidationResult {
  valid: boolean;
  error?: string;
}

export interface GameConfig {
  maxPlayers?: number;
  minPlayers?: number;
  playerCount?: number;
  timeLimit?: number;
  customRules?: Record<string, any>;
  [key: string]: any;
}

export interface GameMetadata {
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDuration: string;
  complexity: 'beginner' | 'intermediate' | 'advanced';
  categories: string[];
}

export abstract class AbstractGame<TState extends GameState = GameState> {
  protected gameId: string;
  protected gameType: string;
  protected history: GameMove[] = [];
  protected currentState: TState = {} as TState;
  protected stateHistory: TState[] = [];
  protected currentStateIndex: number = -1;

  constructor(gameId: string, gameType: string) {
    this.gameId = gameId;
    this.gameType = gameType;
  }

  abstract initializeGame(_config?: GameConfig): Promise<TState>;
  abstract validateMove(_moveData: Record<string, any>): Promise<MoveValidationResult>;
  abstract getGameState(): Promise<TState>;
  abstract isGameOver(): Promise<boolean>;
  abstract getWinner(): Promise<string | null>;
  abstract getMetadata(): GameMetadata;
  abstract restoreFromDatabase(_gameStateData: GameStateData): Promise<void>;

  // Note: makeMove is implemented in BaseGame - games should only implement applyMove
  // For backward compatibility, makeMove can still be overridden
  async makeMove(_moveData: Record<string, any>): Promise<TState> {
    // This will be overridden in BaseGame for the enhanced implementation
    throw new Error('makeMove must be implemented');
  }

  protected abstract applyMove(_move: GameMove): Promise<void>;
  protected abstract persistState(): Promise<void>;
  protected abstract loadState(): Promise<void>;

  getGameId(): string {
    return this.gameId;
  }

  getGameType(): string {
    return this.gameType;
  }

  getHistory(): GameMove[] {
    return [...this.history];
  }

  async addMove(move: GameMove): Promise<void> {
    this.history.push(move);
    // Save state snapshot for undo/redo
    await this.saveStateSnapshot();
    await this.persistState();
  }

  /**
   * Save current state to state history for undo/redo functionality
   */
  protected async saveStateSnapshot(): Promise<void> {
    const currentState = await this.getGameState();
    // Remove any future states if we're not at the end
    if (this.currentStateIndex < this.stateHistory.length - 1) {
      this.stateHistory = this.stateHistory.slice(0, this.currentStateIndex + 1);
    }

    this.stateHistory.push(JSON.parse(JSON.stringify(currentState)));
    this.currentStateIndex = this.stateHistory.length - 1;

    // Limit state history to prevent memory issues (keep last 100 states)
    if (this.stateHistory.length > 100) {
      this.stateHistory = this.stateHistory.slice(-100);
      this.currentStateIndex = this.stateHistory.length - 1;
    }
  }

  /**
   * Undo the last move (if possible)
   */
  async undoMove(): Promise<TState | null> {
    if (this.currentStateIndex <= 0 || this.stateHistory.length === 0) {
      return null; // Cannot undo further
    }

    this.currentStateIndex--;
    const previousState = this.stateHistory[this.currentStateIndex];

    // Restore the previous state
    this.currentState = JSON.parse(JSON.stringify(previousState)) as TState;

    // Remove the last move from history
    this.history.pop();

    await this.persistState();
    return await this.getGameState();
  }

  /**
   * Redo the next move (if possible)
   */
  async redoMove(): Promise<TState | null> {
    if (this.currentStateIndex >= this.stateHistory.length - 1) {
      return null; // Cannot redo further
    }

    this.currentStateIndex++;
    const nextState = this.stateHistory[this.currentStateIndex];

    // Restore the next state
    this.currentState = JSON.parse(JSON.stringify(nextState)) as TState;

    await this.persistState();
    return await this.getGameState();
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentStateIndex > 0 && this.stateHistory.length > 1;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentStateIndex < this.stateHistory.length - 1;
  }

  async restoreFromHistory(history: GameMove[]): Promise<void> {
    this.history = [...history];
    this.stateHistory = [];
    this.currentStateIndex = -1;

    // Replay all moves to restore state
    this.currentState = {} as TState;
    const initialState = await this.initializeGame();
    this.currentState = initialState;
    if (this.stateHistory.length === 0) {
      await this.saveStateSnapshot();
    }

    for (const move of this.history) {
      await this.applyMove(move);
      await this.saveStateSnapshot();
    }
  }
}





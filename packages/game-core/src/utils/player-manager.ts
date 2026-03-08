/**
 * Standardized Player Management Utilities
 * Provides consistent player ID patterns and management across all games
 */

export interface Player {
  id: string;
  name: string;
  type: 'human' | 'ai';
  order: number;
}

export interface PlayerConfig {
  playerIds?: string[];
  playerNames?: string[];
  playerTypes?: Array<'human' | 'ai'>;
  autoGenerate?: boolean;
  maxPlayers?: number;
  minPlayers?: number;
}

export class PlayerManager {
  private players: Player[] = [];
  private currentPlayerIndex: number = 0;

  constructor(config: PlayerConfig = {}) {
    this.initializePlayers(config);
  }

  private initializePlayers(config: PlayerConfig): void {
    const {
      playerIds = [],
      playerNames = [],
      playerTypes = [],
      autoGenerate = true,
      maxPlayers = 4,
      minPlayers = 2,
    } = config;

    // If no players provided and autoGenerate is true, create default players
    if (playerIds.length === 0 && autoGenerate) {
      const numPlayers = Math.max(minPlayers, 2);
      for (let i = 0; i < numPlayers; i++) {
        this.players.push({
          id: this.generateStandardPlayerId(i),
          name: playerNames[i] || this.generateStandardPlayerName(i),
          type: (playerTypes && playerTypes[i]) || 'human',
          order: i,
        });
      }
    } else {
      // Use provided player configuration
      for (let i = 0; i < playerIds.length; i++) {
        this.players.push({
          id: playerIds[i]!,
          name: playerNames?.[i] || playerIds[i]!,
          type: playerTypes?.[i] || 'human',
          order: i,
        });
      }
    }

    // Validate player count
    if (this.players.length < minPlayers) {
      throw new Error(`Game requires at least ${minPlayers} players, got ${this.players.length}`);
    }
    if (this.players.length > maxPlayers) {
      throw new Error(`Game supports at most ${maxPlayers} players, got ${this.players.length}`);
    }
  }

  /**
   * Generate standardized player IDs based on game type
   */
  private generateStandardPlayerId(index: number): string {
    // Use player1, player2, etc. as the standard format
    return `player${index + 1}`;
  }

  /**
   * Generate standardized player names
   */
  private generateStandardPlayerName(index: number): string {
    return `Player ${index + 1}`;
  }

  /**
   * Get all players
   */
  getPlayers(): Player[] {
    return [...this.players];
  }

  /**
   * Get player IDs in order
   */
  getPlayerIds(): string[] {
    return this.players.map((p) => p.id);
  }

  /**
   * Get current player
   */
  getCurrentPlayer(): Player {
    if (this.players.length === 0 || this.currentPlayerIndex < 0) {
      throw new Error('No players available');
    }
    return this.players[this.currentPlayerIndex]!;
  }

  /**
   * Get current player ID
   */
  getCurrentPlayerId(): string {
    return this.getCurrentPlayer().id;
  }

  /**
   * Advance to next player
   */
  nextPlayer(): Player {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    return this.getCurrentPlayer();
  }

  /**
   * Set current player by ID
   */
  setCurrentPlayer(playerId: string): boolean {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index === -1) {
      return false;
    }
    this.currentPlayerIndex = index;
    return true;
  }

  /**
   * Set current player by index
   */
  setCurrentPlayerIndex(index: number): boolean {
    if (index < 0 || index >= this.players.length) {
      return false;
    }
    this.currentPlayerIndex = index;
    return true;
  }

  /**
   * Get player by ID
   */
  getPlayer(playerId: string): Player | null {
    return this.players.find((p) => p.id === playerId) || null;
  }

  /**
   * Validate if player exists
   */
  isValidPlayer(playerId: string): boolean {
    return this.players.some((p) => p.id === playerId);
  }

  /**
   * Check if it's a specific player's turn
   */
  isPlayerTurn(playerId: string): boolean {
    return this.getCurrentPlayerId() === playerId;
  }

  /**
   * Get next player without advancing
   */
  peekNextPlayer(): Player {
    if (this.players.length === 0) {
      throw new Error('No players available');
    }
    const nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
    return this.players[nextIndex]!;
  }

  /**
   * Get player count
   */
  getPlayerCount(): number {
    return this.players.length;
  }

  /**
   * Reset to first player
   */
  reset(): void {
    this.currentPlayerIndex = 0;
  }

  /**
   * Convert to simple object for serialization
   */
  toJSON(): {
    players: Player[];
    currentPlayerIndex: number;
    currentPlayerId: string;
  } {
    return {
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.getCurrentPlayerId(),
    };
  }

  /**
   * Restore from serialized data
   */
  static fromJSON(data: { players: Player[]; currentPlayerIndex: number }): PlayerManager {
    const manager = new PlayerManager({ autoGenerate: false });
    manager.players = data.players;
    manager.currentPlayerIndex = data.currentPlayerIndex;
    return manager;
  }
}

/**
 * Static utility functions for common player patterns
 */
export class PlayerUtils {
  /**
   * Create standard two-player setup (player1 vs player2)
   */
  static createTwoPlayerSetup(player1Id?: string, player2Id?: string): PlayerManager {
    return new PlayerManager({
      playerIds: [player1Id || 'player1', player2Id || 'player2'],
      minPlayers: 2,
      maxPlayers: 2,
    });
  }

  /**
   * Create chess-style setup (white vs black)
   */
  static createChessSetup(): PlayerManager {
    return new PlayerManager({
      playerIds: ['white', 'black'],
      playerNames: ['White', 'Black'],
      minPlayers: 2,
      maxPlayers: 2,
    });
  }

  /**
   * Create card game setup (supports 2-4 players)
   */
  static createCardGameSetup(playerCount: number = 4): PlayerManager {
    const playerIds = [];
    const playerNames = [];

    for (let i = 0; i < playerCount; i++) {
      playerIds.push(`player${i + 1}`);
      playerNames.push(`Player ${i + 1}`);
    }

    return new PlayerManager({
      playerIds,
      playerNames,
      minPlayers: 2,
      maxPlayers: 4,
    });
  }

  /**
   * Create team-based setup
   */
  static createTeamSetup(teamA: string[], teamB: string[]): PlayerManager {
    const allPlayers = [...teamA, ...teamB];
    return new PlayerManager({
      playerIds: allPlayers,
      minPlayers: allPlayers.length,
      maxPlayers: allPlayers.length,
    });
  }

  /**
   * Validate standard player move data
   */
  static validatePlayerMove(
    moveData: any,
    expectedPlayer: string
  ): {
    valid: boolean;
    error?: string;
  } {
    if (!moveData || typeof moveData !== 'object') {
      return { valid: false, error: 'Invalid move data format' };
    }

    if (!moveData.player || typeof moveData.player !== 'string') {
      return { valid: false, error: 'Missing or invalid player field' };
    }

    if (moveData.player !== expectedPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    return { valid: true };
  }
}

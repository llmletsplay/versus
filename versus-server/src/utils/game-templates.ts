/**
 * Game templates and generators
 * Provides pre-built templates for common game types to speed up development
 * and ensure consistency across implementations
 */

import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';
import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import {
  BoardGameMixin,
  CardGameMixin,
  TurnBasedMixin,
  ScoringMixin,
  GameMetadataBuilder,
  StandardBoardGameState,
  StandardCardGameState,
  StandardScoredGameState,
} from './game-mixins.js';
import { BoardValidators, CardValidators, ValidationChain } from './validation-helpers.js';
import { BOARD_SIZES, PLAYER_COUNTS, createStandardDeck } from './game-constants.js';

/**
 * Abstract template for simple board games
 * Provides common functionality for games like Tic-Tac-Toe, Connect Four, etc.
 */
export abstract class SimpleBoardGameTemplate<
  TPlayer extends string = string,
  TCell = any,
> extends BaseGame {
  protected abstract readonly boardSize: number;
  protected abstract readonly emptyValue: TCell;
  protected abstract readonly winLength: number;

   protected state: any;

  constructor(gameId: string, gameType: string, database: DatabaseProvider) {
    super(gameId, gameType, database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const players = this.getPlayerOrder();

     this.state = {
       scores: ScoringMixin.initializeScores(players),
       currentPlayer: players[0] as TPlayer,
       gameOver: false,
       winner: null,
       playerOrder: players as TPlayer[],
       round: 1,
       status: 'waiting' as const,
       board: this.createEmptyBoard(),
     } as any;

     return this.state;
   }

   async isGameOver(): Promise<boolean> {
     return this.state.gameOver;
   }

   async getWinner(): Promise<string | null> {
     return this.state.winner;
   }

   protected createEmptyBoard(): TCell[][] {
    return Array(this.boardSize)
      .fill(null)
      .map(() => Array(this.boardSize).fill(this.emptyValue));
  }

  protected checkWin(player: TCell): boolean {
    return BoardGameMixin.checkLineWin(this.state.board, player, this.winLength);
  }

  protected checkDraw(): boolean {
    return BoardGameMixin.isBoardFull(this.state.board, this.emptyValue);
  }

  protected abstract getPlayerOrder(): string[];
}

/**
 * Abstract template for simple card games
 * Provides common functionality for games with hands, deck, and discard pile
 */
export abstract class SimpleCardGameTemplate<TPlayer extends string = string> extends BaseGame {
  protected abstract readonly cardsPerPlayer: number;
  protected abstract readonly playerCount: number;

  protected abstract getPlayerOrder(): string[];
  protected abstract createDeck(): any[];

   protected state: any;

  constructor(gameId: string, gameType: string, database: DatabaseProvider) {
    super(gameId, gameType, database);
  }

   async initializeGame(_config?: GameConfig): Promise<GameState> {
     const players = this.getPlayerOrder();
     const deck = this.shuffleArray(this.createDeck());

     // Deal cards to players
     const dealResult = CardGameMixin.dealCards(deck, this.playerCount, this.cardsPerPlayer);

      // Create hands object
      const hands: Record<TPlayer, any[]> = {} as Record<TPlayer, any[]>;
      players.forEach((player: string, index: number) => {
        hands[player as TPlayer] = dealResult.hands[index] || [];
      });

      this.state = {
        hands,
        deck: dealResult.remainingDeck,
        discardPile: [],
        currentPlayer: players[0] as TPlayer,
        gameOver: false,
        winner: null,
        playerOrder: players as TPlayer[],
        status: 'waiting' as const,
      };

      return this.state;
    }
}

/**
 * Quick game generator
 * Generates basic game implementations for rapid prototyping
 */
export class GameGenerator {
  /**
   * Generate a basic Tic-Tac-Toe style game
   */
  static generateTicTacToeStyle(
    gameType: string,
    boardSize: number = 3,
    winLength: number = 3
  ): string {
    return `
import { BaseGame } from '../core/base-game.js';
import { SimpleBoardGameTemplate } from '../utils/game-templates.js';
import { GameMetadataBuilder } from '../utils/game-mixins.js';
import type { GameMetadata } from '../types/game.js';

type Player = 'X' | 'O';
type Cell = Player | null;

 export class ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}Game extends SimpleBoardGameTemplate<Player, Cell> {
   protected readonly boardSize = ${boardSize};
   protected readonly emptyValue = null;
   protected readonly winLength = ${winLength};

   constructor(gameId: string, database: DatabaseProvider) {
     super(gameId, gameType, database);
   }

  protected getPlayerOrder(): string[] {
    return ['X', 'O'];
  }

  getMetadata(): GameMetadata {
    return GameMetadataBuilder.create()
      .name('${gameType.charAt(0).toUpperCase() + gameType.slice(1)}')
      .description('${boardSize}x${boardSize} grid game where players try to get ${winLength} in a row')
      .players(2)
      .duration('2-10 minutes')
      .complexity('beginner')
      .categories('strategy', 'classic', 'board')
      .build();
  }
}
`.trim();
  }

  /**
   * Generate a basic card game
   */
  static generateCardGame(
    gameType: string,
    playerCount: number = 4,
    cardsPerPlayer: number = 7
  ): string {
    return `
import { SimpleCardGameTemplate } from '../utils/game-templates.js';
import { GameMetadataBuilder } from '../utils/game-mixins.js';
import type { GameMetadata, GameMove } from '../types/game.js';

 export class ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}Game extends SimpleCardGameTemplate {
   protected readonly cardsPerPlayer = ${cardsPerPlayer};
   protected readonly playerCount = ${playerCount};

   constructor(gameId: string, database: DatabaseProvider) {
     super(gameId, gameType, database);
   }

  protected getPlayerOrder(): string[] {
    return Array.from({ length: ${playerCount} }, (_, i) => \`Player\${i + 1}\`);
  }

  protected async applyCardEffect(_card: any, _player: string): Promise<void> {
    // Implement your card effect logic here
    logger.debug(\`\${_player} played \${_card.rank} of \${_card.suit}\`);
  }

  getMetadata(): GameMetadata {
    return GameMetadataBuilder.create()
      .name('${gameType.charAt(0).toUpperCase() + gameType.slice(1)}')
      .description('Card game for ${playerCount} players')
      .players(${playerCount})
      .duration('15-30 minutes')
      .complexity('intermediate')
      .categories('card', 'family')
      .build();
  }
}
`.trim();
  }
}

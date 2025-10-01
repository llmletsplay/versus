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

  protected state!: StandardBoardGameState<TPlayer, TCell>;

  constructor(gameId: string, gameType: string, database: DatabaseProvider) {
    super(gameId, gameType, database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const players = this.getPlayerOrder();

    this.state = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: this.createEmptyBoard(),
      currentPlayer: players[0] as TPlayer,
      gameOver: false,
      winner: null,
      playerOrder: players as TPlayer[],
      status: 'waiting' as const,
    };

    this.currentState = this.state;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    return BoardValidators.standardMove(
      moveData,
      this.boardSize,
      this.state.currentPlayer,
      this.state.gameOver,
      this.state.board,
      this.emptyValue
    );
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { row, col, player } = move.moveData;

    // Place the piece
    this.state.board[row]![col] = player as TCell;

    // Check for win
    if (this.checkWin(player as TCell)) {
      this.state.gameOver = true;
      this.state.winner = player as TPlayer;
    } else if (this.checkDraw()) {
      this.state.gameOver = true;
      this.state.winner = 'draw' as TPlayer;
    } else {
      // Advance to next player
      this.state.currentPlayer = TurnBasedMixin.getNextPlayer(
        this.state.playerOrder,
        this.state.currentPlayer
      ) as TPlayer;
    }

    this.currentState = this.state;
    await this.persistState();
  }

  async getGameState(): Promise<GameState> {
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      ...this.state,
    };
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

  protected state!: StandardCardGameState<TPlayer>;

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
    players.forEach((player, index) => {
      hands[player as TPlayer] = dealResult.hands[index] || [];
    });

    this.state = {
      gameId: this.gameId,
      gameType: this.gameType,
      hands,
      deck: dealResult.remainingDeck,
      discardPile: [],
      currentPlayer: players[0] as TPlayer,
      gameOver: false,
      winner: null,
      playerOrder: players as TPlayer[],
      status: 'waiting' as const,
    };

    this.currentState = this.state;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    const playerHand = this.state.hands[moveData.player as TPlayer] || [];

    return CardValidators.standardPlay(
      moveData,
      playerHand,
      this.state.currentPlayer,
      this.state.gameOver
    );
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { player, cardIndex } = move.moveData;
    const playerHand = this.state.hands[player as TPlayer];

    if (playerHand && cardIndex >= 0 && cardIndex < playerHand.length) {
      // Remove card from hand
      const playedCard = playerHand.splice(cardIndex, 1)[0];

      // Add to discard pile
      if (playedCard) {
        this.state.discardPile.push(playedCard);
      }

      // Apply game-specific card logic
      await this.applyCardEffect(playedCard, player as TPlayer);

      // Check for game end
      if (this.checkGameEnd()) {
        this.state.gameOver = true;
        this.state.winner = this.determineWinner();
      } else {
        // Advance to next player
        this.state.currentPlayer = TurnBasedMixin.getNextPlayer(
          this.state.playerOrder,
          this.state.currentPlayer
        ) as TPlayer;
      }
    }

    this.currentState = this.state;
    await this.persistState();
  }

  async getGameState(): Promise<GameState> {
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      ...this.state,
    };
  }

  async isGameOver(): Promise<boolean> {
    return this.state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    return this.state.winner;
  }

  protected createDeck(): any[] {
    return createStandardDeck();
  }

  protected checkGameEnd(): boolean {
    // Default: game ends when a player runs out of cards
    return Object.values(this.state.hands).some(hand => hand.length === 0);
  }

  protected determineWinner(): TPlayer | null {
    // Default: player with no cards wins
    for (const [player, hand] of Object.entries(this.state.hands)) {
      if (hand.length === 0) {
        return player as TPlayer;
      }
    }
    return null;
  }

  protected abstract getPlayerOrder(): string[];
  protected abstract applyCardEffect(_card: any, _player: TPlayer): Promise<void>;
}

/**
 * Abstract template for scored games
 * Provides common functionality for games with scoring systems
 */
export abstract class ScoredGameTemplate<TPlayer extends string = string> extends BaseGame {
  protected abstract readonly targetScore: number;
  protected abstract readonly maxRounds?: number;

  protected state!: StandardScoredGameState<TPlayer>;

  constructor(gameId: string, gameType: string, database: DatabaseProvider) {
    super(gameId, gameType, database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const players = this.getPlayerOrder();

    this.state = {
      gameId: this.gameId,
      gameType: this.gameType,
      scores: ScoringMixin.initializeScores(players),
      currentPlayer: players[0] as TPlayer,
      gameOver: false,
      winner: null,
      playerOrder: players as TPlayer[],
      round: 1,
      status: 'waiting' as const,
    };

    this.currentState = this.state;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    return ValidationChain.create()
      .add({ valid: !this.state.gameOver, error: 'Game is over' })
      .add({ valid: !!moveData.player, error: 'Missing player' })
      .add({ valid: moveData.player === this.state.currentPlayer, error: 'Not your turn' })
      .validate();
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { player } = move.moveData;

    // Apply game-specific scoring
    const points = await this.calculateMoveScore(move);
    this.state.scores = ScoringMixin.addScore(this.state.scores, player, points);

    // Check for game end
    if (this.checkGameEnd()) {
      this.state.gameOver = true;
      this.state.winner = this.determineWinner();
    } else {
      // Advance to next player
      this.state.currentPlayer = TurnBasedMixin.getNextPlayer(
        this.state.playerOrder,
        this.state.currentPlayer
      ) as TPlayer;

      // Check if round should advance
      if (this.shouldAdvanceRound()) {
        this.state.round++;
        await this.onRoundEnd();
      }
    }

    this.currentState = this.state;
    await this.persistState();
  }

  async getGameState(): Promise<GameState> {
    return {
      gameId: this.gameId,
      gameType: this.gameType,
      ...this.state,
    };
  }

  async isGameOver(): Promise<boolean> {
    return this.state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    return this.state.winner;
  }

  protected checkGameEnd(): boolean {
    // Check if target score reached
    const highestScore = Math.max(...Object.values(this.state.scores));
    if (highestScore >= this.targetScore) {
      return true;
    }

    // Check if max rounds reached
    if (this.maxRounds && this.state.round >= this.maxRounds) {
      return true;
    }

    return false;
  }

  protected determineWinner(): TPlayer | null {
    return ScoringMixin.getWinner(this.state.scores) as TPlayer | null;
  }

  protected shouldAdvanceRound(): boolean {
    // Default: advance round when all players have had a turn
    return (
      this.state.playerOrder.indexOf(this.state.currentPlayer) === this.state.playerOrder.length - 1
    );
  }

  protected async onRoundEnd(): Promise<void> {
    // Override in subclasses for round-end logic
  }

  protected abstract getPlayerOrder(): string[];
  protected abstract calculateMoveScore(_move: GameMove): Promise<number>;
}

/**
 * Game template factory
 * Provides factory methods to create common game templates
 */
export class GameTemplateFactory {
  /**
   * Create a simple 2-player board game template
   */
  static createTwoPlayerBoardGame(
    gameType: string,
    boardSize: number = BOARD_SIZES.SMALL,
    winLength: number = 3
  ) {
    return class extends SimpleBoardGameTemplate<'X' | 'O', 'X' | 'O' | null> {
      protected readonly boardSize = boardSize;
      protected readonly emptyValue = null;
      protected readonly winLength = winLength;

      constructor(gameId: string, database: DatabaseProvider) {
        super(gameId, gameType, database);
      }

      protected getPlayerOrder(): string[] {
        return ['X', 'O'];
      }

      getMetadata(): GameMetadata {
        return GameMetadataBuilder.create()
          .name(gameType.charAt(0).toUpperCase() + gameType.slice(1))
          .description(
            `${boardSize}x${boardSize} board game where players try to get ${winLength} in a row`
          )
          .players(PLAYER_COUNTS.TWO)
          .duration('5-10 minutes')
          .complexity('beginner')
          .categories('strategy', 'classic', 'board')
          .build();
      }
    };
  }

  /**
   * Create a simple card game template
   */
  static createSimpleCardGame(
    gameType: string,
    playerCount: number = PLAYER_COUNTS.FOUR,
    cardsPerPlayer: number = 7
  ) {
    return class extends SimpleCardGameTemplate {
      protected readonly cardsPerPlayer = cardsPerPlayer;
      protected readonly playerCount = playerCount;

      constructor(gameId: string, database: DatabaseProvider) {
        super(gameId, gameType, database);
      }

      protected getPlayerOrder(): string[] {
        return Array.from({ length: playerCount }, (_, i) => `Player${i + 1}`);
      }

      protected async applyCardEffect(_card: any, _player: string): Promise<void> {
        // Override in specific implementations
      }

      getMetadata(): GameMetadata {
        return GameMetadataBuilder.create()
          .name(gameType.charAt(0).toUpperCase() + gameType.slice(1))
          .description(`Card game for ${playerCount} players`)
          .players(playerCount)
          .duration('15-30 minutes')
          .complexity('intermediate')
          .categories('card', 'family')
          .build();
      }
    };
  }

  /**
   * Create a scored game template
   */
  static createScoredGame(
    gameType: string,
    playerCount: number = PLAYER_COUNTS.FOUR,
    targetScore: number = 100
  ) {
    return class extends ScoredGameTemplate {
      protected readonly targetScore = targetScore;

      constructor(gameId: string, database: DatabaseProvider) {
        super(gameId, gameType, database);
      }

      protected getPlayerOrder(): string[] {
        return Array.from({ length: playerCount }, (_, i) => `Player${i + 1}`);
      }

      protected async calculateMoveScore(_move: GameMove): Promise<number> {
        // Override in specific implementations
        return 1;
      }

      getMetadata(): GameMetadata {
        return GameMetadataBuilder.create()
          .name(gameType.charAt(0).toUpperCase() + gameType.slice(1))
          .description(
            `Scored game for ${playerCount} players, first to ${targetScore} points wins`
          )
          .players(playerCount)
          .duration('20-40 minutes')
          .complexity('intermediate')
          .categories('strategy', 'scoring')
          .build();
      }
    };
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
    super(gameId, '${gameType}');
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
    super(gameId, '${gameType}');
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

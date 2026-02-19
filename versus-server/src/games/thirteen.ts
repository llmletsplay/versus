import { BaseGame } from '../core/base-game.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';
import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type { LogContext } from '../utils/logger.js';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // For comparison (3=0, 4=1, ..., A=11, 2=12)
}

interface ThirteenState extends GameState {
  deck: Card[];
  players: {
    [playerId: string]: {
      hand: Card[];
      isOut: boolean;
      position?: number; // Final position when they go out
    };
  };
  currentPlayer: string;
  lastPlay: {
    player: string;
    cards: Card[];
    playType:
      | 'single'
      | 'pair'
      | 'triple'
      | 'straight'
      | 'flush'
      | 'fullHouse'
      | 'fourOfAKind'
      | 'straightFlush';
  } | null;
  gameOver: boolean;
  winner: string | null;
  playerOrder: string[];
  passedPlayers: Set<string>; // Players who passed this round
  gamePhase: 'dealing' | 'playing' | 'finished';
}

interface ThirteenMove {
  player: string;
  cards?: Card[];
  action: 'play' | 'pass';
}

// Enhanced error messages with context
const THIRTEEN_ERROR_MESSAGES = {
  INVALID_MOVE_DATA: 'Move must include player and action',
  INVALID_ACTION: 'Action must be play or pass',
  GAME_OVER: 'Game is already over',
  WRONG_TURN: "It's {currentPlayer}'s turn",
  INVALID_PLAYER: 'Invalid player',
  PLAYER_OUT: 'Player is already out',
  CANNOT_PASS_FIRST: 'Cannot pass when no cards have been played',
  MUST_SPECIFY_CARDS: 'Must specify cards to play',
  INVALID_CARD_COMBINATION: 'Invalid card combination',
  PLAYER_MISSING_CARD: 'Player does not have {rank} of {suit}',
  WRONG_PLAY_TYPE: 'Must play {expectedType}, not {actualType}',
  WRONG_CARD_COUNT: 'Must play same number of cards',
  CARDS_TOO_LOW: 'Must play higher cards',
  FIRST_PLAY_NEEDS_3_SPADES: 'First play must include 3 of spades',
  INVALID_PLAYER_COUNT: 'Player count must be between 2 and 4',
  GAME_NOT_INITIALIZED: 'Game not properly initialized',
} as const;

// Game constants for validation
const GAME_CONSTANTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  CARDS_PER_PLAYER: 13,
  DECK_SIZE: 52,
  MIN_STRAIGHT_LENGTH: 5,
  MAX_STRAIGHT_LENGTH: 5,
} as const;

export class ThirteenGame extends BaseGame<ThirteenState> {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'thirteen', database);

    // Validate gameId to prevent injection attacks
    if (!gameId || typeof gameId !== 'string' || gameId.length > 100) {
      throw new Error('Invalid game ID');
    }
  }

  async initializeGame(config?: GameConfig): Promise<ThirteenState> {
    try {
      // Enhanced input validation
      const playerCount = this.validatePlayerCount((config as any)?.playerCount);

      const deck = this.createDeck();
      this.shuffleDeck(deck);

      const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

      const players: ThirteenState['players'] = {};

      // Deal cards with validation
      this.validateDeckSize(deck, playerCount);

      // Deal 13 cards to each player
      for (let i = 0; i < playerCount; i++) {
        const playerId = playerIds[i]!;
        const startIndex = i * GAME_CONSTANTS.CARDS_PER_PLAYER;
        const endIndex = (i + 1) * GAME_CONSTANTS.CARDS_PER_PLAYER;

        players[playerId] = {
          hand: deck.slice(startIndex, endIndex).sort((a, b) => a.value - b.value),
          isOut: false,
        };
      }

      // Find player with 3 of spades to start with validation
      const startingPlayer = this.findPlayerWith3OfSpades(players, playerIds);

      const initialState: ThirteenState = {
        gameId: this.gameId,
        gameType: this.gameType,
        deck,
        players,
        currentPlayer: startingPlayer,
        lastPlay: null,
        gameOver: false,
        winner: null,
        playerOrder: Object.freeze([...playerIds]) as string[],
        passedPlayers: new Set(),
        gamePhase: 'playing',
      };

      this.currentState = initialState;
      await this.persistState();

      return this.getGameState();
    } catch (error) {
      logger.error(
        'Failed to initialize Thirteen game:',
        error instanceof Error ? error : new Error(String(error))
      );
      throw new Error(
        `Failed to initialize game: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Enhanced validation methods
  private validatePlayerCount(playerCount?: number): number {
    const count = playerCount ?? 4;

    if (
      !Number.isInteger(count) ||
      count < GAME_CONSTANTS.MIN_PLAYERS ||
      count > GAME_CONSTANTS.MAX_PLAYERS
    ) {
      throw new Error(THIRTEEN_ERROR_MESSAGES.INVALID_PLAYER_COUNT);
    }

    return count;
  }

  private validateDeckSize(deck: Card[], playerCount: number): void {
    if (deck.length !== GAME_CONSTANTS.DECK_SIZE) {
      throw new Error(
        `Invalid deck size: expected ${GAME_CONSTANTS.DECK_SIZE}, got ${deck.length}`
      );
    }

    const requiredCards = playerCount * GAME_CONSTANTS.CARDS_PER_PLAYER;
    if (requiredCards > deck.length) {
      throw new Error(`Not enough cards for ${playerCount} players`);
    }
  }

  private findPlayerWith3OfSpades(players: ThirteenState['players'], playerIds: string[]): string {
    for (const [playerId, player] of Object.entries(players)) {
      if (player.hand.some((card) => card.rank === '3' && card.suit === 'spades')) {
        return playerId;
      }
    }

    logger.warn('No player has 3 of spades, using first player as fallback');
    return playerIds[0]!; // Fallback
  }

  private createDeck(): Card[] {
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const deck: Card[] = [];

    for (const suit of suits) {
      for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i]!;
        deck.push({
          suit,
          rank,
          value: i,
        });
      }
    }

    return deck;
  }

  private shuffleDeck(deck: Card[]): void {
    // Use Fisher-Yates shuffle for better randomness
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i]!, deck[j]!] = [deck[j]!, deck[i]!];
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      // Comprehensive input validation and sanitization
      if (!moveData || typeof moveData !== 'object') {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      const move = this.sanitizeMove(moveData);
      if (!move) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      if (!move.player || !move.action) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.INVALID_MOVE_DATA };
      }

      if (!['play', 'pass'].includes(move.action)) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.INVALID_ACTION };
      }

      const state = this.currentState;
      if (!state) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.GAME_NOT_INITIALIZED };
      }

      if (state.gameOver) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.GAME_OVER };
      }

      if (move.player !== state.currentPlayer) {
        return {
          valid: false,
          error: THIRTEEN_ERROR_MESSAGES.WRONG_TURN.replace('{currentPlayer}', state.currentPlayer),
        };
      }

      const player = state.players[move.player];
      if (!player) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.INVALID_PLAYER };
      }

      if (player.isOut) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.PLAYER_OUT };
      }

      if (move.action === 'pass') {
        // Can't pass if you're the first player of a new round
        if (!state.lastPlay) {
          return { valid: false, error: THIRTEEN_ERROR_MESSAGES.CANNOT_PASS_FIRST };
        }
        return { valid: true };
      }

      // Validate play action with enhanced checks
      return this.validatePlayAction(move, state, player);
    } catch (error) {
      // Enhanced error logging for production debugging
      const errorContext: LogContext = {
        gameId: this.gameId,
        moveData: JSON.stringify(moveData),
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };

      logger.error('Error validating move:', errorContext);

      // In development, include stack trace
      if (process.env.NODE_ENV === 'development') {
        logger.error(
          'Stack trace:',
          error instanceof Error ? error : new Error('No stack trace available')
        );
      }

      return { valid: false, error: 'Invalid move data format' };
    }
  }

  // Input sanitization to prevent injection and malformed data
  private sanitizeMove(moveData: Record<string, any>): ThirteenMove | null {
    try {
      // Validate and sanitize player ID
      const player = moveData.player;
      if (!player || typeof player !== 'string' || player.length > 50) {
        return null;
      }

      // Allow all actions for validation to handle them properly
      if (!moveData.action || typeof moveData.action !== 'string') {
        return null;
      }

      const move: ThirteenMove = {
        player,
        action: moveData.action as 'pass' | 'play',
      };

      // Sanitize cards if present - allow empty arrays for validation to handle
      if (moveData.cards !== undefined) {
        if (!Array.isArray(moveData.cards)) {
          return null;
        }

        if (moveData.cards.length === 0) {
          move.cards = []; // Allow empty arrays
        } else {
          const sanitizedCards = this.sanitizeCards(moveData.cards);
          if (sanitizedCards === null) {
            return null;
          }
          move.cards = sanitizedCards;
        }
      }

      return move;
    } catch (error) {
      logger.error(
        'Error sanitizing move:',
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  // Card sanitization with validation
  private sanitizeCards(cards: any[]): Card[] | null {
    if (cards.length === 0 || cards.length > 13) {
      // Reasonable bounds
      return null;
    }

    const validSuits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const validRanks: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

    const sanitizedCards: Card[] = [];

    for (const card of cards) {
      if (!card || typeof card !== 'object') {
        return null;
      }

      if (!validSuits.includes(card.suit) || !validRanks.includes(card.rank)) {
        return null;
      }

      const value = validRanks.indexOf(card.rank);
      sanitizedCards.push({
        suit: card.suit,
        rank: card.rank,
        value: card.value !== undefined ? card.value : value,
      });
    }

    return sanitizedCards;
  }

  private validatePlayAction(
    move: ThirteenMove,
    state: ThirteenState,
    player: ThirteenState['players'][string]
  ): MoveValidationResult {
    // Validate play action
    if (!move.cards || !Array.isArray(move.cards) || move.cards.length === 0) {
      return { valid: false, error: THIRTEEN_ERROR_MESSAGES.MUST_SPECIFY_CARDS };
    }

    // Check if player has all the cards they want to play
    for (const card of move.cards) {
      const hasCard = player.hand.some(
        (handCard) => handCard.suit === card.suit && handCard.rank === card.rank
      );
      if (!hasCard) {
        return {
          valid: false,
          error: THIRTEEN_ERROR_MESSAGES.PLAYER_MISSING_CARD.replace('{rank}', card.rank).replace(
            '{suit}',
            card.suit
          ),
        };
      }
    }

    // Validate play type and strength
    const playValidation = this.validatePlay(move.cards, state.lastPlay);
    if (!playValidation.valid) {
      return playValidation;
    }

    // First play must include 3 of spades
    if (
      !state.lastPlay &&
      state.currentPlayer === this.findPlayerWith3OfSpades(state.players, state.playerOrder)
    ) {
      const has3OfSpades = move.cards.some((card) => card.rank === '3' && card.suit === 'spades');
      if (!has3OfSpades) {
        return { valid: false, error: THIRTEEN_ERROR_MESSAGES.FIRST_PLAY_NEEDS_3_SPADES };
      }
    }

    return { valid: true };
  }

  private validatePlay(cards: Card[], lastPlay: ThirteenState['lastPlay']): MoveValidationResult {
    const playType = this.getPlayType(cards);
    if (!playType) {
      return { valid: false, error: 'Invalid card combination' };
    }

    // If no last play, any valid combination is allowed
    if (!lastPlay) {
      return { valid: true };
    }

    // Must play same type and higher value
    if (playType !== lastPlay.playType) {
      return { valid: false, error: `Must play ${lastPlay.playType}, not ${playType}` };
    }

    if (cards.length !== lastPlay.cards.length) {
      return { valid: false, error: 'Must play same number of cards' };
    }

    const playStrength = this.getPlayStrength(cards, playType);
    const lastPlayStrength = this.getPlayStrength(lastPlay.cards, lastPlay.playType);

    if (playStrength <= lastPlayStrength) {
      return { valid: false, error: 'Must play higher cards' };
    }

    return { valid: true };
  }

  private getPlayType(cards: Card[]): string | null {
    const sorted = [...cards].sort((a, b) => a.value - b.value);

    if (cards.length === 1) {
      return 'single';
    }

    if (cards.length === 2) {
      if (sorted[0]?.rank === sorted[1]?.rank) {
        return 'pair';
      }
      return null;
    }

    if (cards.length === 3) {
      if (sorted[0]?.rank === sorted[1]?.rank && sorted[1]?.rank === sorted[2]?.rank) {
        return 'triple';
      }
      return null;
    }

    if (cards.length === 4) {
      if (
        sorted[0]?.rank === sorted[1]?.rank &&
        sorted[1]?.rank === sorted[2]?.rank &&
        sorted[2]?.rank === sorted[3]?.rank
      ) {
        return 'fourOfAKind';
      }
      return null;
    }

    if (cards.length === 5) {
      // Check for straight flush
      if (this.isStraight(sorted) && this.isFlush(cards)) {
        return 'straightFlush';
      }

      // Check for four of a kind
      if (this.isFourOfAKind(sorted)) {
        return 'fourOfAKind';
      }

      // Check for full house
      if (this.isFullHouse(sorted)) {
        return 'fullHouse';
      }

      // Check for flush
      if (this.isFlush(cards)) {
        return 'flush';
      }

      // Check for straight
      if (this.isStraight(sorted)) {
        return 'straight';
      }
    }

    return null;
  }

  private isStraight(sortedCards: Card[]): boolean {
    if (sortedCards.length !== 5) {
      return false;
    }

    for (let i = 1; i < sortedCards.length; i++) {
      if (sortedCards[i]!.value !== sortedCards[i - 1]!.value + 1) {
        return false;
      }
    }
    return true;
  }

  private isFlush(cards: Card[]): boolean {
    if (cards.length !== 5) {
      return false;
    }
    const suit = cards[0]!.suit;
    return cards.every((card) => card.suit === suit);
  }

  private isFourOfAKind(sortedCards: Card[]): boolean {
    if (sortedCards.length !== 5) {
      return false;
    }

    // AAAAB or ABBBB
    return (
      sortedCards[0]!.rank === sortedCards[3]!.rank || sortedCards[1]!.rank === sortedCards[4]!.rank
    );
  }

  private isFullHouse(sortedCards: Card[]): boolean {
    if (sortedCards.length !== 5) {
      return false;
    }

    // AAABB or AABBB
    return (
      (sortedCards[0]!.rank === sortedCards[2]!.rank &&
        sortedCards[3]!.rank === sortedCards[4]!.rank) ||
      (sortedCards[0]!.rank === sortedCards[1]!.rank &&
        sortedCards[2]!.rank === sortedCards[4]!.rank)
    );
  }

  private getPlayStrength(cards: Card[], playType: string): number {
    const sorted = [...cards].sort((a, b) => a.value - b.value);

    switch (playType) {
      case 'single':
        return cards[0]!.value * 4 + this.getSuitValue(cards[0]!.suit);

      case 'pair':
      case 'triple':
      case 'fourOfAKind':
        return sorted[0]!.value * 4 + this.getSuitValue(sorted[sorted.length - 1]!.suit);

      case 'straight':
      case 'straightFlush':
        return (
          sorted[sorted.length - 1]!.value * 4 + this.getSuitValue(sorted[sorted.length - 1]!.suit)
        );

      case 'flush':
        return Math.max(...sorted.map((card) => card.value * 4 + this.getSuitValue(card.suit)));

      case 'fullHouse':
        // Find the triple
        const triple = sorted[2]!.rank;
        const tripleValue = sorted.find((card) => card.rank === triple)!.value;
        return tripleValue * 4;

      default:
        return 0;
    }
  }

  private getSuitValue(suit: Suit): number {
    const suitOrder = { spades: 0, clubs: 1, diamonds: 2, hearts: 3 };
    return suitOrder[suit];
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const thirteenMove = move.moveData as ThirteenMove;
    const state = this.currentState as ThirteenState;

    if (thirteenMove.action === 'pass') {
      state.passedPlayers.add(thirteenMove.player);

      // Check if all other players have passed
      const activePlayers = state.playerOrder.filter((p) => !state.players[p]!.isOut);
      const allOthersPassedOrOut = activePlayers.every(
        (p) => p === state.currentPlayer || state.passedPlayers.has(p) || state.players[p]!.isOut
      );

      if (allOthersPassedOrOut) {
        // Clear the table, current player starts new round
        state.lastPlay = null;
        state.passedPlayers.clear();
      } else {
        this.moveToNextPlayer(state);
      }
    } else {
      // Play cards
      const player = state.players[thirteenMove.player];

      // Remove cards from hand
      if (thirteenMove.cards) {
        for (const cardToPlay of thirteenMove.cards) {
          const index = player!.hand.findIndex(
            (handCard) => handCard.suit === cardToPlay.suit && handCard.rank === cardToPlay.rank
          );
          if (index !== -1) {
            player!.hand.splice(index, 1);
          }
        }

        // Update last play
        state.lastPlay = {
          player: thirteenMove.player,
          cards: thirteenMove.cards,
          playType: this.getPlayType(thirteenMove.cards)! as any,
        };

        // Clear passed players
        state.passedPlayers.clear();

        // Check if player is out
        if (player!.hand.length === 0) {
          player!.isOut = true;
          const finishedCount = Object.values(state.players).filter((p) => p!.isOut).length;
          player!.position = finishedCount;

          // Check win condition
          if (finishedCount === 1) {
            state.winner = thirteenMove.player;
            state.gameOver = true;
            state.gamePhase = 'finished';
          }
        }

        if (!state.gameOver) {
          this.moveToNextPlayer(state);
        }
      }
    }
  }

  private moveToNextPlayer(state: ThirteenState): void {
    const activePlayers = state.playerOrder.filter((p) => !state.players[p]!.isOut);
    const currentIndex = activePlayers.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    state.currentPlayer = activePlayers[nextIndex]!;
  }

  async getGameState(): Promise<ThirteenState> {
    const state = this.currentState as ThirteenState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            hand: [] as Card[], // Hide actual cards in public view
            isOut: player.isOut,
            position: player.position,
          },
        ])
      ) as { [playerId: string]: { hand: Card[]; isOut: boolean; position?: number } },
      lastPlay: state.lastPlay,
      gamePhase: state.gamePhase,
      deck: state.deck,
      playerOrder: state.playerOrder,
      passedPlayers: state.passedPlayers,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as ThirteenState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as ThirteenState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Thirteen (Tiến Lên)',
      description:
        'Vietnamese climbing card game where players try to be first to play all their cards',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '15-30 minutes',
      complexity: 'intermediate',
      categories: ['card', 'climbing', 'shedding'],
    };
  }
}

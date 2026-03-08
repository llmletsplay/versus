import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
// type Action = 'hit' | 'stand' | 'double' | 'split';

interface Card {
  rank: Rank;
  suit: Suit;
  faceUp: boolean;
}

interface Hand {
  cards: Card[];
  bet: number;
  isDouble: boolean;
  isSplit: boolean;
  isStand: boolean;
}

export interface BlackjackState extends GameState {
  deck: Card[];
  playerHands: Hand[];
  dealerHand: Hand;
  currentHandIndex: number;
  gameOver: boolean;
  phase: 'betting' | 'dealing' | 'playing' | 'dealer' | 'finished';
  results?: Array<{
    handIndex: number;
    outcome: 'win' | 'lose' | 'push' | 'blackjack';
    payout: number;
  }>;
}

const CARD_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class BlackjackGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'blackjack', database);
  }

  async initializeGame(_config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    const initialState: BlackjackState = {
      gameId: this.gameId,
      gameType: this.gameType,
      deck,
      playerHands: [],
      dealerHand: { cards: [], bet: 0, isDouble: false, isSplit: false, isStand: false },
      currentHandIndex: 0,
      gameOver: false,
      phase: 'betting',
    };

    // For simplicity, auto-start with a single hand and $10 bet
    this.startRound(initialState, [10]);

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createDeck(): Card[] {
    const deck: Card[] = [];
    // Use single deck for simplicity
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit, faceUp: true });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
  }

  private dealCard(state: BlackjackState, faceUp: boolean = true): Card {
    if (state.deck.length === 0) {
      // Reshuffle if deck is empty
      state.deck = this.createDeck();
      this.shuffleDeck(state.deck);
    }
    const card = state.deck.pop()!;
    card.faceUp = faceUp;
    return card;
  }

  private startRound(state: BlackjackState, bets: number[]): void {
    // Create player hands
    state.playerHands = bets.map((bet) => ({
      cards: [],
      bet,
      isDouble: false,
      isSplit: false,
      isStand: false,
    }));

    // Deal initial cards
    // First card to each player
    for (const hand of state.playerHands) {
      hand.cards.push(this.dealCard(state, true));
    }

    // First card to dealer (face down)
    state.dealerHand.cards = [this.dealCard(state, false)];

    // Second card to each player
    for (const hand of state.playerHands) {
      hand.cards.push(this.dealCard(state, true));
    }

    // Second card to dealer (face up)
    state.dealerHand.cards.push(this.dealCard(state, true));

    state.phase = 'playing';
    state.currentHandIndex = 0;

    // Check for blackjacks
    if (this.isBlackjack(state.playerHands[0]!) && this.isBlackjack(state.dealerHand)) {
      this.finishGame(state);
    } else if (this.isBlackjack(state.playerHands[0]!)) {
      this.finishGame(state);
    }
  }

  private calculateHandValue(hand: Hand): number {
    let value = 0;
    let aces = 0;

    for (const card of hand.cards) {
      if (card.rank === 'A') {
        aces++;
      } else {
        value += CARD_VALUES[card.rank];
      }
    }

    // Add aces
    for (let i = 0; i < aces; i++) {
      if (value + 11 <= 21) {
        value += 11;
      } else {
        value += 1;
      }
    }

    return value;
  }

  private isBust(hand: Hand): boolean {
    return this.calculateHandValue(hand) > 21;
  }

  private isBlackjack(hand: Hand): boolean {
    return hand.cards.length === 2 && this.calculateHandValue(hand) === 21;
  }

  private canDouble(hand: Hand): boolean {
    return hand.cards.length === 2 && !hand.isDouble;
  }

  private canSplit(hand: Hand): boolean {
    return hand.cards.length === 2 && hand.cards[0]!.rank === hand.cards[1]!.rank && !hand.isSplit;
  }

  private dealerPlay(state: BlackjackState): void {
    state.phase = 'dealer';

    // Reveal dealer's hole card
    state.dealerHand.cards[0]!.faceUp = true;

    // Dealer hits on soft 17
    while (this.calculateHandValue(state.dealerHand) < 17) {
      state.dealerHand.cards.push(this.dealCard(state, true));
    }

    this.finishGame(state);
  }

  private finishGame(state: BlackjackState): void {
    for (const card of state.dealerHand.cards) {
      card.faceUp = true;
    }

    state.phase = 'finished';
    state.gameOver = true;

    // Calculate results
    state.results = state.playerHands.map((hand, index) => {
      const playerValue = this.calculateHandValue(hand);
      const dealerValue = this.calculateHandValue(state.dealerHand);

      if (this.isBust(hand)) {
        return { handIndex: index, outcome: 'lose' as const, payout: 0 };
      }

      if (this.isBlackjack(hand) && !this.isBlackjack(state.dealerHand)) {
        return { handIndex: index, outcome: 'blackjack' as const, payout: hand.bet * 2.5 };
      }

      if (this.isBlackjack(state.dealerHand) && !this.isBlackjack(hand)) {
        return { handIndex: index, outcome: 'lose' as const, payout: 0 };
      }

      if (this.isBust(state.dealerHand)) {
        return { handIndex: index, outcome: 'win' as const, payout: hand.bet * 2 };
      }

      if (playerValue > dealerValue) {
        return { handIndex: index, outcome: 'win' as const, payout: hand.bet * 2 };
      } else if (playerValue < dealerValue) {
        return { handIndex: index, outcome: 'lose' as const, payout: 0 };
      } else {
        return { handIndex: index, outcome: 'push' as const, payout: hand.bet };
      }
    });
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const { action, player } = moveData;

      if (typeof action !== 'string' || !['hit', 'stand', 'double', 'split'].includes(action)) {
        return { valid: false, error: 'Action must be hit, stand, double, or split' };
      }

      if (typeof player !== 'string') {
        return { valid: false, error: 'Player must be specified' };
      }

      const state = this.currentState as BlackjackState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (state.phase !== 'playing') {
        return { valid: false, error: 'Not in playing phase' };
      }

      if (state.currentHandIndex >= state.playerHands.length) {
        return { valid: false, error: 'No active hand' };
      }

      const currentHand = state.playerHands[state.currentHandIndex]!;

      if (this.isBust(currentHand) || currentHand.isStand) {
        return { valid: false, error: 'Current hand is already finished' };
      }

      // Validate specific actions
      if (action === 'double' && !this.canDouble(currentHand)) {
        return { valid: false, error: 'Cannot double this hand' };
      }

      if (action === 'split' && !this.canSplit(currentHand)) {
        return { valid: false, error: 'Cannot split this hand' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { action } = move.moveData;
    const state = this.currentState as BlackjackState;
    const currentHand = state.playerHands[state.currentHandIndex]!;

    switch (action) {
      case 'hit':
        currentHand.cards.push(this.dealCard(state, true));
        if (this.isBust(currentHand)) {
          this.advanceToNextHand(state);
        }
        break;

      case 'stand':
        currentHand.isStand = true;
        this.advanceToNextHand(state);
        break;

      case 'double':
        currentHand.isDouble = true;
        currentHand.bet *= 2;
        currentHand.cards.push(this.dealCard(state, true));
        this.advanceToNextHand(state);
        break;

      case 'split':
        // Create new hand with the second card
        const newHand: Hand = {
          cards: [currentHand.cards.pop()!],
          bet: currentHand.bet,
          isDouble: false,
          isSplit: true,
          isStand: false,
        };

        // Add new cards to both hands
        currentHand.cards.push(this.dealCard(state, true));
        newHand.cards.push(this.dealCard(state, true));
        currentHand.isSplit = true;

        // Insert new hand after current
        state.playerHands.splice(state.currentHandIndex + 1, 0, newHand);
        break;
    }

    this.currentState = state;
  }

  private advanceToNextHand(state: BlackjackState): void {
    state.currentHandIndex++;

    // If all hands are finished, dealer plays
    if (state.currentHandIndex >= state.playerHands.length) {
      this.dealerPlay(state);
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as BlackjackState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      phase: state.phase,
      gameOver: state.gameOver,
      currentHandIndex: state.currentHandIndex,
      playerHands: state.playerHands.map((hand) => ({
        cards: hand.cards,
        value: this.calculateHandValue(hand),
        bet: hand.bet,
        isDouble: hand.isDouble,
        isSplit: hand.isSplit,
        isStand: hand.isStand,
        isBust: this.isBust(hand),
        isBlackjack: this.isBlackjack(hand),
      })),
      dealerHand: {
        cards: state.dealerHand.cards,
        value:
          state.phase === 'dealer' || state.phase === 'finished'
            ? this.calculateHandValue(state.dealerHand)
            : state.dealerHand.cards.length > 1 && state.dealerHand.cards[1]?.faceUp
              ? CARD_VALUES[state.dealerHand.cards[1].rank]
              : 0,
        isBust: this.isBust(state.dealerHand),
        isBlackjack: this.isBlackjack(state.dealerHand),
      },
      legalActions: this.getLegalActions(state),
      results: state.results,
    };
  }

  private getLegalActions(state: BlackjackState): string[] {
    if (state.phase !== 'playing' || state.currentHandIndex >= state.playerHands.length) {
      return [];
    }

    const currentHand = state.playerHands[state.currentHandIndex]!;

    if (this.isBust(currentHand) || currentHand.isStand) {
      return [];
    }

    const actions = ['hit', 'stand'];

    if (this.canDouble(currentHand)) {
      actions.push('double');
    }

    if (this.canSplit(currentHand)) {
      actions.push('split');
    }

    return actions;
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as BlackjackState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as BlackjackState;
    if (!state.gameOver || !state.results) {
      return null;
    }

    // In blackjack, determine if player won overall
    const totalPayout = state.results.reduce((sum, result) => sum + result.payout, 0);
    const totalBet = state.playerHands.reduce((sum, hand) => sum + hand.bet, 0);

    if (totalPayout > totalBet) {
      return 'player';
    }
    if (totalPayout < totalBet) {
      return 'dealer';
    }
    return 'push';
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Blackjack',
      description:
        'Classic casino card game where you try to get as close to 21 as possible without going over',
      minPlayers: 1,
      maxPlayers: 1,
      estimatedDuration: '2-5 minutes',
      complexity: 'intermediate',
      categories: ['card', 'casino', 'classic'],
    };
  }
}

export function createBlackjackGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): BlackjackGame {
  return new BlackjackGame(gameId, database);
}



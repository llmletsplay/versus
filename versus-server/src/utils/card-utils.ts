/**
 * Shared card utilities for all card-based games
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type StandardRank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface StandardCard {
  suit: Suit;
  rank: StandardRank;
  value?: number;
}

export interface CardWithValue extends StandardCard {
  value: number;
}

/**
 * Standard suits in a deck of cards
 */
export const STANDARD_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Standard ranks in a deck of cards (Ace to King)
 */
export const STANDARD_RANKS: StandardRank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

/**
 * Alternative rank orders for different games
 */
export const RANK_ORDERS = {
  // Standard poker order (A=14, K=13, etc.)
  POKER: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as StandardRank[],

  // War order (A=1, 2=2, etc.)
  WAR: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as StandardRank[],

  // Thirteen order (3=0, 4=1, ..., 2=12)
  THIRTEEN: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as StandardRank[],
};

/**
 * Creates a standard 52-card deck
 * @param valueMapping - Function to map rank to value, or predefined order
 * @returns Array of cards
 */
export function createStandardDeck(
  valueMapping?: ((_rank: StandardRank, _index: number) => number) | keyof typeof RANK_ORDERS
): CardWithValue[] {
  const deck: CardWithValue[] = [];

  let getValue: (_rank: StandardRank, _index: number) => number;

  if (typeof valueMapping === 'string') {
    const rankOrder = RANK_ORDERS[valueMapping];
    getValue = (_rank) => rankOrder.indexOf(_rank);
  } else if (typeof valueMapping === 'function') {
    getValue = valueMapping;
  } else {
    // Default: A=1, 2=2, ..., K=13
    getValue = (_rank, _index) => _index + 1;
  }

  for (const suit of STANDARD_SUITS) {
    for (let i = 0; i < STANDARD_RANKS.length; i++) {
      const rank = STANDARD_RANKS[i]!;
      deck.push({
        suit,
        rank,
        value: getValue(rank, i),
      });
    }
  }

  return deck;
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm
 * @param array - Array to shuffle
 */
export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i]!, array[j]!] = [array[j]!, array[i]!];
  }
}

/**
 * Creates and shuffles a standard deck
 * @param valueMapping - Value mapping for cards
 * @returns Shuffled deck
 */
export function createShuffledDeck(
  valueMapping?: ((_rank: StandardRank, _index: number) => number) | keyof typeof RANK_ORDERS
): CardWithValue[] {
  const deck = createStandardDeck(valueMapping);
  shuffleArray(deck);
  return deck;
}

/**
 * Sorts a hand of cards by value, then by suit
 * @param hand - Array of cards to sort
 * @returns Sorted array
 */
export function sortHand<T extends { value: number; suit: string }>(hand: T[]): T[] {
  return hand.sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return a.suit.localeCompare(b.suit);
  });
}

/**
 * Deals cards evenly to players
 * @param deck - Deck to deal from
 * @param playerCount - Number of players
 * @param cardsPerPlayer - Cards per player (if not specified, deals all cards evenly)
 * @returns Object with player hands and remaining deck
 */
export function dealCards<T>(
  deck: T[],
  playerCount: number,
  cardsPerPlayer?: number
): { playerHands: T[][]; remainingDeck: T[] } {
  const actualCardsPerPlayer = cardsPerPlayer || Math.floor(deck.length / playerCount);
  const playerHands: T[][] = [];

  for (let i = 0; i < playerCount; i++) {
    const startIndex = i * actualCardsPerPlayer;
    const endIndex = startIndex + actualCardsPerPlayer;
    playerHands.push(deck.slice(startIndex, endIndex));
  }

  const remainingDeck = deck.slice(playerCount * actualCardsPerPlayer);
  return { playerHands, remainingDeck };
}

/**
 * Distributes remaining cards after initial deal
 * @param remainingCards - Cards left after initial deal
 * @param playerHands - Player hands to distribute to
 */
export function distributeRemainingCards<T>(remainingCards: T[], playerHands: T[][]): void {
  for (let i = 0; i < remainingCards.length; i++) {
    const playerIndex = i % playerHands.length;
    playerHands[playerIndex]!.push(remainingCards[i]!);
  }
}

/**
 * Finds cards in a hand matching specific criteria
 * @param hand - Hand to search
 * @param predicate - Function to test each card
 * @returns Array of matching cards
 */
export function findCards<T>(hand: T[], predicate: (_card: T) => boolean): T[] {
  return hand.filter(predicate);
}

/**
 * Removes specific cards from a hand
 * @param hand - Hand to remove cards from
 * @param cardsToRemove - Cards to remove
 * @returns True if all cards were found and removed
 */
export function removeCards<T extends { suit: string; rank: string }>(
  hand: T[],
  cardsToRemove: T[]
): boolean {
  for (const cardToRemove of cardsToRemove) {
    const index = hand.findIndex(
      (card) => card.suit === cardToRemove.suit && card.rank === cardToRemove.rank
    );
    if (index === -1) {
      return false; // Card not found
    }
    hand.splice(index, 1);
  }
  return true;
}

/**
 * Checks if a hand contains specific cards
 * @param hand - Hand to check
 * @param cardsToCheck - Cards to look for
 * @returns True if all cards are found
 */
export function hasCards<T extends { suit: string; rank: string }>(
  hand: T[],
  cardsToCheck: T[]
): boolean {
  return cardsToCheck.every((_card) =>
    hand.some((_handCard) => _handCard.suit === _card.suit && _handCard.rank === _card.rank)
  );
}

/**
 * Groups cards by rank
 * @param hand - Hand to group
 * @returns Object with ranks as keys and arrays of cards as values
 */
export function groupByRank<T extends { rank: string }>(hand: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const card of hand) {
    if (!groups[card.rank]) {
      groups[card.rank] = [];
    }
    groups[card.rank]!.push(card);
  }
  return groups;
}

/**
 * Groups cards by suit
 * @param hand - Hand to group
 * @returns Object with suits as keys and arrays of cards as values
 */
export function groupBySuit<T extends { suit: string }>(hand: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const card of hand) {
    if (!groups[card.suit]) {
      groups[card.suit] = [];
    }
    groups[card.suit]!.push(card);
  }
  return groups;
}

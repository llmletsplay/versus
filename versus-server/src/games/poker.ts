import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // For comparison (2=2, 3=3, ..., A=14)
}

interface HandRanking {
  rank: number; // 1=high card, 2=pair, ..., 10=royal flush
  name: string;
  cards: Card[];
  kickers: Card[];
}

interface PokerState extends GameState {
  players: {
    [playerId: string]: {
      hand: Card[];
      chips: number;
      currentBet: number;
      folded: boolean;
      allIn: boolean;
      isDealer: boolean;
      isSmallBlind: boolean;
      isBigBlind: boolean;
      bestHand?: HandRanking;
      stats: {
        handsPlayed: number;
        folds: number;
        raises: number;
      };
    };
  };
  communityCards: Card[];
  deck: Card[];
  pot: number;
  currentBet: number;
  currentPlayer: string;
  playerOrder: string[];
  dealerPosition: number;
  gamePhase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
  bettingRound: number;
  lastRaise: number;
  smallBlind: number;
  bigBlind: number;
  gameOver: boolean;
  winners: string[];
  lastAction: {
    action: 'fold' | 'call' | 'raise' | 'check' | 'all-in' | 'deal';
    player?: string;
    amount?: number;
    details?: string;
  } | null;
}

interface PokerMove {
  player: string;
  action: 'fold' | 'call' | 'raise' | 'check' | 'all-in';
  amount?: number; // For raise action
}

export class PokerGame extends BaseGame {
  private rankOrder: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'poker', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // Poker supports 2-10 players
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 10);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const startingChips = (config as any)?.startingChips || 1000;
    const smallBlind = (config as any)?.smallBlind || 10;
    const bigBlind = smallBlind * 2;

    const players: PokerState['players'] = {};

    // Initialize players
    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i]!;
      players[playerId] = {
        hand: [],
        chips: startingChips,
        currentBet: 0,
        folded: false,
        allIn: false,
        isDealer: i === 0,
        isSmallBlind: i === (playerCount === 2 ? 0 : 1),
        isBigBlind: i === (playerCount === 2 ? 1 : 2),
        stats: {
          handsPlayed: 0,
          folds: 0,
          raises: 0,
        },
      };
    }

    // Set blinds
    const smallBlindPlayer = Object.values(players).find(p => p.isSmallBlind)!;
    const bigBlindPlayer = Object.values(players).find(p => p.isBigBlind)!;

    smallBlindPlayer.currentBet = smallBlind;
    smallBlindPlayer.chips -= smallBlind;
    bigBlindPlayer.currentBet = bigBlind;
    bigBlindPlayer.chips -= bigBlind;

    // Find the player after the big blind to start
    const bigBlindIndex = playerIds.findIndex(id => players[id]!.isBigBlind);
    const firstPlayerIndex = (bigBlindIndex + 1) % playerIds.length;

    const initialState: PokerState = {
      gameId: this.gameId,
      gameType: this.gameType,
      players,
      communityCards: [],
      deck,
      pot: smallBlind + bigBlind,
      currentBet: bigBlind,
      currentPlayer: playerIds[firstPlayerIndex]!,
      playerOrder: playerIds,
      dealerPosition: 0,
      gamePhase: 'preflop',
      bettingRound: 1,
      lastRaise: bigBlind,
      smallBlind,
      bigBlind,
      gameOver: false,
      winners: [],
      lastAction: null,
    };

    // Deal hole cards
    this.dealHoleCards(initialState);

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createDeck(): Card[] {
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Card[] = [];

    for (const suit of suits) {
      for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i]!;
        deck.push({
          suit,
          rank,
          value: i + 2, // 2=2, 3=3, ..., A=14
        });
      }
    }

    return deck;
  }

  private shuffleDeck(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i]!, deck[j]!] = [deck[j]!, deck[i]!];
    }
  }

  private dealHoleCards(state: PokerState): void {
    // Deal 2 cards to each player
    for (let round = 0; round < 2; round++) {
      for (const playerId of state.playerOrder) {
        if (!state.players[playerId]!.folded) {
          const card = state.deck.pop()!;
          state.players[playerId]!.hand.push(card);
        }
      }
    }
  }

  private getNextActivePlayer(
    playerOrder: string[],
    currentIndex: number,
    state?: PokerState
  ): string {
    const gameState = state || (this.currentState as PokerState);
    let nextIndex = (currentIndex + 1) % playerOrder.length;
    let attempts = 0;

    while (attempts < playerOrder.length) {
      const playerId = playerOrder[nextIndex]!;
      const player = gameState.players[playerId]!;

      if (!player.folded && !player.allIn) {
        return playerId;
      }

      nextIndex = (nextIndex + 1) % playerOrder.length;
      attempts++;
    }

    return playerOrder[currentIndex]!; // Fallback
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as PokerMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['fold', 'call', 'raise', 'check', 'all-in'].includes(move.action)) {
        return { valid: false, error: 'Invalid action' };
      }

      const state = this.currentState as PokerState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      const player = state.players[move.player];
      if (!player) {
        return { valid: false, error: 'Invalid player' };
      }

      if (player.folded) {
        return { valid: false, error: 'Player has already folded' };
      }

      if (state.currentPlayer !== move.player) {
        return { valid: false, error: 'Not your turn' };
      }

      if (player.allIn) {
        return { valid: false, error: 'Player is already all-in' };
      }

      const callAmount = state.currentBet - player.currentBet;

      if (move.action === 'check') {
        if (callAmount > 0) {
          return { valid: false, error: 'Cannot check when there is a bet to call' };
        }
        return { valid: true };
      }

      if (move.action === 'call') {
        if (callAmount <= 0) {
          return { valid: false, error: 'Nothing to call' };
        }
        if (player.chips < callAmount) {
          return { valid: false, error: 'Not enough chips to call' };
        }
        return { valid: true };
      }

      if (move.action === 'raise') {
        if (!move.amount || move.amount <= 0) {
          return { valid: false, error: 'Raise amount must be positive' };
        }

        if (player.chips < callAmount + move.amount) {
          return { valid: false, error: 'Not enough chips to raise' };
        }

        const minRaise = state.lastRaise;
        if (move.amount < minRaise) {
          return { valid: false, error: `Minimum raise is ${minRaise}` };
        }

        return { valid: true };
      }

      if (move.action === 'all-in') {
        if (player.chips <= 0) {
          return { valid: false, error: 'No chips to go all-in with' };
        }
        return { valid: true };
      }

      if (move.action === 'fold') {
        return { valid: true };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const pokerMove = move.moveData as PokerMove;
    const state = this.currentState as PokerState;

    this.processPlayerAction(state, pokerMove);

    // Check if betting round is complete
    if (this.isBettingRoundComplete(state)) {
      this.advanceGamePhase(state);
    } else {
      // Move to next player
      const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
      state.currentPlayer = this.getNextActivePlayer(state.playerOrder, currentIndex);
    }

    // Check win condition
    this.checkWinCondition(state);
  }

  private processPlayerAction(state: PokerState, move: PokerMove): void {
    const player = state.players[move.player]!;
    const callAmount = state.currentBet - player.currentBet;

    switch (move.action) {
      case 'fold':
        player.folded = true;
        state.lastAction = {
          action: 'fold',
          player: move.player,
          details: `${move.player} folded`,
        };
        break;

      case 'check':
        state.lastAction = {
          action: 'check',
          player: move.player,
          details: `${move.player} checked`,
        };
        break;

      case 'call':
        player.chips -= callAmount;
        player.currentBet += callAmount;
        state.pot += callAmount;

        if (player.chips === 0) {
          player.allIn = true;
        }

        state.lastAction = {
          action: 'call',
          player: move.player,
          amount: callAmount,
          details: `${move.player} called ${callAmount}`,
        };
        break;

      case 'raise':
        const raiseAmount = move.amount!;
        const totalAmount = callAmount + raiseAmount;

        player.chips -= totalAmount;
        player.currentBet += totalAmount;
        state.pot += totalAmount;
        state.currentBet = player.currentBet;
        state.lastRaise = raiseAmount;

        if (player.chips === 0) {
          player.allIn = true;
        }

        state.lastAction = {
          action: 'raise',
          player: move.player,
          amount: raiseAmount,
          details: `${move.player} raised ${raiseAmount} (total bet: ${player.currentBet})`,
        };
        break;

      case 'all-in':
        const allInAmount = player.chips;
        player.currentBet += allInAmount;
        state.pot += allInAmount;
        player.chips = 0;
        player.allIn = true;

        if (player.currentBet > state.currentBet) {
          state.currentBet = player.currentBet;
          state.lastRaise = player.currentBet - (state.currentBet - allInAmount);
        }

        state.lastAction = {
          action: 'all-in',
          player: move.player,
          amount: allInAmount,
          details: `${move.player} went all-in for ${allInAmount}`,
        };
        break;
    }
  }

  private isBettingRoundComplete(state: PokerState): boolean {
    const activePlayers = Object.entries(state.players).filter(([_, p]) => !p.folded);

    if (activePlayers.length <= 1) {
      return true;
    }

    // Check if all active players have either folded, called, or are all-in
    const playersNeedingAction = activePlayers.filter(
      ([_, p]) => !p.allIn && p.currentBet < state.currentBet
    );

    return playersNeedingAction.length === 0;
  }

  private advanceGamePhase(state: PokerState): void {
    // Reset current bets for next round
    for (const player of Object.values(state.players)) {
      player.currentBet = 0;
    }
    state.currentBet = 0;
    state.lastRaise = state.bigBlind;

    switch (state.gamePhase) {
      case 'preflop':
        // Deal the flop (3 cards)
        state.deck.pop(); // Burn card
        for (let i = 0; i < 3; i++) {
          state.communityCards.push(state.deck.pop()!);
        }
        state.gamePhase = 'flop';
        break;

      case 'flop':
        // Deal the turn (1 card)
        state.deck.pop(); // Burn card
        state.communityCards.push(state.deck.pop()!);
        state.gamePhase = 'turn';
        break;

      case 'turn':
        // Deal the river (1 card)
        state.deck.pop(); // Burn card
        state.communityCards.push(state.deck.pop()!);
        state.gamePhase = 'river';
        break;

      case 'river':
        state.gamePhase = 'showdown';
        this.evaluateHands(state);
        this.determineWinners(state);
        return;
    }

    // Set current player to first active player after dealer
    const dealerIndex = state.dealerPosition;
    state.currentPlayer = this.getNextActivePlayer(state.playerOrder, dealerIndex);

    state.lastAction = {
      action: 'deal',
      details: `${state.gamePhase} dealt`,
    };
  }

  private evaluateHands(state: PokerState): void {
    for (const player of Object.values(state.players)) {
      if (!player.folded) {
        const allCards = [...player.hand, ...state.communityCards];
        player.bestHand = this.getBestHand(allCards);
      }
    }
  }

  private getBestHand(cards: Card[]): HandRanking {
    const combinations = this.getCombinations(cards, 5);
    let bestHand: HandRanking = { rank: 0, name: 'High Card', cards: [], kickers: [] };

    for (const combo of combinations) {
      const hand = this.evaluateHandRank(combo);
      if (
        hand.rank > bestHand.rank ||
        (hand.rank === bestHand.rank && this.compareHands(hand, bestHand) > 0)
      ) {
        bestHand = hand;
      }
    }

    return bestHand;
  }

  private getCombinations(arr: Card[], k: number): Card[][] {
    if (k === 1) {
      return arr.map(item => [item]);
    }
    if (k === arr.length) {
      return [arr];
    }

    const combinations: Card[][] = [];
    for (let i = 0; i <= arr.length - k; i++) {
      const head = arr[i]!;
      const tail = arr.slice(i + 1);
      const tailCombos = this.getCombinations(tail, k - 1);
      for (const combo of tailCombos) {
        combinations.push([head, ...combo]);
      }
    }
    return combinations;
  }

  private evaluateHandRank(cards: Card[]): HandRanking {
    const sorted = cards.sort((a, b) => b.value - a.value);
    const isFlush = this.isFlush(sorted);
    const isStraight = this.isStraight(sorted);

    if (isFlush && isStraight) {
      if (sorted[0]!.value === 14 && sorted[1]!.value === 13) {
        return { rank: 10, name: 'Royal Flush', cards: sorted, kickers: [] };
      }
      return { rank: 9, name: 'Straight Flush', cards: sorted, kickers: [] };
    }

    const groups = this.groupByRank(sorted);
    const groupSizes = Object.values(groups)
      .map(g => g.length)
      .sort((a, b) => b - a);

    if (groupSizes[0] === 4) {
      const fourOfAKind = Object.values(groups).find(g => g.length === 4)!;
      const kicker = Object.values(groups).find(g => g.length === 1)!;
      return { rank: 8, name: 'Four of a Kind', cards: fourOfAKind, kickers: kicker };
    }

    if (groupSizes[0] === 3 && groupSizes[1] === 2) {
      const three = Object.values(groups).find(g => g.length === 3)!;
      const pair = Object.values(groups).find(g => g.length === 2)!;
      return { rank: 7, name: 'Full House', cards: [...three, ...pair], kickers: [] };
    }

    if (isFlush) {
      return { rank: 6, name: 'Flush', cards: sorted, kickers: [] };
    }

    if (isStraight) {
      return { rank: 5, name: 'Straight', cards: sorted, kickers: [] };
    }

    if (groupSizes[0] === 3) {
      const three = Object.values(groups).find(g => g.length === 3)!;
      const kickers = Object.values(groups)
        .filter(g => g.length === 1)
        .flat();
      return { rank: 4, name: 'Three of a Kind', cards: three, kickers };
    }

    if (groupSizes[0] === 2 && groupSizes[1] === 2) {
      const pairs = Object.values(groups).filter(g => g.length === 2);
      const kicker = Object.values(groups).find(g => g.length === 1)!;
      return { rank: 3, name: 'Two Pair', cards: pairs.flat(), kickers: kicker };
    }

    if (groupSizes[0] === 2) {
      const pair = Object.values(groups).find(g => g.length === 2)!;
      const kickers = Object.values(groups)
        .filter(g => g.length === 1)
        .flat();
      return { rank: 2, name: 'Pair', cards: pair, kickers };
    }

    return { rank: 1, name: 'High Card', cards: [sorted[0]!], kickers: sorted.slice(1) };
  }

  private isFlush(cards: Card[]): boolean {
    return cards.every(card => card.suit === cards[0]!.suit);
  }

  private isStraight(cards: Card[]): boolean {
    const values = cards.map(c => c.value).sort((a, b) => a - b);

    // Check for regular straight
    for (let i = 1; i < values.length; i++) {
      if (values[i]! - values[i - 1]! !== 1) {
        // Check for A-2-3-4-5 straight (wheel)
        if (values.join(',') === '2,3,4,5,14') {
          return true;
        }
        return false;
      }
    }
    return true;
  }

  private groupByRank(cards: Card[]): { [rank: string]: Card[] } {
    const groups: { [rank: string]: Card[] } = {};
    for (const card of cards) {
      if (!groups[card.rank]) {
        groups[card.rank] = [];
      }
      groups[card.rank]!.push(card);
    }
    return groups;
  }

  private compareHands(hand1: HandRanking, hand2: HandRanking): number {
    if (hand1.rank !== hand2.rank) {
      return hand1.rank - hand2.rank;
    }

    // Compare by card values
    const values1 = hand1.cards.map(c => c.value).sort((a, b) => b - a);
    const values2 = hand2.cards.map(c => c.value).sort((a, b) => b - a);

    for (let i = 0; i < values1.length; i++) {
      if (values1[i] !== values2[i]) {
        return values1[i]! - values2[i]!;
      }
    }

    // Compare kickers
    const kickers1 = hand1.kickers.map(c => c.value).sort((a, b) => b - a);
    const kickers2 = hand2.kickers.map(c => c.value).sort((a, b) => b - a);

    for (let i = 0; i < Math.max(kickers1.length, kickers2.length); i++) {
      const k1 = kickers1[i] || 0;
      const k2 = kickers2[i] || 0;
      if (k1 !== k2) {
        return k1 - k2;
      }
    }

    return 0;
  }

  private determineWinners(state: PokerState): void {
    const activePlayers = Object.entries(state.players).filter(([_, p]) => !p.folded);

    if (activePlayers.length === 1) {
      state.winners = [activePlayers[0]![0]];
    } else {
      // Find best hand(s)
      let bestHand: HandRanking | null = null;
      const winners: string[] = [];

      for (const [playerId, player] of activePlayers) {
        if (!player.bestHand) {
          continue;
        }

        if (!bestHand || this.compareHands(player.bestHand, bestHand) > 0) {
          bestHand = player.bestHand;
          winners.length = 0;
          winners.push(playerId);
        } else if (this.compareHands(player.bestHand, bestHand) === 0) {
          winners.push(playerId);
        }
      }

      state.winners = winners;
    }

    // Distribute pot
    const potShare = Math.floor(state.pot / state.winners.length);
    for (const winnerId of state.winners) {
      state.players[winnerId]!.chips += potShare;
    }

    state.gameOver = true;
    state.gamePhase = 'finished';
  }

  private checkWinCondition(state: PokerState): void {
    const activePlayers = Object.entries(state.players).filter(([_, p]) => !p.folded);

    if (activePlayers.length === 1) {
      // Only one player left, they win
      const winnerId = activePlayers[0]![0];
      state.players[winnerId]!.chips += state.pot;
      state.winners = [winnerId];
      state.gameOver = true;
      state.gamePhase = 'finished';
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as PokerState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: state.gameOver,
      winner: state.winners.length === 1 ? state.winners[0] : null,
      winners: state.winners,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            hand: player.hand,
            chips: player.chips,
            currentBet: player.currentBet,
            folded: player.folded,
            allIn: player.allIn,
            isDealer: player.isDealer,
            isSmallBlind: player.isSmallBlind,
            isBigBlind: player.isBigBlind,
            bestHand: player.bestHand,
            isCurrentPlayer: state.currentPlayer === id,
            stats: player.stats,
          },
        ])
      ),
      communityCards: state.communityCards,
      pot: state.pot,
      currentBet: state.currentBet,
      currentPlayer: state.currentPlayer,
      gamePhase: state.gamePhase,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      lastAction: state.lastAction,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as PokerState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as PokerState;
    return state.winners.length === 1 ? state.winners[0]! : null;
  }

  getMetadata(): GameMetadata {
    return {
      name: "Poker (Texas Hold'em)",
      description:
        "Classic Texas Hold'em poker with betting rounds, community cards, and hand rankings",
      minPlayers: 2,
      maxPlayers: 10,
      estimatedDuration: '30-60 minutes',
      complexity: 'advanced',
      categories: ['card', 'betting', 'strategy', 'bluffing'],
    };
  }
}

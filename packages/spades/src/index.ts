import { InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';
/* eslint-disable no-unused-vars */
import { BaseGame } from '@llmletsplay/versus-game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@llmletsplay/versus-game-core';
import type { DatabaseProvider } from '@llmletsplay/versus-game-core';
import { createShuffledDeck, type CardWithValue } from '@llmletsplay/versus-game-core';

type Player = 'north' | 'south' | 'east' | 'west';
type Partnership = 'north-south' | 'east-west';

export interface SpadesState extends GameState {
  hands: { [player in Player]: CardWithValue[] };
  bids: { [player in Player]: number | null };
  tricks: { [player in Player]: number };
  currentTrick: {
    cards: { [player in Player]?: CardWithValue };
    leader: Player | null;
    winner: Player | null;
  };
  completedTricks: Array<{
    cards: { [player in Player]: CardWithValue };
    winner: Player;
  }>;
  scores: {
    'north-south': {
      score: number;
      bags: number;
      rounds: Array<{
        bid: number;
        made: number;
        score: number;
        bags: number;
      }>;
    };
    'east-west': {
      score: number;
      bags: number;
      rounds: Array<{
        bid: number;
        made: number;
        score: number;
        bags: number;
      }>;
    };
  };
  currentPlayer: Player;
  playerOrder: Player[];
  gamePhase: 'bidding' | 'playing' | 'scoring' | 'finished';
  roundNumber: number;
  gameOver: boolean;
  winner: Partnership | null;
  spadesBroken: boolean;
  lastAction: {
    action: string;
    player?: Player;
    card?: CardWithValue;
    bid?: number;
    details?: string;
  } | null;
  trickNumber: number;
  dealer: Player;
  bidOrder: Player[];
  nilBids: { [player in Player]: boolean };
  blindNilBids: { [player in Player]: boolean };
}

interface SpadesMove {
  player: Player;
  action: 'bid' | 'play';
  bid?: number;
  card?: CardWithValue;
  isNil?: boolean;
  isBlindNil?: boolean;
}

export class SpadesGame extends BaseGame {
  private readonly WINNING_SCORE = 500;
  private readonly BAG_PENALTY = 100;
  private readonly BAGS_PER_PENALTY = 10;

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'spades', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    // Spades is always 4 players in partnerships
    const playerOrder: Player[] = ['north', 'east', 'south', 'west'];
    const dealer: Player = 'south'; // Traditional starting dealer

    // Create and shuffle deck
    const deck = createShuffledDeck('POKER');

    // Deal 13 cards to each player
    const hands: { [player in Player]: CardWithValue[] } = {
      north: this.sortSpadeHand(deck.slice(0, 13)),
      east: this.sortSpadeHand(deck.slice(13, 26)),
      south: this.sortSpadeHand(deck.slice(26, 39)),
      west: this.sortSpadeHand(deck.slice(39, 52)),
    };

    // Bidding starts left of dealer
    const bidOrder = this.getBidOrder(dealer);

    const initialState: SpadesState = {
      gameId: this.gameId,
      gameType: this.gameType,
      hands,
      bids: { north: null, south: null, east: null, west: null },
      tricks: { north: 0, south: 0, east: 0, west: 0 },
      currentTrick: {
        cards: {},
        leader: null,
        winner: null,
      },
      completedTricks: [],
      scores: {
        'north-south': { score: 0, bags: 0, rounds: [] },
        'east-west': { score: 0, bags: 0, rounds: [] },
      },
      currentPlayer: bidOrder[0]!,
      playerOrder,
      gamePhase: 'bidding',
      roundNumber: 1,
      gameOver: false,
      winner: null,
      spadesBroken: false,
      lastAction: null,
      trickNumber: 0,
      dealer,
      bidOrder,
      nilBids: { north: false, south: false, east: false, west: false },
      blindNilBids: { north: false, south: false, east: false, west: false },
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private sortSpadeHand(hand: CardWithValue[]): CardWithValue[] {
    return hand.sort((a, b) => {
      // Spades are trump, so they come last
      const suitOrder = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };
      const suitDiff =
        suitOrder[a.suit as keyof typeof suitOrder] - suitOrder[b.suit as keyof typeof suitOrder];
      if (suitDiff !== 0) {
        return suitDiff;
      }
      return b.value - a.value; // High to low within suit
    });
  }

  private getBidOrder(dealer: Player): Player[] {
    const playerOrder: Player[] = ['north', 'east', 'south', 'west'];
    const dealerIndex = playerOrder.indexOf(dealer);
    const bidOrder: Player[] = [];

    // Bidding starts left of dealer
    for (let i = 1; i <= 4; i++) {
      const index = (dealerIndex + i) % 4;
      bidOrder.push(playerOrder[index]!);
    }

    return bidOrder;
  }

  private getPartnership(player: Player): Partnership {
    return player === 'north' || player === 'south' ? 'north-south' : 'east-west';
  }

  private getPartner(player: Player): Player {
    switch (player) {
      case 'north':
        return 'south';
      case 'south':
        return 'north';
      case 'east':
        return 'west';
      case 'west':
        return 'east';
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as SpadesMove;
      const state = this.currentState as SpadesState;

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['north', 'south', 'east', 'west'].includes(move.player)) {
        return { valid: false, error: 'Player must be north, south, east, or west' };
      }

      if (!['bid', 'play'].includes(move.action)) {
        return { valid: false, error: 'Action must be bid or play' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Validate bidding phase
      if (move.action === 'bid') {
        if (state.gamePhase !== 'bidding') {
          return { valid: false, error: 'Not in bidding phase' };
        }

        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn to bid` };
        }

        if (state.bids[move.player] !== null) {
          return { valid: false, error: 'Player has already bid' };
        }

        if (move.isBlindNil) {
          // Blind nil can only be bid before looking at cards (first round, certain conditions)
          if (state.roundNumber > 1) {
            const partnership = this.getPartnership(move.player);
            if (state.scores[partnership].score >= 0) {
              return { valid: false, error: 'Blind nil only allowed when partnership is behind' };
            }
          }
          move.bid = 0;
        } else if (move.isNil) {
          move.bid = 0;
        } else {
          if (typeof move.bid !== 'number' || move.bid < 1 || move.bid > 13) {
            return { valid: false, error: 'Bid must be between 1 and 13 (or nil)' };
          }
        }
      }

      // Validate playing phase
      if (move.action === 'play') {
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'Not in playing phase' };
        }

        if (move.player !== state.currentPlayer) {
          return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
        }

        if (!move.card) {
          return { valid: false, error: 'Must provide a card to play' };
        }

        // Check if player has this card
        const playerHand = state.hands[move.player];
        if (
          !playerHand.some(
            (handCard) => handCard.suit === move.card!.suit && handCard.rank === move.card!.rank
          )
        ) {
          return { valid: false, error: 'Player does not have this card' };
        }

        // Validate card play rules
        const cardValidation = this.validateCardPlay(move.card, move.player, state);
        if (!cardValidation.valid) {
          return cardValidation;
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateCardPlay(
    card: CardWithValue,
    player: Player,
    state: SpadesState
  ): MoveValidationResult {
    const trick = state.currentTrick;
    const playerHand = state.hands[player];

    // If leading, cannot lead spades unless spades broken or only spades left
    if (Object.keys(trick.cards).length === 0 && card.suit === 'spades' && !state.spadesBroken) {
      const hasNonSpades = playerHand.some((c) => c.suit !== 'spades');
      if (hasNonSpades) {
        return { valid: false, error: 'Cannot lead spades until spades are broken' };
      }
    }

    // Must follow suit if possible
    if (Object.keys(trick.cards).length > 0) {
      const leadSuit = this.getLeadSuit(trick);
      const hasLeadSuit = playerHand.some((c) => c.suit === leadSuit);

      if (hasLeadSuit && card.suit !== leadSuit) {
        return { valid: false, error: `Must follow suit (${leadSuit})` };
      }
    }

    return { valid: true };
  }

  private getLeadSuit(trick: SpadesState['currentTrick']): string {
    const cards = Object.values(trick.cards);
    return cards[0]?.suit || '';
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const spadesMove = move.moveData as SpadesMove;
    const state = this.currentState as SpadesState;

    if (spadesMove.action === 'bid') {
      this.makeBid(spadesMove, state);
    } else if (spadesMove.action === 'play') {
      this.playCard(spadesMove, state);
    }
  }

  private makeBid(move: SpadesMove, state: SpadesState): void {
    const bid = move.bid!;
    state.bids[move.player] = bid;

    // Track nil bids
    if (move.isNil) {
      state.nilBids[move.player] = true;
    }
    if (move.isBlindNil) {
      state.blindNilBids[move.player] = true;
    }

    state.lastAction = {
      action: 'bid',
      player: move.player,
      bid,
      details: move.isBlindNil
        ? `${move.player} bid blind nil`
        : move.isNil
          ? `${move.player} bid nil`
          : `${move.player} bid ${bid}`,
    };

    // Check if all players have bid
    if (Object.values(state.bids).every((bid) => bid !== null)) {
      this.startPlayingPhase(state);
    } else {
      // Move to next bidder
      this.moveToNextBidder(state);
    }
  }

  private moveToNextBidder(state: SpadesState): void {
    const currentIndex = state.bidOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.bidOrder.length;
    state.currentPlayer = state.bidOrder[nextIndex]!;
  }

  private startPlayingPhase(state: SpadesState): void {
    state.gamePhase = 'playing';

    // First trick is led by player left of dealer
    const dealerIndex = state.playerOrder.indexOf(state.dealer);
    const firstLeader = state.playerOrder[(dealerIndex + 1) % 4]!;
    state.currentPlayer = firstLeader;

    state.lastAction = {
      action: 'start_playing',
      details: 'Bidding complete. Playing phase begins.',
    };
  }

  private playCard(move: SpadesMove, state: SpadesState): void {
    const card = move.card!;
    const player = move.player;

    // Remove card from player's hand
    const playerHand = state.hands[player];
    const cardIndex = playerHand.findIndex(
      (handCard) => handCard.suit === card.suit && handCard.rank === card.rank
    );
    if (cardIndex !== -1) {
      playerHand.splice(cardIndex, 1);
    }

    // Add card to current trick
    state.currentTrick.cards[player] = card;

    // Set trick leader if this is the first card
    if (Object.keys(state.currentTrick.cards).length === 1) {
      state.currentTrick.leader = player;
    }

    // Check if spades are broken
    if (card.suit === 'spades') {
      state.spadesBroken = true;
    }

    state.lastAction = {
      action: 'play',
      player,
      card,
      details: `${player} played ${card.rank} of ${card.suit}`,
    };

    // Check if trick is complete
    if (Object.keys(state.currentTrick.cards).length === 4) {
      this.completeTrick(state);
    } else {
      // Move to next player
      this.moveToNextPlayer(state);
    }
  }

  private completeTrick(state: SpadesState): void {
    const trick = state.currentTrick;
    const winner = this.determineTrickWinner(trick);

    // Add to completed tricks
    state.completedTricks.push({
      cards: { ...trick.cards } as { [player in Player]: CardWithValue },
      winner,
    });

    // Increment trick count for winner
    state.tricks[winner]++;

    // Reset current trick
    state.currentTrick = {
      cards: {},
      leader: null,
      winner,
    };

    state.trickNumber++;

    // Winner leads next trick
    state.currentPlayer = winner;

    state.lastAction = {
      action: 'trick_complete',
      player: winner,
      details: `${winner} wins trick ${state.trickNumber}`,
    };

    // Check if round is complete (all 13 tricks played)
    if (state.completedTricks.length === 13) {
      this.endRound(state);
    }
  }

  private determineTrickWinner(trick: SpadesState['currentTrick']): Player {
    const leadSuit = this.getLeadSuit(trick);
    let winner: Player = trick.leader!;
    let highestSpade: CardWithValue | null = null;
    let highestLead: CardWithValue | null = null;

    // Find highest spade and highest card of lead suit
    for (const [player, card] of Object.entries(trick.cards) as [Player, CardWithValue][]) {
      if (card.suit === 'spades') {
        if (!highestSpade || card.value > highestSpade.value) {
          highestSpade = card;
          winner = player;
        }
      } else if (card.suit === leadSuit) {
        if (!highestLead || card.value > highestLead.value) {
          highestLead = card;
          if (!highestSpade) {
            // Only update winner if no spades played
            winner = player;
          }
        }
      }
    }

    return winner;
  }

  private moveToNextPlayer(state: SpadesState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  private endRound(state: SpadesState): void {
    // Calculate scores for each partnership
    this.calculateRoundScores(state);

    // Check for game end
    const nsScore = state.scores['north-south'].score;
    const ewScore = state.scores['east-west'].score;

    if (nsScore >= this.WINNING_SCORE || ewScore >= this.WINNING_SCORE) {
      this.endGame(state);
    } else {
      this.startNewRound(state);
    }
  }

  private calculateRoundScores(state: SpadesState): void {
    for (const partnership of ['north-south', 'east-west'] as Partnership[]) {
      const players = partnership === 'north-south' ? ['north', 'south'] : ['east', 'west'];
      const player1 = players[0] as Player;
      const player2 = players[1] as Player;

      const bid1 = state.bids[player1]!;
      const bid2 = state.bids[player2]!;
      const tricks1 = state.tricks[player1];
      const tricks2 = state.tricks[player2];

      const totalBid = bid1 + bid2;
      const totalTricks = tricks1 + tricks2;

      let roundScore = 0;
      let bags = 0;

      // Handle nil bids separately
      let nilSuccess = true;
      let nilBonus = 0;

      // Check nil bids
      for (const player of players as Player[]) {
        if (state.nilBids[player] || state.blindNilBids[player]) {
          const playerTricks = state.tricks[player];
          if (playerTricks === 0) {
            // Nil successful
            nilBonus += state.blindNilBids[player] ? 200 : 100;
          } else {
            // Nil failed
            nilSuccess = false;
            roundScore -= state.blindNilBids[player] ? 200 : 100;
          }
        }
      }

      // Calculate regular bid scoring if no nil or partner made non-nil bid
      const nonNilBid =
        bid1 + bid2 - (state.nilBids[player1] ? 0 : bid1) - (state.nilBids[player2] ? 0 : bid2);
      const nonNilTricks = totalTricks;

      if (nonNilBid > 0) {
        if (nonNilTricks >= nonNilBid) {
          // Made bid
          roundScore += nonNilBid * 10;
          bags = nonNilTricks - nonNilBid;
        } else {
          // Failed bid
          roundScore -= nonNilBid * 10;
        }
      }

      // Add nil bonus
      roundScore += nilBonus;

      // Update partnership score
      const partnershipScore = state.scores[partnership];
      partnershipScore.score += roundScore;
      partnershipScore.bags += bags;

      // Check for bag penalty
      if (partnershipScore.bags >= this.BAGS_PER_PENALTY) {
        partnershipScore.score -= this.BAG_PENALTY;
        partnershipScore.bags -= this.BAGS_PER_PENALTY;
      }

      // Record round
      partnershipScore.rounds.push({
        bid: totalBid,
        made: totalTricks,
        score: roundScore,
        bags,
      });
    }

    state.lastAction = {
      action: 'round_complete',
      details: `Round ${state.roundNumber} complete. Scores updated.`,
    };
  }

  private startNewRound(state: SpadesState): void {
    state.roundNumber++;
    state.gamePhase = 'bidding';

    // Rotate dealer
    const dealerIndex = state.playerOrder.indexOf(state.dealer);
    state.dealer = state.playerOrder[(dealerIndex + 1) % 4]!;
    state.bidOrder = this.getBidOrder(state.dealer);

    // Reset round state
    state.bids = { north: null, south: null, east: null, west: null };
    state.tricks = { north: 0, south: 0, east: 0, west: 0 };
    state.completedTricks = [];
    state.spadesBroken = false;
    state.trickNumber = 0;
    state.currentTrick = { cards: {}, leader: null, winner: null };
    state.nilBids = { north: false, south: false, east: false, west: false };
    state.blindNilBids = { north: false, south: false, east: false, west: false };

    // Deal new hands
    const deck = createShuffledDeck('POKER');
    state.hands = {
      north: this.sortSpadeHand(deck.slice(0, 13)),
      east: this.sortSpadeHand(deck.slice(13, 26)),
      south: this.sortSpadeHand(deck.slice(26, 39)),
      west: this.sortSpadeHand(deck.slice(39, 52)),
    };

    // Set current player to first bidder
    state.currentPlayer = state.bidOrder[0]!;

    state.lastAction = {
      action: 'new_round',
      details: `Round ${state.roundNumber} started. ${state.dealer} is dealer.`,
    };
  }

  private endGame(state: SpadesState): void {
    const nsScore = state.scores['north-south'].score;
    const ewScore = state.scores['east-west'].score;

    // Determine winner (highest score, or first to reach winning score)
    let winner: Partnership;
    if (nsScore >= this.WINNING_SCORE && ewScore >= this.WINNING_SCORE) {
      winner = nsScore > ewScore ? 'north-south' : 'east-west';
    } else if (nsScore >= this.WINNING_SCORE) {
      winner = 'north-south';
    } else {
      winner = 'east-west';
    }

    state.gameOver = true;
    state.winner = winner;
    state.gamePhase = 'finished';

    const winningScore = state.scores[winner].score;
    state.lastAction = {
      action: 'game_end',
      details: `${winner} wins with ${winningScore} points!`,
    };
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as SpadesState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      hands: state.hands,
      bids: state.bids,
      tricks: state.tricks,
      currentTrick: state.currentTrick,
      completedTricks: state.completedTricks,
      scores: state.scores,
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      roundNumber: state.roundNumber,
      spadesBroken: state.spadesBroken,
      lastAction: state.lastAction,
      trickNumber: state.trickNumber,
      dealer: state.dealer,
      bidOrder: state.bidOrder,
      nilBids: state.nilBids,
      blindNilBids: state.blindNilBids,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as SpadesState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as SpadesState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Spades',
      description: 'Partnership trick-taking card game with bidding and trump suit',
      minPlayers: 4,
      maxPlayers: 4,
      estimatedDuration: '45-90 minutes',
      complexity: 'intermediate',
      categories: ['card', 'trick-taking', 'partnership', 'bidding', 'strategy'],
    };
  }
}

export function createSpadesGame(
  gameId: string,
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): SpadesGame {
  return new SpadesGame(gameId, database);
}


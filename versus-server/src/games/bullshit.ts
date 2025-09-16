import { BaseGame } from '../core/base-game.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
}

interface BullshitState extends GameState {
  players: {
    [playerId: string]: {
      hand: Card[];
      handSize: number; // For public display
    };
  };
  discardPile: Card[];
  currentPlayer: string;
  playerOrder: string[];
  currentRank: Rank | null; // What rank should be played this turn
  lastPlay: {
    playerId: string;
    claimedRank: Rank;
    cardCount: number;
    cardsPlayed: Card[];
  } | null;
  gamePhase: 'playing' | 'challenge' | 'finished';
  challengePhase: {
    challenger: string | null;
    target: string | null;
    resolved: boolean;
  } | null;
  gameOver: boolean;
  winner: string | null;
  lastAction: {
    action: 'play' | 'challenge' | 'pass' | 'penalty';
    player?: string;
    details?: string;
  } | null;
}

interface BullshitMove {
  player: string;
  action: 'play' | 'challenge';
  cards?: Card[]; // For play action
  claimedRank?: Rank; // For play action
}

export class BullshitGame extends BaseGame {
  private rankOrder: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  constructor(gameId: string) {
    super(gameId, 'bullshit');
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // Bullshit supports 3-8 players typically
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 3), 8);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: BullshitState['players'] = {};

    // Deal all cards evenly to players
    const cardsPerPlayer = Math.floor(52 / playerCount);
    let deckIndex = 0;

    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i]!;
      const hand = deck.slice(deckIndex, deckIndex + cardsPerPlayer);
      players[playerId] = {
        hand: this.sortHand(hand),
        handSize: hand.length,
      };
      deckIndex += cardsPerPlayer;
    }

    // Distribute remaining cards
    for (let i = 0; i < 52 % playerCount; i++) {
      const playerId = playerIds[i]!;
      players[playerId]!.hand.push(deck[deckIndex + i]!);
      players[playerId]!.handSize++;
    }

    // Sort all hands
    for (const player of Object.values(players)) {
      player.hand = this.sortHand(player.hand);
    }

    const initialState: BullshitState = {
      gameId: this.gameId,
      gameType: this.gameType,
      players,
      discardPile: [],
      currentPlayer: playerIds[0]!,
      playerOrder: playerIds,
      currentRank: 'A', // Start with Aces
      lastPlay: null,
      gamePhase: 'playing',
      challengePhase: null,
      gameOver: false,
      winner: null,
      lastAction: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createDeck(): Card[] {
    const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: Card[] = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
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

  private sortHand(hand: Card[]): Card[] {
    return hand.sort((a, b) => {
      const rankA = this.rankOrder.indexOf(a.rank);
      const rankB = this.rankOrder.indexOf(b.rank);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.suit.localeCompare(b.suit);
    });
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as BullshitMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['play', 'challenge'].includes(move.action)) {
        return { valid: false, error: 'Action must be play or challenge' };
      }

      const state = this.currentState as BullshitState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      const player = state.players[move.player];
      if (!player) {
        return { valid: false, error: 'Invalid player' };
      }

      if (move.action === 'play') {
        // Must be current player's turn
        if (state.currentPlayer !== move.player) {
          return { valid: false, error: 'Not your turn' };
        }

        // Must be in playing phase
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'Cannot play cards during challenge phase' };
        }

        // Must provide cards and claimed rank
        if (!move.cards || !move.claimedRank || move.cards.length === 0) {
          return { valid: false, error: 'Must provide cards and claimed rank' };
        }

        // Can't play more than 4 cards of the same rank
        if (move.cards.length > 4) {
          return { valid: false, error: 'Cannot play more than 4 cards at once' };
        }

        // Claimed rank must match current rank
        if (move.claimedRank !== state.currentRank) {
          return { valid: false, error: `Must claim rank ${state.currentRank}` };
        }

        // Player must have the cards they're trying to play
        for (const card of move.cards) {
          const hasCard = player.hand.some(h => h.suit === card.suit && h.rank === card.rank);
          if (!hasCard) {
            return {
              valid: false,
              error: 'You do not have one or more of the cards you are trying to play',
            };
          }
        }

        return { valid: true };
      }

      if (move.action === 'challenge') {
        // Must not be the player who just played
        if (!state.lastPlay || state.lastPlay.playerId === move.player) {
          return {
            valid: false,
            error: 'Cannot challenge your own play or when no play to challenge',
          };
        }

        // Must be in playing phase (challenge happens immediately after play)
        if (state.gamePhase !== 'playing') {
          return { valid: false, error: 'No play to challenge' };
        }

        return { valid: true };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const bullshitMove = move.moveData as BullshitMove;
    const state = this.currentState as BullshitState;

    if (bullshitMove.action === 'play') {
      this.playCards(state, bullshitMove.player, bullshitMove.cards!, bullshitMove.claimedRank!);
    } else if (bullshitMove.action === 'challenge') {
      this.challengePlay(state, bullshitMove.player);
    }

    // Check win condition
    this.checkWinCondition(state);
  }

  private playCards(
    state: BullshitState,
    playerId: string,
    cards: Card[],
    claimedRank: Rank
  ): void {
    const player = state.players[playerId]!;

    // Remove cards from player's hand
    for (const card of cards) {
      const index = player.hand.findIndex(h => h.suit === card.suit && h.rank === card.rank);
      if (index >= 0) {
        player.hand.splice(index, 1);
      }
    }

    player.handSize = player.hand.length;

    // Add cards to discard pile (face down)
    state.discardPile.push(...cards);

    // Record the play
    state.lastPlay = {
      playerId,
      claimedRank,
      cardCount: cards.length,
      cardsPlayed: cards,
    };

    // Move to next rank in sequence
    const currentRankIndex = this.rankOrder.indexOf(state.currentRank!);
    state.currentRank = this.rankOrder[(currentRankIndex + 1) % this.rankOrder.length]!;

    // Move to next player
    const currentPlayerIndex = state.playerOrder.indexOf(state.currentPlayer);
    state.currentPlayer = state.playerOrder[(currentPlayerIndex + 1) % state.playerOrder.length]!;

    state.lastAction = {
      action: 'play',
      player: playerId,
      details: `${playerId} played ${cards.length} card(s) claiming ${claimedRank}`,
    };
  }

  private challengePlay(state: BullshitState, challengerId: string): void {
    if (!state.lastPlay) {
      return;
    }

    const lastPlay = state.lastPlay;
    const claimedRank = lastPlay.claimedRank;
    const actualCards = lastPlay.cardsPlayed;

    // Check if all played cards match the claimed rank
    const allMatch = actualCards.every(card => card.rank === claimedRank);

    const discardPileSize = state.discardPile.length;

    if (allMatch) {
      // Challenge failed - challenger takes all discard pile cards
      const challenger = state.players[challengerId]!;
      challenger.hand.push(...state.discardPile);
      challenger.hand = this.sortHand(challenger.hand);
      challenger.handSize = challenger.hand.length;

      state.lastAction = {
        action: 'challenge',
        player: challengerId,
        details: `${challengerId} challenged ${lastPlay.playerId} unsuccessfully and takes ${discardPileSize} cards`,
      };
    } else {
      // Challenge successful - last player takes all discard pile cards
      const target = state.players[lastPlay.playerId]!;
      target.hand.push(...state.discardPile);
      target.hand = this.sortHand(target.hand);
      target.handSize = target.hand.length;

      // Current player becomes the challenger (they get to play next)
      state.currentPlayer = challengerId;

      state.lastAction = {
        action: 'challenge',
        player: challengerId,
        details: `${challengerId} successfully challenged ${lastPlay.playerId} who takes ${discardPileSize} cards`,
      };
    }

    // Clear discard pile and last play
    state.discardPile = [];
    state.lastPlay = null;
  }

  private checkWinCondition(state: BullshitState): void {
    // Check if any player has no cards left
    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.hand.length === 0) {
        state.gameOver = true;
        state.winner = playerId;
        state.gamePhase = 'finished';
        break;
      }
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as BullshitState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: state.gameOver,
      winner: state.winner,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            handSize: player.handSize,
            hand: player.hand, // In real game, this would be hidden from other players
            isCurrentPlayer: state.currentPlayer === id,
          },
        ])
      ),
      currentPlayer: state.currentPlayer,
      currentRank: state.currentRank,
      discardPileSize: state.discardPile.length,
      lastPlay: state.lastPlay
        ? {
            playerId: state.lastPlay.playerId,
            claimedRank: state.lastPlay.claimedRank,
            cardCount: state.lastPlay.cardCount,
          }
        : null,
      gamePhase: state.gamePhase,
      lastAction: state.lastAction,
      canChallenge: state.lastPlay !== null && state.gamePhase === 'playing',
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as BullshitState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as BullshitState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Bullshit',
      description:
        'Card game where players try to get rid of all cards by playing them face down and claiming ranks, while others can call their bluff',
      minPlayers: 3,
      maxPlayers: 8,
      estimatedDuration: '15-30 minutes',
      complexity: 'intermediate',
      categories: ['card', 'bluffing', 'strategy'],
    };
  }
}

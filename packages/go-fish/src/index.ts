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

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
}

interface GoFishState extends GameState {
  deck: Card[];
  players: {
    [playerId: string]: {
      hand: Card[];
      books: Rank[]; // Completed sets of 4 cards
    };
  };
  currentPlayer: string;
  gameOver: boolean;
  winner: string | null;
  playerOrder: string[];
  lastAction: {
    player: string;
    action: 'ask' | 'fish';
    rank?: Rank;
    target?: string;
    result: 'success' | 'go_fish';
    cardsReceived?: number;
  } | null;
}

interface GoFishMove {
  player: string;
  action: 'ask';
  rank: Rank;
  target: string;
}

export class GoFishGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'go-fish', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // Default to 4 players, but support 2-6
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 6);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: GoFishState['players'] = {};

    // Deal cards (7 for 2-3 players, 5 for 4+ players)
    const cardsPerPlayer = playerCount <= 3 ? 7 : 5;
    let deckIndex = 0;

    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i]!;
      players[playerId] = {
        hand: deck.slice(deckIndex, deckIndex + cardsPerPlayer),
        books: [],
      };
      deckIndex += cardsPerPlayer;
    }

    // Remove dealt cards from deck
    const remainingDeck = deck.slice(deckIndex);

    const initialState: GoFishState = {
      gameId: this.gameId,
      gameType: this.gameType,
      deck: remainingDeck,
      players,
      currentPlayer: playerIds[0]!,
      gameOver: false,
      winner: null,
      playerOrder: playerIds,
      lastAction: null,
    };

    // Check for initial books
    for (const playerId of playerIds) {
      this.checkAndRemoveBooks(initialState, playerId);
    }

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

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as GoFishMove;

      if (!move.player || !move.action || !move.rank || !move.target) {
        return { valid: false, error: 'Move must include player, action, rank, and target' };
      }

      if (move.action !== 'ask') {
        return { valid: false, error: 'Action must be ask' };
      }

      const state = this.currentState as GoFishState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      const player = state.players[move.player];
      const targetPlayer = state.players[move.target];

      if (!player) {
        return { valid: false, error: 'Invalid player' };
      }

      if (!targetPlayer) {
        return { valid: false, error: 'Invalid target player' };
      }

      if (move.player === move.target) {
        return { valid: false, error: 'Cannot ask yourself for cards' };
      }

      // Check if player has at least one card of the requested rank
      const hasRank = player.hand.some((card) => card.rank === move.rank);
      if (!hasRank) {
        return { valid: false, error: `You must have at least one ${move.rank} to ask for it` };
      }

      // Check if rank is valid
      const validRanks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      if (!validRanks.includes(move.rank)) {
        return { valid: false, error: 'Invalid rank' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const goFishMove = move.moveData as GoFishMove;
    const state = this.currentState as GoFishState;

    const player = state.players[goFishMove.player]!;
    const targetPlayer = state.players[goFishMove.target]!;

    // Find cards of requested rank in target's hand
    const requestedCards = targetPlayer.hand.filter((card) => card.rank === goFishMove.rank);

    if (requestedCards.length > 0) {
      // Transfer all cards of that rank to asking player
      for (const card of requestedCards) {
        const index = targetPlayer.hand.findIndex(
          (c) => c.suit === card.suit && c.rank === card.rank
        );
        if (index !== -1) {
          const removedCard = targetPlayer.hand.splice(index, 1)[0]!;
          player.hand.push(removedCard);
        }
      }

      state.lastAction = {
        player: goFishMove.player,
        action: 'ask',
        rank: goFishMove.rank,
        target: goFishMove.target,
        result: 'success',
        cardsReceived: requestedCards.length,
      };

      // Player gets another turn after successful ask
    } else {
      // Go fish - draw from deck
      if (state.deck.length > 0) {
        const drawnCard = state.deck.pop()!;
        player.hand.push(drawnCard);
      }

      state.lastAction = {
        player: goFishMove.player,
        action: 'fish',
        rank: goFishMove.rank,
        target: goFishMove.target,
        result: 'go_fish',
      };

      // Move to next player
      this.moveToNextPlayer(state);
    }

    // Check for books after the move
    this.checkAndRemoveBooks(state, goFishMove.player);

    // Check win condition
    this.checkWinCondition(state);
  }

  private checkAndRemoveBooks(state: GoFishState, playerId: string): void {
    const player = state.players[playerId]!;
    const rankCounts: { [rank: string]: Card[] } = {};

    // Count cards by rank
    for (const card of player.hand) {
      if (!rankCounts[card.rank]) {
        rankCounts[card.rank] = [];
      }
      rankCounts[card.rank]!.push(card);
    }

    // Remove complete books (sets of 4)
    for (const [rank, cards] of Object.entries(rankCounts)) {
      if (cards.length === 4) {
        // Remove all 4 cards from hand
        for (const card of cards) {
          const index = player.hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
          if (index !== -1) {
            player.hand.splice(index, 1);
          }
        }
        // Add to books
        player.books.push(rank as Rank);
      }
    }
  }

  private checkWinCondition(state: GoFishState): void {
    // Game ends when all books are collected or a player runs out of cards
    const totalBooks = Object.values(state.players).reduce(
      (sum, player) => sum + player.books.length,
      0
    );
    const maxPossibleBooks = 13; // 13 ranks in a deck

    // Check if all books are collected
    if (totalBooks === maxPossibleBooks) {
      state.gameOver = true;
      // Winner is player with most books
      let maxBooks = 0;
      let winner = null;

      for (const [playerId, player] of Object.entries(state.players)) {
        if (player.books.length > maxBooks) {
          maxBooks = player.books.length;
          winner = playerId;
        }
      }

      state.winner = winner;
      return;
    }

    // Check if any player has no cards and deck is empty
    const playersWithCards = Object.values(state.players).filter(
      (player) => player.hand.length > 0
    );
    if (playersWithCards.length <= 1 || state.deck.length === 0) {
      state.gameOver = true;

      // Winner is player with most books
      let maxBooks = 0;
      let winner = null;

      for (const [playerId, player] of Object.entries(state.players)) {
        if (player.books.length > maxBooks) {
          maxBooks = player.books.length;
          winner = playerId;
        }
      }

      state.winner = winner;
    }
  }

  private moveToNextPlayer(state: GoFishState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as GoFishState;

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
            handSize: player.hand.length,
            books: player.books,
            bookCount: player.books.length,
          },
        ])
      ),
      deckSize: state.deck.length,
      lastAction: state.lastAction,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as GoFishState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as GoFishState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Go Fish',
      description:
        'Classic card game where players ask each other for cards to collect books of four',
      minPlayers: 2,
      maxPlayers: 6,
      estimatedDuration: '10-20 minutes',
      complexity: 'beginner',
      categories: ['card', 'classic', 'family'],
    };
  }
}

export function createGoFishGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): GoFishGame {
  return new GoFishGame(gameId, database);
}

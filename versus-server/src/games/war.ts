import { BaseGame } from '../core/base-game.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';
import { DatabaseProvider } from '../core/database.js';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // For comparison (A=1, 2=2, ..., K=13)
}

interface WarState extends GameState {
  players: {
    [playerId: string]: {
      deck: Card[];
      cardsWon: Card[];
    };
  };
  currentBattle: {
    cardsPlayed: { [playerId: string]: Card[] };
    warCards: { [playerId: string]: Card[] }; // Face-down cards during war
    battleType: 'normal' | 'war';
    round: number;
  } | null;
  gameOver: boolean;
  winner: string | null;
  playerOrder: string[];
  gamePhase: 'dealing' | 'playing' | 'finished';
  lastAction: {
    action: 'play' | 'war' | 'collect';
    winner?: string;
    cardsWon?: number;
    battleResult?: string;
  } | null;
}

interface WarMove {
  player: string;
  action: 'play' | 'continue';
}

export class WarGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'war', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // War is typically a 2-player game
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 4);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: WarState['players'] = {};

    // Deal all cards evenly to players
    const cardsPerPlayer = Math.floor(52 / playerCount);
    let deckIndex = 0;

    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i]!;
      players[playerId] = {
        deck: deck.slice(deckIndex, deckIndex + cardsPerPlayer),
        cardsWon: [],
      };
      deckIndex += cardsPerPlayer;
    }

    const initialState: WarState = {
      gameId: this.gameId,
      gameType: this.gameType,
      players,
      currentBattle: null,
      gameOver: false,
      winner: null,
      playerOrder: playerIds,
      gamePhase: 'playing',
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
      for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i]!;
        deck.push({
          suit,
          rank,
          value: i + 1, // A=1, 2=2, ..., K=13
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

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as WarMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['play', 'continue'].includes(move.action)) {
        return { valid: false, error: 'Action must be play or continue' };
      }

      const state = this.currentState as WarState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      const player = state.players[move.player];
      if (!player) {
        return { valid: false, error: 'Invalid player' };
      }

      // Check if player has cards to play
      if (player.deck.length === 0) {
        return { valid: false, error: 'Player has no cards left to play' };
      }

      if (move.action === 'play') {
        // Can only play if no current battle or it's a new round
        if (state.currentBattle && state.currentBattle.cardsPlayed[move.player]) {
          return { valid: false, error: 'Player has already played this round' };
        }
        return { valid: true };
      }

      if (move.action === 'continue') {
        // Can only continue during a war situation
        if (!state.currentBattle || state.currentBattle.battleType !== 'war') {
          return { valid: false, error: 'No war in progress' };
        }
        return { valid: true };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const warMove = move.moveData as WarMove;
    const state = this.currentState as WarState;

    if (warMove.action === 'play') {
      this.playCard(state, warMove.player);
    } else if (warMove.action === 'continue') {
      this.continueWar(state, warMove.player);
    }

    // Check if all players have played
    if (this.allPlayersHavePlayed(state)) {
      this.resolveBattle(state);
    }

    // Check win condition
    this.checkWinCondition(state);
  }

  private playCard(state: WarState, playerId: string): void {
    const player = state.players[playerId]!;

    if (!state.currentBattle) {
      // Start new battle
      state.currentBattle = {
        cardsPlayed: {},
        warCards: {},
        battleType: 'normal',
        round: 1,
      };
    }

    // Play top card from deck
    const card = player.deck.shift()!;
    state.currentBattle.cardsPlayed[playerId] = [card];

    state.lastAction = {
      action: 'play',
      battleResult: `${playerId} played ${card.rank} of ${card.suit}`,
    };
  }

  private continueWar(state: WarState, playerId: string): void {
    const player = state.players[playerId]!;
    const battle = state.currentBattle!;

    // Place face-down cards (war cards)
    const warCards: Card[] = [];
    for (let i = 0; i < 3 && player.deck.length > 0; i++) {
      warCards.push(player.deck.shift()!);
    }

    // Play the battle card
    if (player.deck.length > 0) {
      const battleCard = player.deck.shift()!;
      battle.cardsPlayed[playerId] = [battleCard];
      battle.warCards[playerId] = warCards;
    }

    state.lastAction = {
      action: 'war',
      battleResult: `${playerId} went to war with ${warCards.length} face-down cards`,
    };
  }

  private allPlayersHavePlayed(state: WarState): boolean {
    if (!state.currentBattle) {
      return false;
    }

    const activePlayers = state.playerOrder.filter(p => state.players[p]!.deck.length > 0);
    return activePlayers.every(p => state.currentBattle!.cardsPlayed[p]);
  }

  private resolveBattle(state: WarState): void {
    const battle = state.currentBattle!;
    const playedCards = battle.cardsPlayed;

    // Find highest card value
    let highestValue = 0;
    let winners: string[] = [];

    for (const [playerId, cards] of Object.entries(playedCards)) {
      const card = cards[0]!;
      if (card.value > highestValue) {
        highestValue = card.value;
        winners = [playerId];
      } else if (card.value === highestValue) {
        winners.push(playerId);
      }
    }

    if (winners.length === 1) {
      // Single winner takes all cards
      const winner = winners[0]!;
      this.collectCards(state, winner);
      state.currentBattle = null;

      state.lastAction = {
        action: 'collect',
        winner,
        cardsWon: this.countBattleCards(battle),
        battleResult: `${winner} wins the battle!`,
      };
    } else {
      // War! Multiple players tied
      battle.battleType = 'war';
      battle.round++;

      // Remove players who don't have enough cards for war
      const eligiblePlayers = winners.filter(p => state.players[p]!.deck.length >= 4);

      if (eligiblePlayers.length === 1) {
        // Only one player can continue war, they win
        const winner = eligiblePlayers[0]!;
        this.collectCards(state, winner);
        state.currentBattle = null;

        state.lastAction = {
          action: 'collect',
          winner,
          cardsWon: this.countBattleCards(battle),
          battleResult: `${winner} wins by default (others can't continue war)!`,
        };
      } else if (eligiblePlayers.length === 0) {
        // No one can continue, split the cards
        this.splitCards(state);
        state.currentBattle = null;

        state.lastAction = {
          action: 'collect',
          battleResult: 'Cards split due to insufficient cards for war',
        };
      } else {
        // Reset for war round
        battle.cardsPlayed = {};

        state.lastAction = {
          action: 'war',
          battleResult: `War! ${eligiblePlayers.length} players tied with ${this.getCardRankName(highestValue)}`,
        };
      }
    }
  }

  private collectCards(state: WarState, winnerId: string): void {
    const battle = state.currentBattle!;
    const winner = state.players[winnerId]!;
    const allCards: Card[] = [];

    // Collect all played cards
    for (const cards of Object.values(battle.cardsPlayed)) {
      allCards.push(...cards);
    }

    // Collect all war cards
    for (const cards of Object.values(battle.warCards)) {
      allCards.push(...cards);
    }

    // Shuffle and add to winner's won cards
    this.shuffleDeck(allCards);
    winner.cardsWon.push(...allCards);
  }

  private splitCards(state: WarState): void {
    const battle = state.currentBattle!;
    const allCards: Card[] = [];

    // Collect all cards
    for (const cards of Object.values(battle.cardsPlayed)) {
      allCards.push(...cards);
    }
    for (const cards of Object.values(battle.warCards)) {
      allCards.push(...cards);
    }

    // Split evenly among active players
    const activePlayers = state.playerOrder.filter(p => state.players[p]!.deck.length > 0);
    const cardsPerPlayer = Math.floor(allCards.length / activePlayers.length);

    this.shuffleDeck(allCards);

    for (let i = 0; i < activePlayers.length; i++) {
      const playerId = activePlayers[i]!;
      const startIndex = i * cardsPerPlayer;
      const endIndex = startIndex + cardsPerPlayer;
      state.players[playerId]!.cardsWon.push(...allCards.slice(startIndex, endIndex));
    }
  }

  private countBattleCards(battle: WarState['currentBattle']): number {
    let count = 0;
    if (battle) {
      for (const cards of Object.values(battle.cardsPlayed)) {
        count += cards.length;
      }
      for (const cards of Object.values(battle.warCards)) {
        count += cards.length;
      }
    }
    return count;
  }

  private getCardRankName(value: number): string {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return ranks[value - 1] || 'Unknown';
  }

  private checkWinCondition(state: WarState): void {
    // Reshuffle won cards back into deck when deck is empty
    for (const player of Object.values(state.players)) {
      if (player.deck.length === 0 && player.cardsWon.length > 0) {
        this.shuffleDeck(player.cardsWon);
        player.deck = player.cardsWon;
        player.cardsWon = [];
      }
    }

    // Check for winner (player with all cards)
    const activePlayers = state.playerOrder.filter(p => {
      const player = state.players[p]!;
      return player.deck.length > 0 || player.cardsWon.length > 0;
    });

    if (activePlayers.length === 1) {
      state.gameOver = true;
      state.winner = activePlayers[0]!;
      state.gamePhase = 'finished';
    }
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as WarState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      gameOver: state.gameOver,
      winner: state.winner,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            deckSize: player.deck.length,
            cardsWonSize: player.cardsWon.length,
            totalCards: player.deck.length + player.cardsWon.length,
            isActive: player.deck.length > 0 || player.cardsWon.length > 0,
          },
        ])
      ),
      currentBattle: state.currentBattle
        ? {
            battleType: state.currentBattle.battleType,
            round: state.currentBattle.round,
            playersInBattle: Object.keys(state.currentBattle.cardsPlayed),
            cardsInPlay: this.countBattleCards(state.currentBattle),
          }
        : null,
      gamePhase: state.gamePhase,
      lastAction: state.lastAction,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as WarState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as WarState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'War',
      description:
        'Classic card game where players compete by playing cards, highest card wins the battle',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '5-15 minutes',
      complexity: 'beginner',
      categories: ['card', 'classic', 'luck'],
    };
  }

  private distributeCards(state: WarState): void {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    const playerIds = Object.keys(state.players);
    const cardsPerPlayer = Math.floor(deck.length / playerIds.length);

    for (const [index, _playerId] of playerIds.entries()) {
      const startIndex = index * cardsPerPlayer;
      const endIndex = startIndex + cardsPerPlayer;
      state.players[_playerId]!.deck = deck.slice(startIndex, endIndex);
    }
  }
}

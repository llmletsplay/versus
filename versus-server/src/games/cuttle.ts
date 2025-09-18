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
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // Point value for scoring
}

interface CuttleState extends GameState {
  deck: Card[];
  players: {
    [playerId: string]: {
      hand: Card[];
      field: Card[]; // Point cards on the field
      faceCards: Card[]; // Face cards (J, Q, K) with special abilities
    };
  };
  currentPlayer: string;
  gameOver: boolean;
  winner: string | null;
  playerOrder: string[];
  scrap: Card[]; // Discarded cards
  lastAction: {
    player: string;
    action: 'play' | 'scuttle' | 'target' | 'draw';
    card?: Card;
    target?: Card;
    targetPlayer?: string;
  } | null;
}

interface CuttleMove {
  player: string;
  action: 'play' | 'scuttle' | 'target' | 'pass';
  card?: Card;
  target?: Card;
  targetPlayer?: string;
}

export class CuttleGame extends BaseGame {
  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'cuttle', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // Cuttle is typically a 2-player game
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 4);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: CuttleState['players'] = {};

    // Deal 6 cards to each player
    const cardsPerPlayer = 6;
    let deckIndex = 0;

    for (let i = 0; i < playerCount; i++) {
      const playerId = playerIds[i]!;
      players[playerId] = {
        hand: deck.slice(deckIndex, deckIndex + cardsPerPlayer),
        field: [],
        faceCards: [],
      };
      deckIndex += cardsPerPlayer;
    }

    // Remove dealt cards from deck
    const remainingDeck = deck.slice(deckIndex);

    const initialState: CuttleState = {
      gameId: this.gameId,
      gameType: this.gameType,
      deck: remainingDeck,
      players,
      currentPlayer: playerIds[0]!,
      gameOver: false,
      winner: null,
      playerOrder: playerIds,
      scrap: [],
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
        deck.push({
          suit,
          rank,
          value: this.getCardValue(rank),
        });
      }
    }

    return deck;
  }

  private getCardValue(rank: Rank): number {
    switch (rank) {
      case 'A':
        return 1;
      case '2':
        return 2;
      case '3':
        return 3;
      case '4':
        return 4;
      case '5':
        return 5;
      case '6':
        return 6;
      case '7':
        return 7;
      case '8':
        return 8;
      case '9':
        return 9;
      case '10':
        return 10;
      case 'J':
        return 11;
      case 'Q':
        return 12;
      case 'K':
        return 13;
      default:
        return 0;
    }
  }

  private shuffleDeck(deck: Card[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i]!, deck[j]!] = [deck[j]!, deck[i]!];
    }
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as CuttleMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['play', 'scuttle', 'target', 'pass'].includes(move.action)) {
        return { valid: false, error: 'Action must be play, scuttle, target, or pass' };
      }

      const state = this.currentState as CuttleState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: `It's ${state.currentPlayer}'s turn` };
      }

      const player = state.players[move.player];
      if (!player) {
        return { valid: false, error: 'Invalid player' };
      }

      if (move.action === 'pass') {
        return { valid: true };
      }

      if (!move.card) {
        return { valid: false, error: 'Must specify a card for this action' };
      }

      // Check if player has the card
      const hasCard = player.hand.some(
        card => card.suit === move.card!.suit && card.rank === move.card!.rank
      );
      if (!hasCard) {
        return {
          valid: false,
          error: `Player does not have ${move.card.rank} of ${move.card.suit}`,
        };
      }

      // Validate specific actions
      switch (move.action) {
        case 'play':
          return this.validatePlayAction(move, state);
        case 'scuttle':
          return this.validateScuttleAction(move, state);
        case 'target':
          return this.validateTargetAction(move, state);
        default:
          return { valid: false, error: 'Unknown action' };
      }
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validatePlayAction(move: CuttleMove, state: CuttleState): MoveValidationResult {
    const card = move.card!;

    // Point cards (A-10) can be played to field
    if (card.value <= 10) {
      return { valid: true };
    }

    // Face cards have special rules
    switch (card.rank) {
      case 'J':
        // Jacks destroy target cards
        if (!move.target || !move.targetPlayer) {
          return { valid: false, error: 'Jack requires a target card and target player' };
        }
        return this.validateTargetExists(move, state);

      case 'Q':
        // Queens provide protection (can be played anytime)
        return { valid: true };

      case 'K':
        // Kings provide ongoing effects
        return { valid: true };

      default:
        return { valid: false, error: 'Invalid card for play action' };
    }
  }

  private validateScuttleAction(move: CuttleMove, state: CuttleState): MoveValidationResult {
    const card = move.card!;

    // Only point cards can scuttle
    if (card.value > 10) {
      return { valid: false, error: 'Only point cards (A-10) can scuttle' };
    }

    if (!move.target || !move.targetPlayer) {
      return { valid: false, error: 'Scuttle requires a target card and target player' };
    }

    const targetPlayer = state.players[move.targetPlayer];
    if (!targetPlayer) {
      return { valid: false, error: 'Invalid target player' };
    }

    // Find target card in opponent's field
    const targetCard = targetPlayer.field.find(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );

    if (!targetCard) {
      return { valid: false, error: "Target card not found in opponent's field" };
    }

    // Scuttling card must have higher or equal value
    if (card.value < targetCard.value) {
      return { valid: false, error: 'Scuttling card must have higher or equal value than target' };
    }

    return { valid: true };
  }

  private validateTargetAction(move: CuttleMove, state: CuttleState): MoveValidationResult {
    // Target actions are for specific card abilities
    return this.validateTargetExists(move, state);
  }

  private validateTargetExists(move: CuttleMove, state: CuttleState): MoveValidationResult {
    if (!move.target || !move.targetPlayer) {
      return { valid: false, error: 'Target action requires a target card and target player' };
    }

    const targetPlayer = state.players[move.targetPlayer];
    if (!targetPlayer) {
      return { valid: false, error: 'Invalid target player' };
    }

    // Check if target exists in field or face cards
    const targetInField = targetPlayer.field.some(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );
    const targetInFaceCards = targetPlayer.faceCards.some(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );

    if (!targetInField && !targetInFaceCards) {
      return { valid: false, error: 'Target card not found' };
    }

    return { valid: true };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const cuttleMove = move.moveData as CuttleMove;
    const state = this.currentState as CuttleState;

    if (cuttleMove.action === 'pass') {
      this.moveToNextPlayer(state);
      return;
    }

    const player = state.players[cuttleMove.player]!;
    const card = cuttleMove.card!;

    // Remove card from hand
    const cardIndex = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex !== -1) {
      player.hand.splice(cardIndex, 1);
    }

    switch (cuttleMove.action) {
      case 'play':
        this.applyPlayAction(cuttleMove, state, card);
        break;
      case 'scuttle':
        this.applyScuttleAction(cuttleMove, state, card);
        break;
      case 'target':
        this.applyTargetAction(cuttleMove, state, card);
        break;
    }

    // Draw a card if deck has cards
    if (state.deck.length > 0) {
      const drawnCard = state.deck.pop()!;
      player.hand.push(drawnCard);
    }

    state.lastAction = {
      player: cuttleMove.player,
      action: cuttleMove.action,
      card,
      target: cuttleMove.target,
      targetPlayer: cuttleMove.targetPlayer,
    };

    // Check win condition
    this.checkWinCondition(state);

    if (!state.gameOver) {
      this.moveToNextPlayer(state);
    }
  }

  private applyPlayAction(move: CuttleMove, state: CuttleState, card: Card): void {
    const player = state.players[move.player]!;

    if (card.value <= 10) {
      // Point card - add to field
      player.field.push(card);
    } else {
      // Face card - add to face cards and apply effect
      player.faceCards.push(card);
      this.applyFaceCardEffect(move, state, card);
    }
  }

  private applyScuttleAction(move: CuttleMove, state: CuttleState, card: Card): void {
    const targetPlayer = state.players[move.targetPlayer!]!;

    // Remove target card from field
    const targetIndex = targetPlayer.field.findIndex(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );
    if (targetIndex !== -1) {
      const targetCard = targetPlayer.field.splice(targetIndex, 1)[0]!;
      state.scrap.push(targetCard);
    }

    // Scuttling card also goes to scrap
    state.scrap.push(card);
  }

  private applyTargetAction(move: CuttleMove, state: CuttleState, card: Card): void {
    // Apply specific targeting effects based on card
    if (card.rank === 'J') {
      // Jack destroys target
      this.destroyTarget(move, state);
    }

    // Card goes to scrap after use
    state.scrap.push(card);
  }

  private applyFaceCardEffect(move: CuttleMove, state: CuttleState, card: Card): void {
    switch (card.rank) {
      case 'J':
        // Jack effect already handled in targeting
        if (move.target && move.targetPlayer) {
          this.destroyTarget(move, state);
        }
        break;
      case 'Q':
        // Queen provides protection (passive effect)
        break;
      case 'K':
        // King provides ongoing effects (passive effect)
        break;
    }
  }

  private destroyTarget(move: CuttleMove, state: CuttleState): void {
    const targetPlayer = state.players[move.targetPlayer!]!;

    // Try to remove from field first
    let targetIndex = targetPlayer.field.findIndex(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );

    if (targetIndex !== -1) {
      const targetCard = targetPlayer.field.splice(targetIndex, 1)[0]!;
      state.scrap.push(targetCard);
      return;
    }

    // Try to remove from face cards
    targetIndex = targetPlayer.faceCards.findIndex(
      c => c.suit === move.target!.suit && c.rank === move.target!.rank
    );

    if (targetIndex !== -1) {
      const targetCard = targetPlayer.faceCards.splice(targetIndex, 1)[0]!;
      state.scrap.push(targetCard);
    }
  }

  private checkWinCondition(state: CuttleState): void {
    // Win condition: 21 or more points, or specific card combinations
    for (const [playerId, player] of Object.entries(state.players)) {
      const totalPoints = player.field.reduce((sum, card) => sum + card.value, 0);

      if (totalPoints >= 21) {
        state.gameOver = true;
        state.winner = playerId;
        return;
      }

      // Check for special win conditions (e.g., specific combinations)
      // This can be extended based on Cuttle variant rules
    }
  }

  private moveToNextPlayer(state: CuttleState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as CuttleState;

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
            fieldCards: player.field,
            faceCards: player.faceCards,
            points: player.field.reduce((sum, card) => sum + card.value, 0),
          },
        ])
      ),
      deckSize: state.deck.length,
      scrapSize: state.scrap.length,
      lastAction: state.lastAction,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as CuttleState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as CuttleState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Cuttle',
      description:
        'Strategic card game where players compete to reach 21 points while using special card abilities',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '20-40 minutes',
      complexity: 'intermediate',
      categories: ['card', 'strategy', 'competitive'],
    };
  }
}

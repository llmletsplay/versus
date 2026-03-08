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

type CrazyColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
type CrazyValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4';

interface CrazyCard {
  color: CrazyColor;
  value: CrazyValue;
  id: string; // Unique identifier for each card
}

interface CrazyState extends GameState {
  players: {
    [playerId: string]: {
      hand: CrazyCard[];
      handSize: number; // For public display
      hasCalledUno: boolean;
    };
  };
  deck: CrazyCard[];
  discardPile: CrazyCard[];
  currentPlayer: string;
  playerOrder: string[];
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  currentColor: CrazyColor; // Current valid color (excluding wild)
  gameOver: boolean;
  winner: string | null;
  lastAction: {
    action: 'play' | 'draw' | 'pass' | 'uno' | 'challenge';
    player: string;
    card?: CrazyCard;
    details?: string;
  } | null;
  gamePhase: 'playing' | 'finished';
  pendingDraw: number; // Number of cards to draw (from draw2/draw4 effects)
  mustPlayDrawCard: boolean; // Must play a draw card if possible
  wildColorChoice: CrazyColor | null; // Color chosen after playing wild card
}

interface CrazyMove {
  player: string;
  action: 'play' | 'draw' | 'pass' | 'uno' | 'challenge';
  card?: CrazyCard;
  chosenColor?: CrazyColor; // For wild cards
}

export class CrazyCardsGame extends BaseGame {
  private cardIdCounter = 0;

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'crazy-cards', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    // Create and shuffle deck
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    // Initialize players (2-10 players)
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 10);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: CrazyState['players'] = {};

    // Deal 7 cards to each player
    for (const playerId of playerIds) {
      players[playerId] = {
        hand: this.drawCards(deck, 7),
        handSize: 7,
        hasCalledUno: false,
      };
    }

    // Start discard pile with first card (not a wild or action card)
    let startCard: CrazyCard;
    do {
      startCard = this.drawCards(deck, 1)[0]!;
    } while (startCard.color === 'wild' || ['skip', 'reverse', 'draw2'].includes(startCard.value));

    const initialState: CrazyState = {
      gameId: this.gameId,
      gameType: this.gameType,
      players,
      deck,
      discardPile: [startCard],
      currentPlayer: playerIds[0]!,
      playerOrder: playerIds,
      direction: 1,
      currentColor: startCard.color,
      gameOver: false,
      winner: null,
      lastAction: null,
      gamePhase: 'playing',
      pendingDraw: 0,
      mustPlayDrawCard: false,
      wildColorChoice: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createDeck(): CrazyCard[] {
    const deck: CrazyCard[] = [];
    const colors: CrazyColor[] = ['red', 'blue', 'green', 'yellow'];
    const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as CrazyValue[];
    const actionCards = ['skip', 'reverse', 'draw2'] as CrazyValue[];

    // Number cards (0 appears once per color, 1-9 appear twice per color)
    for (const color of colors) {
      // One 0 per color
      deck.push(this.createCard(color, '0'));

      // Two of each 1-9 per color
      for (const number of numbers.slice(1)) {
        deck.push(this.createCard(color, number));
        deck.push(this.createCard(color, number));
      }

      // Two of each action card per color
      for (const action of actionCards) {
        deck.push(this.createCard(color, action));
        deck.push(this.createCard(color, action));
      }
    }

    // Wild cards (4 of each)
    for (let i = 0; i < 4; i++) {
      deck.push(this.createCard('wild', 'wild'));
      deck.push(this.createCard('wild', 'wild_draw4'));
    }

    return deck;
  }

  private createCard(color: CrazyColor, value: CrazyValue): CrazyCard {
    return {
      color,
      value,
      id: `${color}-${value}-${this.cardIdCounter++}`,
    };
  }

  private shuffleDeck(deck: CrazyCard[]): void {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i]!, deck[j]!] = [deck[j]!, deck[i]!];
    }
  }

  private drawCards(deck: CrazyCard[], count: number): CrazyCard[] {
    return deck.splice(0, Math.min(count, deck.length));
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as CrazyMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      const state = this.currentState as CrazyState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: 'Not your turn' };
      }

      if (!state.players[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      const player = state.players[move.player]!;

      if (move.action === 'draw') {
        // Can always draw if no pending draw effects
        if (state.pendingDraw === 0) {
          return { valid: true };
        }

        // If there are pending draws, must draw that many
        return { valid: true };
      }

      if (move.action === 'pass') {
        // Can only pass after drawing a card
        return { valid: true };
      }

      if (move.action === 'uno') {
        // Can call uno when playing second-to-last card
        if (player.hand.length !== 2) {
          return { valid: false, error: 'Can only call Uno when you have 2 cards left' };
        }
        return { valid: true };
      }

      if (move.action === 'challenge') {
        // Can challenge a wild draw 4 if the previous player could have played another card
        if (!state.lastAction || state.lastAction.card?.value !== 'wild_draw4') {
          return { valid: false, error: 'Can only challenge a Wild Draw 4 card' };
        }
        return { valid: true };
      }

      if (move.action === 'play') {
        if (!move.card) {
          return { valid: false, error: 'Must specify a card to play' };
        }

        // Verify player has the card
        const hasCard = player.hand.some((c) => c.id === move.card!.id);
        if (!hasCard) {
          return { valid: false, error: 'You do not have that card' };
        }

        // If there are pending draws, can only play draw cards or wild draw 4
        if (state.pendingDraw > 0 && state.mustPlayDrawCard) {
          if (move.card.value !== 'draw2' && move.card.value !== 'wild_draw4') {
            return { valid: false, error: 'Must play a draw card when facing a draw penalty' };
          }
        }

        // Validate card can be played
        return this.validateCardPlay(move.card, state);
      }

      return { valid: false, error: 'Invalid action' };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateCardPlay(card: CrazyCard, state: CrazyState): MoveValidationResult {
    const topCard = state.discardPile[state.discardPile.length - 1]!;
    const currentColor = state.wildColorChoice || state.currentColor;

    // Wild cards can always be played
    if (card.color === 'wild') {
      return { valid: true };
    }

    // Card must match color or value
    if (card.color === currentColor || card.value === topCard.value) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Card must match color (${currentColor}) or value (${topCard.value})`,
    };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const crazyMove = move.moveData as CrazyMove;
    const state = this.currentState as CrazyState;

    if (crazyMove.action === 'draw') {
      this.handleDraw(crazyMove, state);
      return;
    }

    if (crazyMove.action === 'pass') {
      this.advanceToNextCrazyPlayer(state);
      return;
    }

    if (crazyMove.action === 'uno') {
      state.players[crazyMove.player]!.hasCalledUno = true;
      state.lastAction = {
        action: 'uno',
        player: crazyMove.player,
        details: `${crazyMove.player} called Uno!`,
      };
      return;
    }

    if (crazyMove.action === 'challenge') {
      this.handleChallenge(crazyMove, state);
      return;
    }

    if (crazyMove.action === 'play') {
      this.handleCardPlay(crazyMove, state);
    }
  }

  private handleDraw(move: CrazyMove, state: CrazyState): void {
    const player = state.players[move.player]!;
    const drawCount = state.pendingDraw > 0 ? state.pendingDraw : 1;

    // Reshuffle discard pile if deck is empty
    if (state.deck.length < drawCount) {
      this.reshuffleDiscardPile(state);
    }

    const drawnCards = this.drawCards(state.deck, drawCount);
    player.hand.push(...drawnCards);
    player.handSize = player.hand.length;

    // Reset pending draw
    state.pendingDraw = 0;
    state.mustPlayDrawCard = false;

    state.lastAction = {
      action: 'draw',
      player: move.player,
      details: `${move.player} drew ${drawCount} card(s)`,
    };

    // Don't advance turn automatically - player can choose to play or pass
  }

  private handleCardPlay(move: CrazyMove, state: CrazyState): void {
    const player = state.players[move.player]!;
    const card = move.card!;

    // Remove card from player's hand
    const cardIndex = player.hand.findIndex((c) => c.id === card.id);
    if (cardIndex !== -1) {
      player.hand.splice(cardIndex, 1);
      player.handSize = player.hand.length;
    }

    // Add card to discard pile
    state.discardPile.push(card);
    state.currentColor = card.color === 'wild' ? move.chosenColor || 'red' : card.color;
    state.wildColorChoice = card.color === 'wild' ? move.chosenColor || 'red' : null;

    // Handle special cards
    this.handleSpecialCard(card, move, state);

    // Check for win condition
    if (player.hand.length === 0) {
      state.gameOver = true;
      state.winner = move.player;
      state.gamePhase = 'finished';
      return;
    }

    // Check if player forgot to call Uno
    if (player.hand.length === 1 && !player.hasCalledUno) {
      // In a real game, other players could challenge this
      // For simplicity, we'll just note it
    }

    // Reset Uno call status
    player.hasCalledUno = false;

    state.lastAction = {
      action: 'play',
      player: move.player,
      card,
      details: `${move.player} played ${card.color} ${card.value}`,
    };

    // Advance to next player (unless skipped by special card)
    if (card.value !== 'skip') {
      this.advanceToNextCrazyPlayer(state);
    } else {
      // Skip next player
      this.advanceToNextCrazyPlayer(state);
      this.advanceToNextCrazyPlayer(state);
    }
  }

  private handleSpecialCard(card: CrazyCard, move: CrazyMove, state: CrazyState): void {
    switch (card.value) {
      case 'reverse':
        state.direction *= -1;
        // In 2-player game, reverse acts like skip
        if (state.playerOrder.length === 2) {
          this.advanceToNextCrazyPlayer(state);
        }
        break;

      case 'skip':
        // Handled in handleCardPlay
        break;

      case 'draw2':
        state.pendingDraw += 2;
        state.mustPlayDrawCard = true;
        break;

      case 'wild':
        // Color choice handled in handleCardPlay
        break;

      case 'wild_draw4':
        state.pendingDraw += 4;
        state.mustPlayDrawCard = true;
        break;
    }
  }

  private handleChallenge(move: CrazyMove, state: CrazyState): void {
    // Simplified challenge logic
    // In a real game, you'd check if the previous player had other valid cards
    const challengeSuccessful = Math.random() > 0.5; // 50% chance for simplicity

    if (challengeSuccessful) {
      // Challenge successful - previous player draws 4 cards instead
      const previousPlayer = this.getPreviousPlayer(state);
      const player = state.players[previousPlayer]!;

      if (state.deck.length < 4) {
        this.reshuffleDiscardPile(state);
      }

      const drawnCards = this.drawCards(state.deck, 4);
      player.hand.push(...drawnCards);
      player.handSize = player.hand.length;

      state.pendingDraw = 0;
      state.mustPlayDrawCard = false;

      state.lastAction = {
        action: 'challenge',
        player: move.player,
        details: `${move.player} successfully challenged ${previousPlayer}`,
      };
    } else {
      // Challenge failed - challenger draws 6 cards
      const player = state.players[move.player]!;

      if (state.deck.length < 6) {
        this.reshuffleDiscardPile(state);
      }

      const drawnCards = this.drawCards(state.deck, 6);
      player.hand.push(...drawnCards);
      player.handSize = player.hand.length;

      state.lastAction = {
        action: 'challenge',
        player: move.player,
        details: `${move.player} failed to challenge - drew 6 cards`,
      };
    }
  }

  private reshuffleDiscardPile(state: CrazyState): void {
    if (state.discardPile.length <= 1) {
      return;
    }

    // Keep top card, shuffle the rest back into deck
    const topCard = state.discardPile.pop()!;
    state.deck.push(...state.discardPile);
    state.discardPile = [topCard];
    this.shuffleDeck(state.deck);
  }

  private advanceToNextCrazyPlayer(state: CrazyState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex =
      (currentIndex + state.direction + state.playerOrder.length) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  private getPreviousPlayer(state: CrazyState): string {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const prevIndex =
      (currentIndex - state.direction + state.playerOrder.length) % state.playerOrder.length;
    return state.playerOrder[prevIndex]!;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as CrazyState;
    const topCard = state.discardPile[state.discardPile.length - 1]!;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          {
            handSize: player.handSize,
            hand: player.hand, // In real game, this would be hidden from other players
            hasCalledUno: player.hasCalledUno,
            isCurrentPlayer: state.currentPlayer === id,
          },
        ])
      ),
      currentPlayer: state.currentPlayer,
      currentColor: state.wildColorChoice || state.currentColor,
      topCard,
      direction: state.direction,
      deckSize: state.deck.length,
      gameOver: state.gameOver,
      winner: state.winner,
      lastAction: state.lastAction,
      pendingDraw: state.pendingDraw,
      mustPlayDrawCard: state.mustPlayDrawCard,
      gamePhase: state.gamePhase,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as CrazyState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as CrazyState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Crazy Cards',
      description:
        'Fast-paced card game where players match colors and numbers while using action cards to hinder opponents',
      minPlayers: 2,
      maxPlayers: 10,
      estimatedDuration: '15-30 minutes',
      complexity: 'beginner',
      categories: ['card', 'family', 'quick'],
    };
  }
}

export function createCrazyCardsGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): CrazyCardsGame {
  return new CrazyCardsGame(gameId, database);
}

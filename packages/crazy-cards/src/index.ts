import { InMemoryDatabaseProvider } from '@llmletsplay/versus-game-core';
import { BaseGame } from '@llmletsplay/versus-game-core';
import type { DatabaseProvider } from '@llmletsplay/versus-game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@llmletsplay/versus-game-core';

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
  id: string;
}

export interface CrazyState extends GameState {
  players: {
    [playerId: string]: {
      hand: CrazyCard[];
      handSize: number;
      hasCalledUno: boolean;
    };
  };
  deck: CrazyCard[];
  discardPile: CrazyCard[];
  currentPlayer: string;
  playerOrder: string[];
  direction: 1 | -1;
  currentColor: CrazyColor;
  gameOver: boolean;
  winner: string | null;
  lastAction: {
    action: 'play' | 'draw' | 'pass' | 'uno' | 'challenge';
    player: string;
    card?: CrazyCard;
    details?: string;
  } | null;
  gamePhase: 'playing' | 'finished';
  pendingDraw: number;
  mustPlayDrawCard: boolean;
  wildColorChoice: CrazyColor | null;
  drawnCardId: string | null;
  pendingWildDraw4Challenge: {
    sourcePlayer: string;
    priorColor: CrazyColor;
    legalPlay: boolean;
  } | null;
}

interface CrazyMove {
  player: string;
  action: 'play' | 'draw' | 'pass' | 'uno' | 'challenge';
  card?: CrazyCard;
  chosenColor?: CrazyColor;
}

export class CrazyCardsGame extends BaseGame {
  private cardIdCounter = 0;

  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'crazy-cards', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const deck = this.createDeck();
    this.shuffleDeck(deck);

    const playerCount = Math.min(Math.max((config as any)?.playerCount || 4, 2), 10);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: CrazyState['players'] = {};
    for (const playerId of playerIds) {
      players[playerId] = {
        hand: this.drawCards(deck, 7),
        handSize: 7,
        hasCalledUno: false,
      };
    }

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
      drawnCardId: null,
      pendingWildDraw4Challenge: null,
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

    for (const color of colors) {
      deck.push(this.createCard(color, '0'));

      for (const number of numbers.slice(1)) {
        deck.push(this.createCard(color, number));
        deck.push(this.createCard(color, number));
      }

      for (const action of actionCards) {
        deck.push(this.createCard(color, action));
        deck.push(this.createCard(color, action));
      }
    }

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
        if (state.pendingDraw > 0) {
          return { valid: true };
        }

        if (state.drawnCardId) {
          return { valid: false, error: 'Already drew a card this turn' };
        }

        return { valid: true };
      }

      if (move.action === 'pass') {
        if (state.pendingDraw > 0) {
          return { valid: false, error: 'Must draw the penalty cards' };
        }
        if (state.drawnCardId === null || state.lastAction?.action !== 'draw') {
          return { valid: false, error: 'Can only pass after drawing a card' };
        }
        return { valid: true };
      }

      if (move.action === 'uno') {
        if (player.hand.length !== 2) {
          return { valid: false, error: 'Can only call Uno when you have 2 cards left' };
        }
        return { valid: true };
      }

      if (move.action === 'challenge') {
        if (!state.lastAction || state.lastAction.card?.value !== 'wild_draw4') {
          return { valid: false, error: 'Can only challenge a Wild Draw 4 card' };
        }
        if (!state.pendingWildDraw4Challenge) {
          return { valid: false, error: 'Can only challenge a Wild Draw 4 card' };
        }
        return { valid: true };
      }

      if (move.action === 'play') {
        if (!move.card) {
          return { valid: false, error: 'Must specify a card to play' };
        }

        const hasCard = player.hand.some((card) => card.id === move.card!.id);
        if (!hasCard) {
          return { valid: false, error: 'You do not have that card' };
        }

        if (state.pendingDraw > 0) {
          return { valid: false, error: 'Must draw the penalty cards' };
        }

        if (state.drawnCardId && move.card.id !== state.drawnCardId) {
          return { valid: false, error: 'Can only play the card you just drew' };
        }

        if (move.card.color === 'wild' && (!move.chosenColor || move.chosenColor === 'wild')) {
          return { valid: false, error: 'Must choose a non-wild color' };
        }

        return this.validateCardPlay(move.card, state);
      }

      return { valid: false, error: 'Invalid action' };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateCardPlay(card: CrazyCard, state: CrazyState): MoveValidationResult {
    const topCard = state.discardPile[state.discardPile.length - 1]!;
    const currentColor = this.getActiveColor(state);

    if (card.color === 'wild') {
      return { valid: true };
    }

    if (card.color === currentColor || card.value === topCard.value) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Card must match color (${currentColor}) or value (${topCard.value})`,
    };
  }

  private getActiveColor(state: CrazyState): CrazyColor {
    return state.wildColorChoice || state.currentColor;
  }

  private clearTurnContext(state: CrazyState): void {
    state.drawnCardId = null;
  }

  private clearPenaltyState(state: CrazyState): void {
    state.pendingDraw = 0;
    state.mustPlayDrawCard = false;
    state.pendingWildDraw4Challenge = null;
  }

  private canPlayAnyNonWildCardOfColor(cards: CrazyCard[], color: CrazyColor): boolean {
    return cards.some((card) => card.color !== 'wild' && card.color === color);
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const crazyMove = move.moveData as CrazyMove;
    const state = this.currentState as CrazyState;

    if (crazyMove.action === 'draw') {
      this.handleDraw(crazyMove, state);
      return;
    }

    if (crazyMove.action === 'pass') {
      this.clearTurnContext(state);
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

    if (state.deck.length < drawCount) {
      this.reshuffleDiscardPile(state);
    }

    const drawnCards = this.drawCards(state.deck, drawCount);
    player.hand.push(...drawnCards);
    player.handSize = player.hand.length;
    this.clearTurnContext(state);

    state.lastAction = {
      action: 'draw',
      player: move.player,
      details: `${move.player} drew ${drawCount} card(s)`,
    };

    if (drawCount > 1) {
      this.clearPenaltyState(state);
      this.advanceToNextCrazyPlayer(state);
      return;
    }

    state.drawnCardId = drawnCards[0]?.id ?? null;
  }

  private handleCardPlay(move: CrazyMove, state: CrazyState): void {
    const player = state.players[move.player]!;
    const card = move.card!;
    const priorColor = this.getActiveColor(state);

    const cardIndex = player.hand.findIndex((handCard) => handCard.id === card.id);
    if (cardIndex !== -1) {
      player.hand.splice(cardIndex, 1);
      player.handSize = player.hand.length;
    }

    state.discardPile.push(card);
    state.currentColor = card.color === 'wild' ? move.chosenColor ?? 'red' : card.color;
    state.wildColorChoice = card.color === 'wild' ? move.chosenColor ?? 'red' : null;
    this.clearTurnContext(state);
    state.pendingWildDraw4Challenge = null;

    this.handleSpecialCard(card, move, state, priorColor, player.hand);

    if (player.hand.length === 0) {
      state.gameOver = true;
      state.winner = move.player;
      state.gamePhase = 'finished';
      return;
    }

    player.hasCalledUno = false;

    state.lastAction = {
      action: 'play',
      player: move.player,
      card,
      details: `${move.player} played ${card.color} ${card.value}`,
    };

    if (card.value !== 'skip') {
      this.advanceToNextCrazyPlayer(state);
    } else {
      this.advanceToNextCrazyPlayer(state);
      this.advanceToNextCrazyPlayer(state);
    }
  }

  private handleSpecialCard(
    card: CrazyCard,
    move: CrazyMove,
    state: CrazyState,
    priorColor: CrazyColor,
    remainingHand: CrazyCard[]
  ): void {
    switch (card.value) {
      case 'reverse':
        state.direction *= -1;
        if (state.playerOrder.length === 2) {
          this.advanceToNextCrazyPlayer(state);
        }
        break;

      case 'skip':
        break;

      case 'draw2':
        state.pendingDraw = 2;
        state.mustPlayDrawCard = true;
        break;

      case 'wild':
        break;

      case 'wild_draw4':
        state.pendingDraw = 4;
        state.mustPlayDrawCard = true;
        state.pendingWildDraw4Challenge = {
          sourcePlayer: move.player,
          priorColor,
          legalPlay: !this.canPlayAnyNonWildCardOfColor(remainingHand, priorColor),
        };
        break;
    }
  }

  private handleChallenge(move: CrazyMove, state: CrazyState): void {
    const challenge = state.pendingWildDraw4Challenge;
    if (!challenge) {
      return;
    }

    if (!challenge.legalPlay) {
      const sourcePlayer = state.players[challenge.sourcePlayer]!;

      if (state.deck.length < 4) {
        this.reshuffleDiscardPile(state);
      }

      const drawnCards = this.drawCards(state.deck, 4);
      sourcePlayer.hand.push(...drawnCards);
      sourcePlayer.handSize = sourcePlayer.hand.length;
      this.clearPenaltyState(state);

      state.lastAction = {
        action: 'challenge',
        player: move.player,
        details: `${move.player} successfully challenged ${challenge.sourcePlayer}`,
      };
      return;
    }

    const challenger = state.players[move.player]!;

    if (state.deck.length < 6) {
      this.reshuffleDiscardPile(state);
    }

    const drawnCards = this.drawCards(state.deck, 6);
    challenger.hand.push(...drawnCards);
    challenger.handSize = challenger.hand.length;
    this.clearPenaltyState(state);

    state.lastAction = {
      action: 'challenge',
      player: move.player,
      details: `${move.player} failed to challenge - drew 6 cards`,
    };

    this.advanceToNextCrazyPlayer(state);
  }

  private reshuffleDiscardPile(state: CrazyState): void {
    if (state.discardPile.length <= 1) {
      return;
    }

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
            hand: player.hand,
            hasCalledUno: player.hasCalledUno,
            isCurrentPlayer: state.currentPlayer === id,
          },
        ])
      ),
      currentPlayer: state.currentPlayer,
      currentColor: this.getActiveColor(state),
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
        'UNO-style shedding game where players match colors and values while resolving standard draw and challenge rules',
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
  database: import('@llmletsplay/versus-game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): CrazyCardsGame {
  return new CrazyCardsGame(gameId, database);
}

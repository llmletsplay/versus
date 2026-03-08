import { InMemoryDatabaseProvider } from '@versus/game-core';
/* eslint-disable no-unused-vars */
import type { DatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';
import { createShuffledDeck, type CardWithValue } from '@versus/game-core';

type Player = 'north' | 'south' | 'east' | 'west';

interface HeartsState extends GameState {
  hands: { [player in Player]: CardWithValue[] };
  currentTrick: {
    cards: { [player in Player]?: CardWithValue };
    leader: Player | null;
    winner: Player | null;
  };
  completedTricks: Array<{
    cards: { [player in Player]: CardWithValue };
    winner: Player;
    points: number;
  }>;
  scores: { [player in Player]: number };
  gameScores: { [player in Player]: number }; // Total game score across rounds
  currentPlayer: Player;
  playerOrder: Player[];
  gamePhase: 'passing' | 'playing' | 'scoring' | 'finished';
  passDirection: 'left' | 'right' | 'across' | 'none';
  roundNumber: number;
  gameOver: boolean;
  winner: Player | null;
  heartsBroken: boolean;
  passedCards: { [player in Player]?: CardWithValue[] };
  receivedCards: { [player in Player]?: CardWithValue[] };
  lastAction: {
    action: string;
    player?: Player;
    card?: CardWithValue;
    details?: string;
  } | null;
  trickNumber: number;
}

interface HeartsMove {
  player: Player;
  action: 'pass' | 'play';
  cards?: CardWithValue[];
  card?: CardWithValue;
}

export class HeartsGame extends BaseGame {
  private readonly GAME_END_SCORE = 100;
  private readonly PASS_DIRECTIONS: ('left' | 'right' | 'across' | 'none')[] = [
    'left',
    'right',
    'across',
    'none',
  ];

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'hearts', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    // Hearts is always 4 players
    const playerOrder: Player[] = ['north', 'south', 'east', 'west'];

    // Create and shuffle deck
    const deck = createShuffledDeck('POKER');

    // Deal 13 cards to each player
    const hands: { [player in Player]: CardWithValue[] } = {
      north: deck.slice(0, 13),
      south: deck.slice(13, 26),
      east: deck.slice(26, 39),
      west: deck.slice(39, 52),
    };

    // Find player with 2 of clubs (starts first trick)
    let firstPlayer: Player = 'north';
    for (const [player, hand] of Object.entries(hands) as [Player, CardWithValue[]][]) {
      if (hand.some((card) => card.rank === '2' && card.suit === 'clubs')) {
        firstPlayer = player;
        break;
      }
    }

    const initialState: HeartsState = {
      gameId: this.gameId,
      gameType: this.gameType,
      hands,
      currentTrick: {
        cards: {},
        leader: null,
        winner: null,
      },
      completedTricks: [],
      scores: { north: 0, south: 0, east: 0, west: 0 },
      gameScores: { north: 0, south: 0, east: 0, west: 0 },
      currentPlayer: firstPlayer,
      playerOrder,
      gamePhase: 'passing',
      passDirection: this.PASS_DIRECTIONS[0]!, // Start with left
      roundNumber: 1,
      gameOver: false,
      winner: null,
      heartsBroken: false,
      passedCards: {},
      receivedCards: {},
      lastAction: null,
      trickNumber: 0,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as HeartsMove;
      const state = this.currentState as HeartsState;

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!['north', 'south', 'east', 'west'].includes(move.player)) {
        return { valid: false, error: 'Player must be north, south, east, or west' };
      }

      if (!['pass', 'play'].includes(move.action)) {
        return { valid: false, error: 'Action must be pass or play' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Validate passing phase
      if (move.action === 'pass') {
        if (state.gamePhase !== 'passing') {
          return { valid: false, error: 'Not in passing phase' };
        }

        if (state.passDirection === 'none') {
          return { valid: false, error: 'No passing this round' };
        }

        if (state.passedCards[move.player]) {
          return { valid: false, error: 'Player has already passed cards' };
        }

        if (!move.cards || move.cards.length !== 3) {
          return { valid: false, error: 'Must pass exactly 3 cards' };
        }

        // Check if player has these cards
        const playerHand = state.hands[move.player];
        for (const card of move.cards) {
          if (
            !playerHand.some(
              (handCard) => handCard.suit === card.suit && handCard.rank === card.rank
            )
          ) {
            return { valid: false, error: 'Player does not have one of the passed cards' };
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
    state: HeartsState
  ): MoveValidationResult {
    const trick = state.currentTrick;
    const playerHand = state.hands[player];

    // First card of first trick must be 2 of clubs
    if (state.trickNumber === 0 && Object.keys(trick.cards).length === 0) {
      if (card.rank !== '2' || card.suit !== 'clubs') {
        return { valid: false, error: 'First trick must start with 2 of clubs' };
      }
    }

    // If leading and hearts not broken, cannot lead hearts (unless only hearts left)
    if (Object.keys(trick.cards).length === 0 && card.suit === 'hearts' && !state.heartsBroken) {
      const hasNonHearts = playerHand.some((c) => c.suit !== 'hearts');
      if (hasNonHearts) {
        return { valid: false, error: 'Cannot lead hearts until hearts are broken' };
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

    // Cannot play hearts or queen of spades on first trick
    if (state.trickNumber === 0) {
      if (card.suit === 'hearts' || (card.suit === 'spades' && card.rank === 'Q')) {
        return { valid: false, error: 'Cannot play hearts or queen of spades on first trick' };
      }
    }

    return { valid: true };
  }

  private getLeadSuit(trick: HeartsState['currentTrick']): string {
    const cards = Object.values(trick.cards);
    return cards[0]?.suit || '';
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const heartsMove = move.moveData as HeartsMove;
    const state = this.currentState as HeartsState;

    if (heartsMove.action === 'pass') {
      this.passCards(heartsMove, state);
    } else if (heartsMove.action === 'play') {
      this.playCard(heartsMove, state);
    }
  }

  private passCards(move: HeartsMove, state: HeartsState): void {
    const cards = move.cards!;

    // Remove cards from player's hand
    const playerHand = state.hands[move.player];
    for (const card of cards) {
      const index = playerHand.findIndex(
        (handCard) => handCard.suit === card.suit && handCard.rank === card.rank
      );
      if (index !== -1) {
        playerHand.splice(index, 1);
      }
    }

    // Store passed cards
    state.passedCards[move.player] = cards;

    state.lastAction = {
      action: 'pass',
      player: move.player,
      details: `${move.player} passed 3 cards`,
    };

    // Check if all players have passed
    if (Object.keys(state.passedCards).length === 4) {
      this.distributePassedCards(state);
      this.startPlayingPhase(state);
    }
  }

  private distributePassedCards(state: HeartsState): void {
    const passTargets = this.getPassTargets(state.passDirection);

    for (const [player, target] of Object.entries(passTargets) as [Player, Player][]) {
      const cards = state.passedCards[player]!;
      state.hands[target].push(...cards);
      state.receivedCards[target] = cards;
    }

    // Sort hands
    for (const player of state.playerOrder) {
      this.sortHand(state.hands[player]);
    }
  }

  private getPassTargets(direction: 'left' | 'right' | 'across' | 'none'): {
    [player in Player]: Player;
  } {
    switch (direction) {
      case 'left':
        return { north: 'east', east: 'south', south: 'west', west: 'north' };
      case 'right':
        return { north: 'west', west: 'south', south: 'east', east: 'north' };
      case 'across':
        return { north: 'south', south: 'north', east: 'west', west: 'east' };
      default:
        return { north: 'north', south: 'south', east: 'east', west: 'west' };
    }
  }

  private sortHand(hand: CardWithValue[]): void {
    hand.sort((a, b) => {
      // Sort by suit first, then by value
      const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
      const suitDiff =
        suitOrder[a.suit as keyof typeof suitOrder] - suitOrder[b.suit as keyof typeof suitOrder];
      if (suitDiff !== 0) {
        return suitDiff;
      }
      return a.value - b.value;
    });
  }

  private startPlayingPhase(state: HeartsState): void {
    state.gamePhase = 'playing';

    // Find player with 2 of clubs to start
    for (const [player, hand] of Object.entries(state.hands) as [Player, CardWithValue[]][]) {
      if (hand.some((card) => card.rank === '2' && card.suit === 'clubs')) {
        state.currentPlayer = player;
        break;
      }
    }

    state.lastAction = {
      action: 'start_playing',
      details: 'Card passing complete. Playing phase begins.',
    };
  }

  private playCard(move: HeartsMove, state: HeartsState): void {
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

    // Check if hearts are broken
    if (card.suit === 'hearts') {
      state.heartsBroken = true;
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

  private completeTrick(state: HeartsState): void {
    const trick = state.currentTrick;
    const winner = this.determineTrickWinner(trick);
    const points = this.calculateTrickPoints(trick.cards);

    // Add to completed tricks
    state.completedTricks.push({
      cards: { ...trick.cards } as { [player in Player]: CardWithValue },
      winner,
      points,
    });

    // Add points to winner's score
    state.scores[winner] += points;

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
      details: `${winner} wins trick ${state.trickNumber} (${points} points)`,
    };

    // Check if round is complete (all 13 tricks played)
    if (state.completedTricks.length === 13) {
      this.endRound(state);
    }
  }

  private determineTrickWinner(trick: HeartsState['currentTrick']): Player {
    const leadSuit = this.getLeadSuit(trick);
    let winner: Player = trick.leader!;
    let highestValue = -1;

    for (const [player, card] of Object.entries(trick.cards) as [Player, CardWithValue][]) {
      if (card.suit === leadSuit && card.value > highestValue) {
        highestValue = card.value;
        winner = player;
      }
    }

    return winner;
  }

  private calculateTrickPoints(cards: { [player in Player]?: CardWithValue }): number {
    let points = 0;

    for (const card of Object.values(cards)) {
      if (card) {
        if (card.suit === 'hearts') {
          points += 1;
        } else if (card.suit === 'spades' && card.rank === 'Q') {
          points += 13;
        }
      }
    }

    return points;
  }

  private moveToNextPlayer(state: HeartsState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  private endRound(state: HeartsState): void {
    // Check for shooting the moon
    const moonShooter = this.checkShootingMoon(state);

    if (moonShooter) {
      // Moon shooter gets 0 points, everyone else gets 26
      for (const player of state.playerOrder) {
        if (player === moonShooter) {
          state.scores[player] = 0;
        } else {
          state.scores[player] = 26;
        }
      }

      state.lastAction = {
        action: 'shoot_moon',
        player: moonShooter,
        details: `${moonShooter} shot the moon!`,
      };
    }

    // Add round scores to game scores
    for (const player of state.playerOrder) {
      state.gameScores[player] += state.scores[player];
    }

    // Check for game end
    const maxScore = Math.max(...Object.values(state.gameScores));
    if (maxScore >= this.GAME_END_SCORE) {
      this.endGame(state);
    } else {
      this.startNewRound(state);
    }
  }

  private checkShootingMoon(state: HeartsState): Player | null {
    for (const player of state.playerOrder) {
      if (state.scores[player] === 26) {
        return player;
      }
    }
    return null;
  }

  private startNewRound(state: HeartsState): void {
    state.roundNumber++;
    state.gamePhase =
      state.PASS_DIRECTIONS[(state.roundNumber - 1) % 4] === 'none' ? 'playing' : 'passing';
    state.passDirection = this.PASS_DIRECTIONS[(state.roundNumber - 1) % 4]!;

    // Reset round state
    state.scores = { north: 0, south: 0, east: 0, west: 0 };
    state.completedTricks = [];
    state.heartsBroken = false;
    state.passedCards = {};
    state.receivedCards = {};
    state.trickNumber = 0;
    state.currentTrick = { cards: {}, leader: null, winner: null };

    // Deal new hands
    const deck = createShuffledDeck('POKER');
    state.hands = {
      north: deck.slice(0, 13),
      south: deck.slice(13, 26),
      east: deck.slice(26, 39),
      west: deck.slice(39, 52),
    };

    // Sort hands
    for (const player of state.playerOrder) {
      this.sortHand(state.hands[player]);
    }

    // Find player with 2 of clubs
    for (const [player, hand] of Object.entries(state.hands) as [Player, CardWithValue[]][]) {
      if (hand.some((card) => card.rank === '2' && card.suit === 'clubs')) {
        state.currentPlayer = player;
        break;
      }
    }

    // If no passing this round, go straight to playing
    if (state.passDirection === 'none') {
      state.gamePhase = 'playing';
    }

    state.lastAction = {
      action: 'new_round',
      details: `Round ${state.roundNumber} started. Pass direction: ${state.passDirection}`,
    };
  }

  private endGame(state: HeartsState): void {
    // Find winner (lowest score)
    let lowestScore = Infinity;
    let winner: Player = 'north';

    for (const [player, score] of Object.entries(state.gameScores) as [Player, number][]) {
      if (score < lowestScore) {
        lowestScore = score;
        winner = player;
      }
    }

    state.gameOver = true;
    state.winner = winner;
    state.gamePhase = 'finished';

    state.lastAction = {
      action: 'game_end',
      player: winner,
      details: `${winner} wins with ${lowestScore} points!`,
    };
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as HeartsState;

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      hands: state.hands,
      currentTrick: state.currentTrick,
      completedTricks: state.completedTricks,
      scores: state.scores,
      gameScores: state.gameScores,
      playerOrder: state.playerOrder,
      gamePhase: state.gamePhase,
      passDirection: state.passDirection,
      roundNumber: state.roundNumber,
      heartsBroken: state.heartsBroken,
      passedCards: state.passedCards,
      receivedCards: state.receivedCards,
      lastAction: state.lastAction,
      trickNumber: state.trickNumber,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as HeartsState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as HeartsState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Hearts',
      description: 'Classic trick-taking card game where you try to avoid penalty points',
      minPlayers: 4,
      maxPlayers: 4,
      estimatedDuration: '30-60 minutes',
      complexity: 'intermediate',
      categories: ['card', 'trick-taking', 'strategy', 'classic'],
    };
  }
}

export function createHeartsGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): HeartsGame {
  return new HeartsGame(gameId, database);
}

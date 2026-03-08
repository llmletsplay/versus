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

interface PromptCard {
  id: string;
  text: string;
  blanks: number; // Number of response cards needed
  category?: string;
}

interface ResponseCard {
  id: string;
  text: string;
  category?: string;
}

interface ACState extends GameState {
  promptDeck: PromptCard[];
  responseDeck: ResponseCard[];
  currentPrompt: PromptCard | null;
  players: {
    [playerId: string]: {
      hand: ResponseCard[];
      score: number;
      isJudge: boolean;
      submittedCards: ResponseCard[];
    };
  };
  currentJudge: string;
  playerOrder: string[];
  gameOver: boolean;
  winner: string | null;
  roundPhase: 'playing' | 'judging' | 'revealing' | 'scoring';
  submissions: {
    [playerId: string]: ResponseCard[];
  };
  roundWinner: string | null;
  gamePhase: 'waiting' | 'playing' | 'finished';
  maxScore: number;
  roundNumber: number;
  lastAction: {
    action: string;
    player?: string;
    details?: string;
  } | null;
}

interface ACMove {
  player: string;
  action: 'submit' | 'judge' | 'start_round';
  cards?: ResponseCard[];
  winningPlayer?: string;
}

export class AgainstCardsGame extends BaseGame {
  private readonly HAND_SIZE = 7;
  private readonly DEFAULT_MAX_SCORE = 5;

  // Default card sets - can be customized
  private readonly DEFAULT_PROMPTS: PromptCard[] = [
    { id: 'p1', text: "I got 99 problems but _____ ain't one.", blanks: 1 },
    { id: 'p2', text: "What's that smell?", blanks: 1 },
    { id: 'p3', text: 'I never truly understood _____ until I encountered _____.', blanks: 2 },
    { id: 'p4', text: 'What gives me uncontrollable gas?', blanks: 1 },
    { id: 'p5', text: 'What would grandma find disturbing, yet oddly charming?', blanks: 1 },
    { id: 'p6', text: "What's the next Happy Meal toy?", blanks: 1 },
    {
      id: 'p7',
      text: 'In 1,000 years, when paper money is a distant memory, _____ will be our currency.',
      blanks: 1,
    },
    { id: 'p8', text: 'What ended my last relationship?', blanks: 1 },
    { id: 'p9', text: 'What am I giving up for Lent?', blanks: 1 },
    { id: 'p10', text: 'What will always get you laid?', blanks: 1 },
  ];

  private readonly DEFAULT_RESPONSES: ResponseCard[] = [
    { id: 'r1', text: 'A mime having a stroke' },
    { id: 'r2', text: 'Praying the gay away' },
    { id: 'r3', text: 'Coat hanger abortions' },
    { id: 'r4', text: 'Fragile masculinity' },
    { id: 'r5', text: 'Getting really into board games' },
    { id: 'r6', text: 'Emotional baggage' },
    { id: 'r7', text: 'Poor life choices' },
    { id: 'r8', text: 'The unstoppable march of time' },
    { id: 'r9', text: 'Daddy issues' },
    { id: 'r10', text: 'A really cool hat' },
    { id: 'r11', text: 'Being a motherfucking sorcerer' },
    { id: 'r12', text: 'The patriarchy' },
    { id: 'r13', text: 'Passive-aggressive Post-it notes' },
    { id: 'r14', text: 'Alcoholism' },
    { id: 'r15', text: 'An incredibly satisfying bowel movement' },
    { id: 'r16', text: 'Dead parents' },
    { id: 'r17', text: 'Inappropriate yodeling' },
    { id: 'r18', text: 'Soup that is too hot' },
    { id: 'r19', text: 'A mating display' },
    { id: 'r20', text: 'Vigorous jazz hands' },
    { id: 'r21', text: 'Spontaneous human combustion' },
    { id: 'r22', text: 'A tiny horse' },
    { id: 'r23', text: 'The miracle of childbirth' },
    { id: 'r24', text: 'Retirement' },
    { id: 'r25', text: 'Puberty' },
    { id: 'r26', text: 'A balanced breakfast' },
    { id: 'r27', text: 'Pretending to care' },
    { id: 'r28', text: 'An erection lasting longer than four hours' },
    { id: 'r29', text: 'Stranger danger' },
    { id: 'r30', text: 'Sharing needles' },
  ];

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'against-cards', database);
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 3, 3), 10);
    const maxScore = (config as any)?.maxScore || this.DEFAULT_MAX_SCORE;

    // Allow custom card sets
    const customPrompts = (config as any)?.customPrompts as PromptCard[] | undefined;
    const customResponses = (config as any)?.customResponses as ResponseCard[] | undefined;

    const promptDeck = customPrompts ? [...customPrompts] : [...this.DEFAULT_PROMPTS];
    const responseDeck = customResponses ? [...customResponses] : [...this.DEFAULT_RESPONSES];

    // Shuffle decks
    this.shuffleArray(promptDeck);
    this.shuffleArray(responseDeck);

    // Create players
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);
    const players: ACState['players'] = {};

    // Deal initial hands
    for (const playerId of playerIds) {
      players[playerId] = {
        hand: responseDeck.splice(0, this.HAND_SIZE),
        score: 0,
        isJudge: false,
        submittedCards: [],
      };
    }

    // Set first judge
    const firstJudge = playerIds[0]!;
    players[firstJudge]!.isJudge = true;

    const initialState: ACState = {
      gameId: this.gameId,
      gameType: this.gameType,
      promptDeck,
      responseDeck,
      currentPrompt: null,
      players,
      currentJudge: firstJudge,
      playerOrder: playerIds,
      gameOver: false,
      winner: null,
      roundPhase: 'playing',
      submissions: {},
      roundWinner: null,
      gamePhase: 'waiting',
      maxScore,
      roundNumber: 0,
      lastAction: null,
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  protected shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i]!, array[j]!] = [array[j]!, array[i]!];
    }
    return array;
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as ACMove;
      const state = this.currentState as ACState;

      // Validate required fields
      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      if (!state.players[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      if (!['submit', 'judge', 'start_round'].includes(move.action)) {
        return { valid: false, error: 'Action must be submit, judge, or start_round' };
      }

      // Check if game is over
      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      // Validate specific actions
      if (move.action === 'start_round') {
        if (state.gamePhase !== 'waiting') {
          return { valid: false, error: 'Cannot start round in current phase' };
        }
        if (move.player !== state.currentJudge) {
          return { valid: false, error: 'Only the judge can start a round' };
        }
      }

      if (move.action === 'submit') {
        if (state.roundPhase !== 'playing') {
          return { valid: false, error: 'Not in playing phase' };
        }

        if (state.players[move.player]!.isJudge) {
          return { valid: false, error: 'Judge cannot submit cards' };
        }

        if (state.submissions[move.player]) {
          return { valid: false, error: 'Player has already submitted cards' };
        }

        if (!move.cards || !Array.isArray(move.cards)) {
          return { valid: false, error: 'Must provide cards array' };
        }

        const requiredCards = state.currentPrompt?.blanks || 1;
        if (move.cards.length !== requiredCards) {
          return { valid: false, error: `Must submit exactly ${requiredCards} card(s)` };
        }

        // Check if player has these cards
        const playerHand = state.players[move.player]!.hand;
        for (const card of move.cards) {
          if (!playerHand.some((handCard) => handCard.id === card.id)) {
            return { valid: false, error: 'Player does not have submitted card' };
          }
        }
      }

      if (move.action === 'judge') {
        if (state.roundPhase !== 'judging') {
          return { valid: false, error: 'Not in judging phase' };
        }

        if (!state.players[move.player]!.isJudge) {
          return { valid: false, error: 'Only the judge can judge submissions' };
        }

        if (!move.winningPlayer) {
          return { valid: false, error: 'Must specify winning player' };
        }

        if (!state.submissions[move.winningPlayer]) {
          return { valid: false, error: 'Winning player has no submission' };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const acMove = move.moveData as ACMove;
    const state = this.currentState as ACState;

    if (acMove.action === 'start_round') {
      this.startNewRound(state);
    } else if (acMove.action === 'submit') {
      this.submitCards(acMove, state);
    } else if (acMove.action === 'judge') {
      this.judgeSubmissions(acMove, state);
    }
  }

  private startNewRound(state: ACState): void {
    // Draw new prompt
    if (state.promptDeck.length === 0) {
      // Reshuffle if needed (in a real game, you'd need more prompts)
      state.gameOver = true;
      state.gamePhase = 'finished';
      this.determineWinner(state);
      return;
    }

    state.currentPrompt = state.promptDeck.shift()!;
    state.roundNumber++;
    state.roundPhase = 'playing';
    state.gamePhase = 'playing';
    state.submissions = {};
    state.roundWinner = null;

    state.lastAction = {
      action: 'start_round',
      details: `Round ${state.roundNumber} started with prompt: "${state.currentPrompt.text}"`,
    };
  }

  private submitCards(move: ACMove, state: ACState): void {
    const player = state.players[move.player]!;
    const submittedCards = move.cards!;

    // Remove cards from player's hand
    for (const card of submittedCards) {
      const index = player.hand.findIndex((handCard) => handCard.id === card.id);
      if (index !== -1) {
        player.hand.splice(index, 1);
      }
    }

    // Add to submissions
    state.submissions[move.player] = submittedCards;
    player.submittedCards = submittedCards;

    // Draw new cards to refill hand
    const cardsNeeded = this.HAND_SIZE - player.hand.length;
    for (let i = 0; i < cardsNeeded && state.responseDeck.length > 0; i++) {
      player.hand.push(state.responseDeck.shift()!);
    }

    state.lastAction = {
      action: 'submit',
      player: move.player,
      details: `${move.player} submitted ${submittedCards.length} card(s)`,
    };

    // Check if all non-judge players have submitted
    const nonJudgePlayers = state.playerOrder.filter((p) => !state.players[p]!.isJudge);
    const submittedPlayers = Object.keys(state.submissions);

    if (submittedPlayers.length === nonJudgePlayers.length) {
      state.roundPhase = 'judging';
      state.lastAction = {
        action: 'all_submitted',
        details: 'All players have submitted. Judge can now choose the winner.',
      };
    }
  }

  private judgeSubmissions(move: ACMove, state: ACState): void {
    const winningPlayer = move.winningPlayer!;

    // Award point to winning player
    state.players[winningPlayer]!.score++;
    state.roundWinner = winningPlayer;
    state.roundPhase = 'scoring';

    state.lastAction = {
      action: 'judge',
      player: move.player,
      details: `${winningPlayer} wins the round!`,
    };

    // Check for game winner
    if (state.players[winningPlayer]!.score >= state.maxScore) {
      state.gameOver = true;
      state.winner = winningPlayer;
      state.gamePhase = 'finished';

      state.lastAction = {
        action: 'game_end',
        details: `${winningPlayer} wins the game with ${state.players[winningPlayer]!.score} points!`,
      };
    } else {
      // Rotate judge
      this.rotateJudge(state);
      state.roundPhase = 'playing';
      state.gamePhase = 'waiting';

      // Clear submitted cards
      for (const player of Object.values(state.players)) {
        player.submittedCards = [];
      }
    }
  }

  private rotateJudge(state: ACState): void {
    // Remove judge status from current judge
    state.players[state.currentJudge]!.isJudge = false;

    // Find next judge
    const currentIndex = state.playerOrder.indexOf(state.currentJudge);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    const nextJudge = state.playerOrder[nextIndex]!;

    // Set new judge
    state.currentJudge = nextJudge;
    state.players[nextJudge]!.isJudge = true;
  }

  private determineWinner(state: ACState): void {
    let maxScore = 0;
    let winners: string[] = [];

    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.score > maxScore) {
        maxScore = player.score;
        winners = [playerId];
      } else if (player.score === maxScore) {
        winners.push(playerId);
      }
    }

    if (winners.length === 1) {
      state.winner = winners[0]!;
    } else {
      // In case of tie, could implement tiebreaker or declare draw
      state.winner = winners[0]!; // For simplicity, first player wins ties
    }

    state.gameOver = true;
    state.gamePhase = 'finished';
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as ACState;

    // Hide other players' hands and response deck
    const sanitizedPlayers: any = {};
    for (const [playerId, player] of Object.entries(state.players)) {
      sanitizedPlayers[playerId] = {
        handSize: player.hand.length,
        score: player.score,
        isJudge: player.isJudge,
        hasSubmitted: !!state.submissions[playerId],
        submittedCards: player.submittedCards, // Show submitted cards after submission
      };
    }

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentJudge,
      gameOver: state.gameOver,
      winner: state.winner,
      currentPrompt: state.currentPrompt,
      players: sanitizedPlayers,
      currentJudge: state.currentJudge,
      playerOrder: state.playerOrder,
      roundPhase: state.roundPhase,
      submissions: state.submissions,
      roundWinner: state.roundWinner,
      gamePhase: state.gamePhase,
      maxScore: state.maxScore,
      roundNumber: state.roundNumber,
      lastAction: state.lastAction,
      promptDeckSize: state.promptDeck.length,
      responseDeckSize: state.responseDeck.length,
    };
  }

  async getPlayerHand(playerId: string): Promise<ResponseCard[]> {
    const state = this.currentState as ACState;
    return state.players[playerId]?.hand || [];
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as ACState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as ACState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Against Cards',
      description: 'Hilarious party game where players submit response cards to complete prompts',
      minPlayers: 3,
      maxPlayers: 10,
      estimatedDuration: '30-60 minutes',
      complexity: 'beginner',
      categories: ['party', 'humor', 'social', 'cards'],
    };
  }
}

export function createAgainstCardsGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): AgainstCardsGame {
  return new AgainstCardsGame(gameId, database);
}

// ── Market Status ────────────────────────────────────────────────────
export type MarketStatus = 'open' | 'locked' | 'resolved' | 'cancelled';
export type MarketType = 'match_outcome' | 'tournament_winner' | 'in_game_prop' | 'agent_vs_agent';

// ── Prediction Market ────────────────────────────────────────────────
export interface PredictionMarket {
  id: string;
  marketType: MarketType;
  /** Associated room (for match-level markets) */
  roomId: string | null;
  /** Associated tournament (for tournament-level markets) */
  tournamentId: string | null;
  /** Human-readable question, e.g. "Who wins this chess match?" */
  question: string;
  /** Possible outcomes, e.g. ["Player A", "Player B", "Draw"] */
  outcomes: string[];
  status: MarketStatus;
  /** How this market gets resolved */
  resolutionSource: 'game_result' | 'tournament_result' | 'oracle' | 'admin';
  /** Total pool across all outcomes (in USD-equivalent) */
  totalPool: number;
  /** Pool amounts per outcome index */
  outcomePools: number[];
  /** Token used for betting */
  token: string;
  /** Index of the winning outcome (-1 if unresolved) */
  winningOutcomeIndex: number;
  createdAt: number;
  closesAt: number;
  resolvedAt: number | null;
}

// ── Market Position (individual bet) ─────────────────────────────────
export interface MarketPosition {
  id: string;
  marketId: string;
  userId: string;
  /** Which outcome this bet is on (index into outcomes array) */
  outcomeIndex: number;
  /** Amount wagered */
  amount: number;
  token: string;
  /** Potential payout at time of bet (for display) */
  potentialPayout: number;
  /** Whether this position has been settled */
  settled: boolean;
  /** Actual payout after resolution (0 if lost) */
  payout: number;
  createdAt: number;
}

// ── Market Creation Request ──────────────────────────────────────────
export interface CreateMarketRequest {
  marketType: MarketType;
  roomId?: string;
  tournamentId?: string;
  question: string;
  outcomes: string[];
  closesAt: number;
  token?: string;
}

// ── Place Bet Request ────────────────────────────────────────────────
export interface PlaceBetRequest {
  marketId: string;
  outcomeIndex: number;
  amount: number;
}

// ── Market Odds (computed) ───────────────────────────────────────────
export interface MarketOdds {
  marketId: string;
  outcomes: string[];
  /** Implied probability per outcome (0-1, sums to 1) */
  impliedProbabilities: number[];
  /** Payout multiplier per outcome */
  payoutMultipliers: number[];
  totalPool: number;
}

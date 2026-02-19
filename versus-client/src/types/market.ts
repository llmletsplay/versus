export type MarketStatus = 'open' | 'locked' | 'resolved' | 'cancelled';
export type MarketType = 'match_outcome' | 'tournament_winner' | 'in_game_prop' | 'agent_vs_agent';

export interface PredictionMarket {
  id: string;
  marketType: MarketType;
  roomId: string | null;
  tournamentId: string | null;
  question: string;
  outcomes: string[];
  status: MarketStatus;
  resolutionSource: 'game_result' | 'tournament_result' | 'oracle' | 'admin';
  totalPool: number;
  outcomePools: number[];
  token: string;
  winningOutcomeIndex: number;
  createdAt: number;
  closesAt: number;
  resolvedAt: number | null;
}

export interface MarketPosition {
  id: string;
  marketId: string;
  userId: string;
  outcomeIndex: number;
  amount: number;
  token: string;
  potentialPayout: number;
  settled: boolean;
  payout: number;
  createdAt: number;
}

export interface PlaceBetRequest {
  marketId: string;
  outcomeIndex: number;
  amount: number;
}

export interface MarketOdds {
  marketId: string;
  outcomes: string[];
  impliedProbabilities: number[];
  payoutMultipliers: number[];
  totalPool: number;
}

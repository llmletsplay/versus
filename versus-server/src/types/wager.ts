import type { ChainNetwork, StakeCommitment, IntentStatus } from './intent.js';

export type WagerStatus =
  | 'proposed'
  | 'committed'
  | 'locked'
  | 'in_progress'
  | 'completed'
  | 'settled'
  | 'cancelled'
  | 'disputed';

export interface WagerMatch {
  id: string;
  gameType: string;
  status: WagerStatus;
  playerA: WagerPlayer;
  playerB: WagerPlayer | null;
  stakeAmount: string;
  stakeToken: string;
  stakeChain: ChainNetwork;
  platformFeePercent: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  settledAt: number | null;
  gameId: string | null;
  marketId: string | null;
  escrowAddress: string | null;
}

export interface WagerPlayer {
  oderId: string;
  walletAddress: string | null;
  agentId: string | null;
  hasCommitted: boolean;
  commitmentSignature: string | null;
  committedAt: number | null;
}

export interface CreateWagerRequest {
  gameType: string;
  stakeAmount: string;
  stakeToken: string;
  stakeChain: ChainNetwork;
  playerAAddress: string;
  playerAAgentId?: string;
  playerBAddress?: string;
  playerBAgentId?: string;
  options?: {
    isRanked?: boolean;
    timeControl?: string;
    marketEnabled?: boolean;
  };
}

export interface CommitStakeRequest {
  wagerId: string;
  walletAddress: string;
  amount: string;
  signature: string;
}

export interface WagerCommitment {
  id: string;
  wagerId: string;
  playerId: string;
  walletAddress: string;
  amount: string;
  signature: string;
  signedAt: number;
  confirmed: boolean;
}

export interface WagerIntentMapping {
  wagerId: string;
  intentId: string;
  intentType: 'stake_lock' | 'conditional_transfer' | 'resolve_event';
  status: IntentStatus;
  createdAt: number;
}

export interface WagerResolution {
  wagerId: string;
  winnerId: string | null;
  winnerAddress: string | null;
  loserId: string | null;
  loserAddress: string | null;
  totalPot: string;
  winnerPayout: string;
  platformFee: string;
  proofId: string;
  intentId: string | null;
  settled: boolean;
  settledAt: number | null;
}

export interface WagerFilters {
  gameType?: string;
  status?: WagerStatus;
  playerId?: string;
  minStake?: string;
  maxStake?: string;
  limit?: number;
  offset?: number;
}

export interface WagerListItem {
  id: string;
  gameType: string;
  status: WagerStatus;
  playerA: {
    oderId: string;
    agentId: string | null;
    hasCommitted: boolean;
  };
  playerB: {
    oderId: string;
    agentId: string | null;
    hasCommitted: boolean;
  } | null;
  stakeAmount: string;
  stakeToken: string;
  createdAt: number;
}

export interface WagerState {
  wager: WagerMatch;
  commitments: WagerCommitment[];
  intents: WagerIntentMapping[];
  resolution: WagerResolution | null;
}

export interface WagerPaymentInfo {
  wagerId: string;
  paymentRequired: {
    scheme: 'exact';
    network: ChainNetwork;
    asset: string;
    amount: string;
    recipient: string;
  };
  purpose: 'wager_commitment' | 'match_creation' | 'market_participation';
  reference: string;
}

export interface WagerSettlementRequest {
  wagerId: string;
  winnerId: string;
  winnerAddress: string;
  loserId: string;
  loserAddress: string;
}

export interface WagerDisputeRequest {
  wagerId: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface WagerCancellationRequest {
  wagerId: string;
  reason: string;
  refundPlayers?: boolean;
}

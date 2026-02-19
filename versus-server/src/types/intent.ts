export type IntentType =
  | 'conditional_transfer'
  | 'conditional_pool_entry'
  | 'resolve_event'
  | 'stake_lock';

export type IntentStatus =
  | 'pending'
  | 'signed'
  | 'broadcast'
  | 'executing'
  | 'completed'
  | 'expired'
  | 'failed';

export type SignatureScheme = 'eip191' | 'ed25519' | 'solana';

export type ChainNetwork = 'base' | 'near' | 'solana' | 'ethereum' | 'arbitrum';

export interface PaymentCondition {
  recipient: string;
  amount: string;
  chain: ChainNetwork;
  token: string;
}

export interface ConditionalOutcome {
  outcome: string;
  payout: PaymentCondition;
}

export interface StakeCommitment {
  wallet: string;
  amount: string;
  chain: ChainNetwork;
  signature: string;
  signedAt: number;
  signatureScheme: SignatureScheme;
}

export interface BaseIntent {
  id: string;
  type: IntentType;
  eventId: string;
  createdAt: number;
  expiresAt: number;
  status: IntentStatus;
  chain: ChainNetwork;
}

export interface MatchWagerIntent extends BaseIntent {
  type: 'conditional_transfer';
  conditions: {
    [outcome: string]: PaymentCondition;
  };
  stakesLocked: StakeCommitment[];
  proofType: 'deterministic_game_history';
  gameType: string;
}

export interface PredictionMarketIntent extends BaseIntent {
  type: 'conditional_pool_entry';
  marketId: string;
  predictionOutcome: number;
  amount: string;
  payoutFormula: 'proportional' | 'fixed';
}

export interface ResolveEventIntent extends BaseIntent {
  type: 'resolve_event';
  finalOutcome: string;
  proof: OutcomeProof | null;
  signature: string | null;
  proofType: 'deterministic_game_history' | 'threshold_signature' | 'admin';
}

export interface StakeLockIntent extends BaseIntent {
  type: 'stake_lock';
  stakesLocked: StakeCommitment[];
  unlockCondition: 'game_started' | 'opponent_joined' | 'cancelled';
}

export interface IntentTransaction {
  id: string;
  intentId: string;
  chain: ChainNetwork;
  txHash: string | null;
  status: IntentStatus;
  solverId: string | null;
  createdAt: number;
  confirmedAt: number | null;
  error: string | null;
}

export interface IntentSignature {
  signer: string;
  signature: string;
  scheme: SignatureScheme;
  signedAt: number;
  message: string;
}

export interface X402PaymentRequirement {
  version: string;
  accepts: X402PaymentAccept[];
  payload: Record<string, unknown>;
}

export interface X402PaymentAccept {
  scheme: 'exact' | 'minimum';
  network: ChainNetwork;
  asset: string;
  amount: string;
  recipient: string;
}

export interface IntentCreationRequest {
  type: IntentType;
  eventId: string;
  chain: ChainNetwork;
  expiresAt: number;
  conditions?: ConditionalOutcome[];
  stakesLocked?: StakeCommitment[];
  proofType?: 'deterministic_game_history' | 'threshold_signature' | 'admin';
  gameType?: string;
  marketId?: string;
  predictionOutcome?: number;
  amount?: string;
  payoutFormula?: 'proportional' | 'fixed';
}

export interface IntentBroadcastRequest {
  intentId: string;
  solverEndpoint?: string;
}

export interface OutcomeProof {
  matchId: string;
  gameType: string;
  initialStateHash: string;
  moveSignatures: MoveSignature[];
  finalStateHash: string;
  winner: string | null;
  gameRulesCommit: string;
  createdAt: number;
}

export interface MoveSignature {
  playerId: string;
  moveIndex: number;
  moveData: Record<string, unknown>;
  signature: string;
  timestamp: number;
  signatureScheme: SignatureScheme;
}

export interface IntentVerificationResult {
  valid: boolean;
  proof?: OutcomeProof;
  error?: string;
}

export interface SolverInfo {
  id: string;
  endpoint: string;
  supportedChains: ChainNetwork[];
  feeBps: number;
  latencyMs: number;
}

export interface SolverQuote {
  solverId: string;
  feeAmount: string;
  feeToken: string;
  estimatedExecutionTime: number;
  expiresAt: number;
}

export interface IntentSettlementRequest {
  intentId: string;
  outcomeProof: OutcomeProof;
  solverId?: string;
}

export interface IntentSettlementResult {
  success: boolean;
  transactionId: string | null;
  txHash: string | null;
  error?: string;
}

import type { SignatureScheme } from './intent.js';

export interface GameMoveRecord {
  moveIndex: number;
  playerId: string;
  moveData: Record<string, unknown>;
  timestamp: number;
}

export interface SignedMove extends GameMoveRecord {
  signature: string;
  signatureScheme: SignatureScheme;
}

export interface GameStateSnapshot {
  gameId: string;
  gameType: string;
  players: string[];
  state: Record<string, unknown>;
  status: 'waiting' | 'active' | 'completed' | 'abandoned';
  currentPlayer: string | null;
  winner: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface OutcomeProofData {
  matchId: string;
  gameId: string;
  gameType: string;
  initialState: GameStateSnapshot;
  moves: SignedMove[];
  finalState: GameStateSnapshot;
  winner: string | null;
  isDraw: boolean;
  gameRulesHash: string;
  createdAt: number;
}

export interface DeterministicProof {
  proofId: string;
  matchId: string;
  gameId: string;
  gameType: string;
  initialStateHash: string;
  moveMerkleRoot: string;
  finalStateHash: string;
  winner: string | null;
  isDraw: boolean;
  gameRulesHash: string;
  moveCount: number;
  playerCount: number;
  createdAt: number;
  verifiedAt: number | null;
  verificationError: string | null;
}

export interface ProofVerificationRequest {
  proof: DeterministicProof;
  gameRules: string;
  expectedWinner: string | null;
}

export interface ProofVerificationResult {
  valid: boolean;
  matchId: string;
  winner: string | null;
  isDraw: boolean;
  moveCount: number;
  error: string | null;
  verifiedAt: number;
}

export interface OutcomeAttestation {
  id: string;
  matchId: string;
  gameId: string;
  outcome: 'win_a' | 'win_b' | 'draw';
  winnerAddress: string | null;
  loserAddress: string | null;
  amount: string;
  proofId: string;
  signatures: OutcomeAttestationSignature[];
  status: 'pending' | 'signed' | 'broadcast' | 'settled' | 'failed';
  createdAt: number;
  settledAt: number | null;
}

export interface OutcomeAttestationSignature {
  signer: string;
  signature: string;
  signedAt: number;
  role: 'server' | 'referee';
}

export interface SettlementPayload {
  matchId: string;
  winner: string | null;
  loser: string | null;
  winnerPayout: string;
  loserPayout: string;
  platformFee: string;
  proofId: string;
  intentId: string;
  chain: string;
  timestamp: number;
}

export interface CrossChainSettlementRequest {
  matchId: string;
  fromChain: string;
  toChain: string;
  recipient: string;
  amount: string;
  token: string;
  intentId: string;
  proofId: string;
}

export interface SettlementTransaction {
  id: string;
  matchId: string;
  intentId: string;
  chain: string;
  txHash: string | null;
  status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  amount: string;
  recipient: string;
  createdAt: number;
  confirmedAt: number | null;
  error: string | null;
}

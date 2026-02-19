// ── Escrow Status Lifecycle ───────────────────────────────────────────
export type EscrowStatus =
  | 'pending' // Escrow created, awaiting deposits
  | 'funded' // All players deposited
  | 'released' // Winner paid out
  | 'refunded' // Funds returned (e.g., opponent never joined)
  | 'disputed' // Under dispute resolution
  | 'cancelled'; // Cancelled before funding

// ── Escrow Transaction ───────────────────────────────────────────────
export interface EscrowTransaction {
  id: string;
  roomId: string;
  gameId: string | null;
  /** On-chain escrow contract address */
  contractAddress: string | null;
  chainId: number;
  /** Total pot size (sum of all deposits) */
  totalAmount: number;
  /** Token used for wagers */
  token: string;
  /** Platform fee percentage (e.g., 2.5) */
  platformFeePercent: number;
  status: EscrowStatus;
  /** Winner's address for payout */
  winnerAddress: string | null;
  /** Oracle-signed game result for on-chain verification */
  resultSignature: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

// ── Individual Deposit ───────────────────────────────────────────────
export interface EscrowDeposit {
  id: string;
  escrowId: string;
  userId: string;
  walletAddress: string;
  amount: number;
  token: string;
  txHash: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: number;
  confirmedAt: number | null;
}

// ── Escrow Creation Request ──────────────────────────────────────────
export interface CreateEscrowRequest {
  roomId: string;
  wagerAmount: number;
  token: string;
  chainId?: number;
}

// ── Escrow Resolution ────────────────────────────────────────────────
export interface ResolveEscrowRequest {
  escrowId: string;
  winnerId: string;
  winnerAddress: string;
  /** Hash of the full move history for auditability */
  gameHistoryHash: string;
}

// ── Wallet Connection ────────────────────────────────────────────────
export interface WalletInfo {
  userId: string;
  address: string;
  chainId: number;
  provider: 'metamask' | 'coinbase' | 'walletconnect' | 'other';
  connectedAt: number;
}

// ── Supported Chains ─────────────────────────────────────────────────
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  escrowContractAddress: string;
  supportedTokens: string[];
}

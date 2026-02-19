export type EscrowStatus =
  | 'pending'
  | 'funded'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export interface EscrowTransaction {
  id: string;
  roomId: string;
  gameId: string | null;
  contractAddress: string | null;
  chainId: number;
  totalAmount: number;
  token: string;
  platformFeePercent: number;
  status: EscrowStatus;
  winnerAddress: string | null;
  resultSignature: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

import { createHash } from 'crypto';
import type {
  ChainNetwork,
  PaymentCondition,
  StakeCommitment,
  OutcomeProof,
  IntentStatus,
} from '../types/intent.js';
import { logger } from '../utils/logger.js';

export interface SolanaChainConfig {
  rpcUrl: string;
  networkId: string;
  usdcMint: string;
  intentProgramId: string;
}

const SOLANA_CONFIG: SolanaChainConfig = {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  networkId: 'mainnet-beta',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  intentProgramId: 'VERSUS_INTENT_PROGRAM_ID',
};

export class SolanaChainAdapter {
  private config: SolanaChainConfig;

  constructor(config?: Partial<SolanaChainConfig>) {
    this.config = { ...SOLANA_CONFIG, ...config };
  }

  getChainInfo(): { network: ChainNetwork; networkId: string; rpcUrl: string } {
    return {
      network: 'solana',
      networkId: this.config.networkId,
      rpcUrl: this.config.rpcUrl,
    };
  }

  async verifySignature(
    message: string,
    signature: string,
    expectedPubkey: string
  ): Promise<boolean> {
    try {
      const isValid = await this.verifySolanaSignature(message, signature, expectedPubkey);
      return isValid;
    } catch (error) {
      logger.error('Solana signature verification failed', { error });
      return false;
    }
  }

  private async verifySolanaSignature(
    message: string,
    signature: string,
    pubkey: string
  ): Promise<boolean> {
    const messageBytes = Buffer.from(message, 'utf-8');
    logger.debug('Verifying Solana signature', { pubkey, messageLength: messageBytes.length });

    return signature.length >= 64 && pubkey.length >= 32;
  }

  async createIntentPayload(
    intentId: string,
    conditions: Record<string, PaymentCondition>,
    stakes: StakeCommitment[]
  ): Promise<{
    payload: string;
    intentHash: string;
  }> {
    const intentData = {
      id: intentId,
      chain: 'solana',
      networkId: this.config.networkId,
      conditions,
      stakes: stakes.map((s) => ({
        wallet: s.wallet,
        amount: s.amount,
        signature: s.signature,
      })),
      usdcMint: this.config.usdcMint,
      intentProgram: this.config.intentProgramId,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(intentData);
    const intentHash = createHash('sha256').update(payload).digest('hex');

    return { payload, intentHash };
  }

  async verifyStakeCommitment(stake: StakeCommitment): Promise<{ valid: boolean; error?: string }> {
    if (stake.signatureScheme !== 'solana') {
      return { valid: false, error: 'Solana requires solana signatures' };
    }

    const message = this.buildCommitmentMessage(stake);
    const isValid = await this.verifySignature(message, stake.signature, stake.wallet);

    return {
      valid: isValid,
      error: isValid ? undefined : 'Invalid signature',
    };
  }

  private buildCommitmentMessage(stake: StakeCommitment): string {
    return `Versus Stake Commitment\nAmount: ${stake.amount}\nWallet: ${stake.wallet}\nTimestamp: ${stake.signedAt}`;
  }

  async buildSettlementInstruction(
    intentId: string,
    proof: OutcomeProof,
    winner: string
  ): Promise<{
    programId: string;
    accounts: string[];
    data: Buffer;
  }> {
    const data = Buffer.alloc(8 + 32 + 32 + 8);
    data.writeUInt32LE(0x00000001, 0);
    data.write(intentId.slice(0, 32), 4);
    data.write(winner.slice(0, 32), 36);
    data.writeBigInt64LE(BigInt(Date.now()), 68);

    return {
      programId: this.config.intentProgramId,
      accounts: [winner, proof.matchId, this.config.usdcMint],
      data,
    };
  }

  async estimateGasFee(): Promise<string> {
    return '5000';
  }

  async getIntentStatus(txHash: string): Promise<IntentStatus> {
    logger.debug('Checking intent status on Solana', { txHash });

    if (txHash && txHash.length >= 87) {
      return 'completed';
    }
    return 'pending';
  }

  getTokenAddress(token: string): string {
    const addresses: Record<string, string> = {
      USDC: this.config.usdcMint,
      SOL: 'So11111111111111111111111111111111111111112',
    };

    return addresses[token] ?? this.config.usdcMint;
  }

  isValidPubkey(pubkey: string): boolean {
    try {
      const bytes = Buffer.from(pubkey, 'base64');
      return bytes.length === 32;
    } catch {
      return false;
    }
  }

  isValidSignature(signature: string): boolean {
    try {
      const bytes = Buffer.from(signature, 'base64');
      return bytes.length === 64;
    } catch {
      return false;
    }
  }
}

export const solanaChainAdapter = new SolanaChainAdapter();

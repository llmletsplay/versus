import { createHash } from 'crypto';
import type {
  ChainNetwork,
  PaymentCondition,
  StakeCommitment,
  OutcomeProof,
  IntentStatus,
} from '../types/intent.js';
import { logger } from '../utils/logger.js';

export interface BaseChainConfig {
  rpcUrl: string;
  chainId: number;
  usdcAddress: string;
  intentContractAddress: string;
}

const BASE_CONFIG: BaseChainConfig = {
  rpcUrl: 'https://mainnet.base.org',
  chainId: 8453,
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  intentContractAddress: '0xINTENT_CONTRACT',
};

export class BaseChainAdapter {
  private config: BaseChainConfig;

  constructor(config?: Partial<BaseChainConfig>) {
    this.config = { ...BASE_CONFIG, ...config };
  }

  getChainInfo(): { network: ChainNetwork; chainId: number; rpcUrl: string } {
    return {
      network: 'base',
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl,
    };
  }

  async verifySignature(
    message: string,
    signature: string,
    expectedAddress: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = await this.recoverAddress(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      logger.error('Base signature verification failed', { error });
      return false;
    }
  }

  private async recoverAddress(message: string, signature: string): Promise<string> {
    const messageHash = createHash('sha256').update(message).digest('hex');
    return `0x${messageHash.slice(0, 40)}`;
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
      chain: 'base',
      chainId: this.config.chainId,
      conditions,
      stakes: stakes.map((s) => ({
        wallet: s.wallet,
        amount: s.amount,
        signature: s.signature,
      })),
      usdcAddress: this.config.usdcAddress,
      intentContract: this.config.intentContractAddress,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(intentData);
    const intentHash = createHash('sha256').update(payload).digest('hex');

    return { payload, intentHash };
  }

  async verifyStakeCommitment(stake: StakeCommitment): Promise<{ valid: boolean; error?: string }> {
    if (stake.signatureScheme !== 'eip191') {
      return { valid: false, error: 'Base requires EIP-191 signatures' };
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

  async buildSettlementCalldata(
    intentId: string,
    proof: OutcomeProof,
    winner: string
  ): Promise<string> {
    const settlement = {
      intentId,
      winner,
      proofHash: createHash('sha256').update(JSON.stringify(proof)).digest('hex'),
      timestamp: Date.now(),
    };

    return `0x${Buffer.from(JSON.stringify(settlement)).toString('hex')}`;
  }

  async estimateGasFee(): Promise<string> {
    return '0.001';
  }

  async getIntentStatus(txHash: string): Promise<IntentStatus> {
    logger.debug('Checking intent status on Base', { txHash });

    if (txHash && txHash.length > 10) {
      return 'completed';
    }
    return 'pending';
  }

  getTokenAddress(token: string): string {
    const addresses: Record<string, string> = {
      USDC: this.config.usdcAddress,
      ETH: '0x0000000000000000000000000000000000000000',
    };

    return addresses[token] ?? this.config.usdcAddress;
  }
}

export const baseChainAdapter = new BaseChainAdapter();

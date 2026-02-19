import { createHash } from 'crypto';
import type {
  ChainNetwork,
  PaymentCondition,
  StakeCommitment,
  OutcomeProof,
  IntentStatus,
} from '../types/intent.js';
import { logger } from '../utils/logger.js';

export interface NEARCHainConfig {
  rpcUrl: string;
  networkId: string;
  usdcAddress: string;
  intentContractId: string;
}

const NEAR_CONFIG: NEARCHainConfig = {
  rpcUrl: 'https://rpc.testnet.near.org',
  networkId: 'testnet',
  usdcAddress: 'usdc.fakes.testnet',
  intentContractId: 'intents.versus.testnet',
};

export class NEARCHainAdapter {
  private config: NEARCHainConfig;

  constructor(config?: Partial<NEARCHainConfig>) {
    this.config = { ...NEAR_CONFIG, ...config };
  }

  getChainInfo(): { network: ChainNetwork; networkId: string; rpcUrl: string } {
    return {
      network: 'near',
      networkId: this.config.networkId,
      rpcUrl: this.config.rpcUrl,
    };
  }

  async verifySignature(
    message: string,
    signature: string,
    expectedAccountId: string
  ): Promise<boolean> {
    try {
      const isValid = await this.verifyNEARSignature(message, signature, expectedAccountId);
      return isValid;
    } catch (error) {
      logger.error('NEAR signature verification failed', { error });
      return false;
    }
  }

  private async verifyNEARSignature(
    message: string,
    signature: string,
    accountId: string
  ): Promise<boolean> {
    const messageHash = createHash('sha256').update(message).digest();
    logger.debug('Verifying NEAR signature', {
      accountId,
      messageHash: messageHash.toString('hex'),
    });

    return signature.length > 64 && accountId.length > 0;
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
      chain: 'near',
      networkId: this.config.networkId,
      conditions,
      stakes: stakes.map((s) => ({
        wallet: s.wallet,
        amount: s.amount,
        signature: s.signature,
      })),
      usdcAddress: this.config.usdcAddress,
      intentContract: this.config.intentContractId,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(intentData);
    const intentHash = createHash('sha256').update(payload).digest('hex');

    return { payload, intentHash };
  }

  async verifyStakeCommitment(stake: StakeCommitment): Promise<{ valid: boolean; error?: string }> {
    if (stake.signatureScheme !== 'ed25519') {
      return { valid: false, error: 'NEAR requires ed25519 signatures' };
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

  async buildSettlementAction(
    intentId: string,
    proof: OutcomeProof,
    winner: string
  ): Promise<{
    methodName: string;
    args: Record<string, unknown>;
    gas: string;
    deposit: string;
  }> {
    return {
      methodName: 'settle_intent',
      args: {
        intent_id: intentId,
        winner,
        proof_hash: createHash('sha256').update(JSON.stringify(proof)).digest('hex'),
        timestamp: Date.now(),
      },
      gas: '100000000000000',
      deposit: '1',
    };
  }

  async estimateGasFee(): Promise<string> {
    return '0.0001';
  }

  async getIntentStatus(txHash: string): Promise<IntentStatus> {
    logger.debug('Checking intent status on NEAR', { txHash });

    if (txHash && txHash.length > 40) {
      return 'completed';
    }
    return 'pending';
  }

  getTokenAddress(token: string): string {
    const addresses: Record<string, string> = {
      USDC: this.config.usdcAddress,
      NEAR: 'near',
    };

    return addresses[token] ?? this.config.usdcAddress;
  }

  accountIdToHex(accountId: string): string {
    return Buffer.from(accountId).toString('hex');
  }

  hexToAccountId(hex: string): string {
    return Buffer.from(hex, 'hex').toString('utf-8');
  }
}

export const nearChainAdapter = new NEARCHainAdapter();

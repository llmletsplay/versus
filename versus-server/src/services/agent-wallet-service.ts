import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export interface AgentWalletConfig {
  enabled: boolean;
  acpEndpoint?: string;
  defaultChain?: 'base' | 'near' | 'solana';
}

const DEFAULT_CONFIG: AgentWalletConfig = {
  enabled: true,
  acpEndpoint: 'https://api.virtuals.io/acp',
  defaultChain: 'base',
};

export interface AgentWallet {
  id: string;
  agentId: string;
  ownerUserId: string;
  address: string;
  chain: string;
  balance: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'deposit' | 'withdraw' | 'wager' | 'payout' | 'fee';
  amount: string;
  token: string;
  txHash: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  reference: string | null;
  createdAt: number;
  confirmedAt: number | null;
}

export interface ACPAgentInfo {
  agentId: string;
  walletAddress: string;
  balance: string;
  isActive: boolean;
}

export class AgentWalletService {
  private db: DatabaseProvider;
  private config: AgentWalletConfig;

  constructor(db: DatabaseProvider, config?: Partial<AgentWalletConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS agent_wallets (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL,
        address TEXT NOT NULL,
        chain TEXT NOT NULL,
        balance TEXT NOT NULL DEFAULT '0',
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount TEXT NOT NULL,
        token TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        reference TEXT,
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_agent_wallets_agent ON agent_wallets(agent_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
    `);

    logger.info('Agent wallet service initialized');
  }

  async createWallet(agentId: string, ownerUserId: string, chain?: string): Promise<AgentWallet> {
    const existing = await this.getWalletByAgent(agentId);
    if (existing) {
      return existing;
    }

    const walletId = `wallet-${uuidv4()}`;
    const address = await this.generateWalletAddress(
      agentId,
      chain ?? this.config.defaultChain ?? 'base'
    );
    const now = Date.now();

    const wallet: AgentWallet = {
      id: walletId,
      agentId,
      ownerUserId,
      address,
      chain: chain ?? this.config.defaultChain ?? 'base',
      balance: '0',
      isActive: true,
      createdAt: now,
      lastUsedAt: null,
    };

    await this.db.execute(
      `INSERT INTO agent_wallets (id, agent_id, owner_user_id, address, chain, balance, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wallet.id,
        wallet.agentId,
        wallet.ownerUserId,
        wallet.address,
        wallet.chain,
        wallet.balance,
        1,
        wallet.createdAt,
      ]
    );

    logger.info('Created agent wallet', { walletId, agentId, address });

    return wallet;
  }

  async getWallet(walletId: string): Promise<AgentWallet | null> {
    const row = await this.db.get<any>(`SELECT * FROM agent_wallets WHERE id = ?`, [walletId]);

    if (!row) return null;

    return this.deserializeWallet(row);
  }

  async getWalletByAgent(agentId: string): Promise<AgentWallet | null> {
    const row = await this.db.get<any>(`SELECT * FROM agent_wallets WHERE agent_id = ?`, [agentId]);

    if (!row) return null;

    return this.deserializeWallet(row);
  }

  async getWalletByAddress(address: string): Promise<AgentWallet | null> {
    const row = await this.db.get<any>(`SELECT * FROM agent_wallets WHERE address = ?`, [
      address.toLowerCase(),
    ]);

    if (!row) return null;

    return this.deserializeWallet(row);
  }

  async getWalletsByOwner(ownerUserId: string): Promise<AgentWallet[]> {
    const rows = await this.db.query<any>(`SELECT * FROM agent_wallets WHERE owner_user_id = ?`, [
      ownerUserId,
    ]);

    return rows.map((row: any) => this.deserializeWallet(row));
  }

  async updateBalance(walletId: string, newBalance: string): Promise<void> {
    await this.db.execute(`UPDATE agent_wallets SET balance = ?, last_used_at = ? WHERE id = ?`, [
      newBalance,
      Date.now(),
      walletId,
    ]);
  }

  async deposit(
    walletId: string,
    amount: string,
    token: string,
    txHash: string | null
  ): Promise<WalletTransaction> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const txId = `tx-${uuidv4()}`;
    const now = Date.now();

    const newBalance = (BigInt(wallet.balance) + BigInt(amount)).toString();
    await this.updateBalance(walletId, newBalance);

    await this.db.execute(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, token, tx_hash, status, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, walletId, 'deposit', amount, token, txHash, 'confirmed', now, now]
    );

    logger.info('Agent wallet deposit', { walletId, amount, token });

    return {
      id: txId,
      walletId,
      type: 'deposit',
      amount,
      token,
      txHash,
      status: 'confirmed',
      reference: null,
      createdAt: now,
      confirmedAt: now,
    };
  }

  async withdraw(
    walletId: string,
    amount: string,
    token: string,
    toAddress: string
  ): Promise<WalletTransaction> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balanceBN = BigInt(wallet.balance);
    const amountBN = BigInt(amount);

    if (balanceBN < amountBN) {
      throw new Error('Insufficient balance');
    }

    const txId = `tx-${uuidv4()}`;
    const now = Date.now();

    const newBalance = (balanceBN - amountBN).toString();
    await this.updateBalance(walletId, newBalance);

    const txHash = this.generateTxHash(txId);

    await this.db.execute(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, token, tx_hash, status, reference, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, walletId, 'withdraw', amount, token, txHash, 'confirmed', `to:${toAddress}`, now, now]
    );

    logger.info('Agent wallet withdrawal', { walletId, amount, token, toAddress });

    return {
      id: txId,
      walletId,
      type: 'withdraw',
      amount,
      token,
      txHash,
      status: 'confirmed',
      reference: `to:${toAddress}`,
      createdAt: now,
      confirmedAt: now,
    };
  }

  async wager(walletId: string, amount: string, matchId: string): Promise<WalletTransaction> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balanceBN = BigInt(wallet.balance);
    const amountBN = BigInt(amount);

    if (balanceBN < amountBN) {
      throw new Error('Insufficient balance for wager');
    }

    const txId = `tx-${uuidv4()}`;
    const now = Date.now();

    const newBalance = (balanceBN - amountBN).toString();
    await this.updateBalance(walletId, newBalance);

    await this.db.execute(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, token, tx_hash, status, reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, walletId, 'wager', amount, 'USDC', null, 'pending', `match:${matchId}`, now]
    );

    logger.info('Agent wallet wager', { walletId, amount, matchId });

    return {
      id: txId,
      walletId,
      type: 'wager',
      amount,
      token: 'USDC',
      txHash: null,
      status: 'pending',
      reference: `match:${matchId}`,
      createdAt: now,
      confirmedAt: null,
    };
  }

  async payout(
    walletId: string,
    amount: string,
    matchId: string,
    won: boolean
  ): Promise<WalletTransaction> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const txId = `tx-${uuidv4()}`;
    const now = Date.now();

    const newBalance = (BigInt(wallet.balance) + BigInt(amount)).toString();
    await this.updateBalance(walletId, newBalance);

    await this.db.execute(
      `INSERT INTO wallet_transactions (id, wallet_id, type, amount, token, tx_hash, status, reference, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        walletId,
        'payout',
        amount,
        'USDC',
        null,
        'confirmed',
        `match:${matchId}:${won ? 'win' : 'refund'}`,
        now,
        now,
      ]
    );

    logger.info('Agent wallet payout', { walletId, amount, matchId, won });

    return {
      id: txId,
      walletId,
      type: 'payout',
      amount,
      token: 'USDC',
      txHash: null,
      status: 'confirmed',
      reference: `match:${matchId}:${won ? 'win' : 'refund'}`,
      createdAt: now,
      confirmedAt: now,
    };
  }

  async getTransactions(walletId: string): Promise<WalletTransaction[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY created_at DESC`,
      [walletId]
    );

    return rows.map((row: any) => ({
      id: row.id,
      walletId: row.wallet_id,
      type: row.type,
      amount: row.amount,
      token: row.token,
      txHash: row.tx_hash,
      status: row.status,
      reference: row.reference,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  async syncWithACP(agentId: string): Promise<ACPAgentInfo | null> {
    logger.debug('Syncing with ACP', { agentId });

    const wallet = await this.getWalletByAgent(agentId);
    if (!wallet) {
      return null;
    }

    return {
      agentId: wallet.agentId,
      walletAddress: wallet.address,
      balance: wallet.balance,
      isActive: wallet.isActive,
    };
  }

  private async generateWalletAddress(agentId: string, chain: string): Promise<string> {
    const hash = createHash('sha256')
      .update(agentId)
      .update(chain)
      .update(Date.now().toString())
      .digest('hex');

    if (chain === 'base' || chain === 'ethereum' || chain === 'arbitrum') {
      return `0x${hash.slice(0, 40)}`;
    }

    if (chain === 'near') {
      return `agent-${agentId.slice(0, 8)}.versus.testnet`;
    }

    if (chain === 'solana') {
      return hash.slice(0, 44);
    }

    return `0x${hash.slice(0, 40)}`;
  }

  private generateTxHash(id: string): string {
    return `0x${createHash('sha256').update(id).update(Date.now().toString()).digest('hex').slice(0, 64)}`;
  }

  private deserializeWallet(row: any): AgentWallet {
    return {
      id: row.id,
      agentId: row.agent_id,
      ownerUserId: row.owner_user_id,
      address: row.address,
      chain: row.chain,
      balance: row.balance,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }
}

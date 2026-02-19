import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export interface VersusTokenConfig {
  enabled: boolean;
  symbol: string;
  name: string;
  decimals: number;
  baseChainAddress?: string;
  nearContractId?: string;
  solanaMint?: string;
  totalSupply?: string;
}

const DEFAULT_CONFIG: VersusTokenConfig = {
  enabled: true,
  symbol: 'VERSUS',
  name: 'Versus Token',
  decimals: 18,
  totalSupply: '1000000000000000000000000000', // 1 billion
};

export interface TokenBalance {
  walletAddress: string;
  balance: string;
  chain: string;
  updatedAt: number;
}

export interface TokenTransfer {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  chain: string;
  txHash: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: number;
  confirmedAt: number | null;
}

export interface StakingPosition {
  id: string;
  walletAddress: string;
  amount: string;
  chain: string;
  rewardsEarned: string;
  lockedUntil: number | null;
  createdAt: number;
}

export class VersusTokenService {
  private db: DatabaseProvider;
  private config: VersusTokenConfig;

  constructor(db: DatabaseProvider, config?: Partial<VersusTokenConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS versus_token_balances (
        wallet_address TEXT NOT NULL,
        chain TEXT NOT NULL,
        balance TEXT NOT NULL DEFAULT '0',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (wallet_address, chain)
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS versus_token_transfers (
        id TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        chain TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS versus_staking_positions (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        chain TEXT NOT NULL,
        rewards_earned TEXT DEFAULT '0',
        locked_until INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS versus_token_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    logger.info('VERSUS token service initialized', { symbol: this.config.symbol });
  }

  getTokenInfo(): {
    symbol: string;
    name: string;
    decimals: number;
    totalSupply: string;
    addresses: {
      base?: string;
      near?: string;
      solana?: string;
    };
  } {
    return {
      symbol: this.config.symbol,
      name: this.config.name,
      decimals: this.config.decimals,
      totalSupply: this.config.totalSupply ?? '0',
      addresses: {
        base: this.config.baseChainAddress,
        near: this.config.nearContractId,
        solana: this.config.solanaMint,
      },
    };
  }

  async getBalance(walletAddress: string, chain: string): Promise<string> {
    const row = await this.db.get<{ balance: string }>(
      `SELECT balance FROM versus_token_balances WHERE wallet_address = ? AND chain = ?`,
      [walletAddress.toLowerCase(), chain]
    );

    return row?.balance ?? '0';
  }

  async updateBalance(walletAddress: string, chain: string, newBalance: string): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO versus_token_balances (wallet_address, chain, balance, updated_at)
       VALUES (?, ?, ?, ?)`,
      [walletAddress.toLowerCase(), chain, newBalance, Date.now()]
    );
  }

  async transfer(
    fromAddress: string,
    toAddress: string,
    amount: string,
    chain: string
  ): Promise<TokenTransfer> {
    const transferId = `transfer-${uuidv4()}`;
    const now = Date.now();

    const fromBalance = await this.getBalance(fromAddress, chain);
    const fromBalanceBN = BigInt(fromBalance);
    const amountBN = BigInt(amount);

    if (fromBalanceBN < amountBN) {
      throw new Error('Insufficient balance');
    }

    const toBalance = await this.getBalance(toAddress, chain);

    await this.db.execute(
      `INSERT INTO versus_token_transfers (id, from_address, to_address, amount, chain, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transferId,
        fromAddress.toLowerCase(),
        toAddress.toLowerCase(),
        amount,
        chain,
        'pending',
        now,
      ]
    );

    const newFromBalance = (fromBalanceBN - amountBN).toString();
    const newToBalance = (BigInt(toBalance) + amountBN).toString();

    await this.updateBalance(fromAddress, chain, newFromBalance);
    await this.updateBalance(toAddress, chain, newToBalance);

    await this.db.execute(
      `UPDATE versus_token_transfers SET status = 'confirmed', tx_hash = ?, confirmed_at = ? WHERE id = ?`,
      [this.generateTxHash(transferId), Date.now(), transferId]
    );

    logger.info('VERSUS token transfer', {
      transferId,
      from: fromAddress,
      to: toAddress,
      amount,
      chain,
    });

    return {
      id: transferId,
      fromAddress,
      toAddress,
      amount,
      chain,
      txHash: this.generateTxHash(transferId),
      status: 'confirmed',
      createdAt: now,
      confirmedAt: Date.now(),
    };
  }

  async mint(
    toAddress: string,
    amount: string,
    chain: string,
    reason: string
  ): Promise<TokenTransfer> {
    const transferId = `mint-${uuidv4()}`;
    const now = Date.now();

    const currentBalance = await this.getBalance(toAddress, chain);
    const newBalance = (BigInt(currentBalance) + BigInt(amount)).toString();

    await this.updateBalance(toAddress, chain, newBalance);

    await this.db.execute(
      `INSERT INTO versus_token_transfers (id, from_address, to_address, amount, chain, status, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [transferId, 'MINT', toAddress.toLowerCase(), amount, chain, 'confirmed', now, now]
    );

    logger.info('VERSUS tokens minted', { toAddress, amount, chain, reason });

    return {
      id: transferId,
      fromAddress: 'MINT',
      toAddress,
      amount,
      chain,
      txHash: this.generateTxHash(transferId),
      status: 'confirmed',
      createdAt: now,
      confirmedAt: now,
    };
  }

  async stake(
    walletAddress: string,
    amount: string,
    chain: string,
    lockDurationMs?: number
  ): Promise<StakingPosition> {
    const balance = await this.getBalance(walletAddress, chain);
    const balanceBN = BigInt(balance);
    const amountBN = BigInt(amount);

    if (balanceBN < amountBN) {
      throw new Error('Insufficient balance to stake');
    }

    const stakeId = `stake-${uuidv4()}`;
    const now = Date.now();
    const lockedUntil = lockDurationMs ? now + lockDurationMs : null;

    const newBalance = (balanceBN - amountBN).toString();
    await this.updateBalance(walletAddress, chain, newBalance);

    await this.db.execute(
      `INSERT INTO versus_staking_positions (id, wallet_address, amount, chain, rewards_earned, locked_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [stakeId, walletAddress.toLowerCase(), amount, chain, '0', lockedUntil, now]
    );

    logger.info('VERSUS tokens staked', { walletAddress, amount, chain, stakeId });

    return {
      id: stakeId,
      walletAddress,
      amount,
      chain,
      rewardsEarned: '0',
      lockedUntil,
      createdAt: now,
    };
  }

  async unstake(stakeId: string): Promise<TokenTransfer> {
    const row = await this.db.get<{
      wallet_address: string;
      amount: string;
      chain: string;
      rewards_earned: string;
      locked_until: number | null;
    }>(`SELECT * FROM versus_staking_positions WHERE id = ?`, [stakeId]);

    if (!row) {
      throw new Error('Staking position not found');
    }

    if (row.locked_until && Date.now() < row.locked_until) {
      throw new Error('Staking position is still locked');
    }

    const totalAmount = (BigInt(row.amount) + BigInt(row.rewards_earned)).toString();
    const currentBalance = await this.getBalance(row.wallet_address, row.chain);
    const newBalance = (BigInt(currentBalance) + BigInt(totalAmount)).toString();

    await this.updateBalance(row.wallet_address, row.chain, newBalance);

    await this.db.execute(`DELETE FROM versus_staking_positions WHERE id = ?`, [stakeId]);

    const transferId = `unstake-${uuidv4()}`;
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO versus_token_transfers (id, from_address, to_address, amount, chain, status, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [transferId, 'UNSTAKE', row.wallet_address, totalAmount, row.chain, 'confirmed', now, now]
    );

    logger.info('VERSUS tokens unstaked', {
      stakeId,
      walletAddress: row.wallet_address,
      amount: totalAmount,
    });

    return {
      id: transferId,
      fromAddress: 'UNSTAKE',
      toAddress: row.wallet_address,
      amount: totalAmount,
      chain: row.chain,
      txHash: this.generateTxHash(transferId),
      status: 'confirmed',
      createdAt: now,
      confirmedAt: now,
    };
  }

  async getStakingPositions(walletAddress: string): Promise<StakingPosition[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM versus_staking_positions WHERE wallet_address = ?`,
      [walletAddress.toLowerCase()]
    );

    return rows.map((row: any) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      amount: row.amount,
      chain: row.chain,
      rewardsEarned: row.rewards_earned,
      lockedUntil: row.locked_until,
      createdAt: row.created_at,
    }));
  }

  async distributeRewards(walletAddress: string, amount: string, chain: string): Promise<void> {
    const positions = await this.getStakingPositions(walletAddress);
    const chainPositions = positions.filter((p) => p.chain === chain);

    for (const position of chainPositions) {
      const newRewards = (BigInt(position.rewardsEarned) + BigInt(amount)).toString();
      await this.db.execute(`UPDATE versus_staking_positions SET rewards_earned = ? WHERE id = ?`, [
        newRewards,
        position.id,
      ]);
    }
  }

  private generateTxHash(id: string): string {
    return `0x${createHash('sha256').update(id).update(Date.now().toString()).digest('hex').slice(0, 64)}`;
  }
}

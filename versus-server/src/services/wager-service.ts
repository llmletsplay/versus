import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DatabaseProvider } from '../core/database.js';
import type { IntentService } from './intent-service.js';
import { logger } from '../utils/logger.js';
import type {
  WagerMatch,
  WagerPlayer,
  WagerCommitment,
  WagerResolution,
  CreateWagerRequest,
  CommitStakeRequest,
  WagerFilters,
  WagerListItem,
  WagerState,
  WagerPaymentInfo,
  WagerSettlementRequest,
  WagerStatus,
} from '../types/wager.js';
import type { ChainNetwork, MoveSignature, OutcomeProof } from '../types/intent.js';

const DEFAULT_PLATFORM_FEE = 2.5;
const DEFAULT_TOKEN = 'USDC';

export interface WagerServiceConfig {
  platformFeePercent?: number;
  defaultToken?: string;
  matchCreationFeeUsd?: number;
  settlementEnabled?: boolean;
}

export class WagerService {
  private db: DatabaseProvider;
  private intentService: IntentService;
  private config: WagerServiceConfig;

  constructor(db: DatabaseProvider, intentService: IntentService, config: WagerServiceConfig = {}) {
    this.db = db;
    this.intentService = intentService;
    this.config = {
      platformFeePercent: config.platformFeePercent ?? DEFAULT_PLATFORM_FEE,
      defaultToken: config.defaultToken ?? DEFAULT_TOKEN,
      matchCreationFeeUsd: config.matchCreationFeeUsd ?? 1.0,
      settlementEnabled: config.settlementEnabled ?? true,
    };
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wagers (
        id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        status TEXT DEFAULT 'proposed'
          CHECK (status IN ('proposed', 'committed', 'locked', 'in_progress', 'completed', 'settled', 'cancelled', 'disputed')),
        player_a_id TEXT NOT NULL,
        player_a_wallet TEXT,
        player_a_agent_id TEXT,
        player_a_committed INTEGER DEFAULT 0,
        player_a_commit_signature TEXT,
        player_a_committed_at INTEGER,
        player_b_id TEXT,
        player_b_wallet TEXT,
        player_b_agent_id TEXT,
        player_b_committed INTEGER DEFAULT 0,
        player_b_commit_signature TEXT,
        player_b_committed_at INTEGER,
        stake_amount TEXT NOT NULL,
        stake_token TEXT NOT NULL,
        stake_chain TEXT NOT NULL,
        platform_fee_percent REAL DEFAULT ${this.config.platformFeePercent},
        game_id TEXT,
        market_id TEXT,
        escrow_address TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        settled_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wager_intent_mappings (
        wager_id TEXT NOT NULL,
        intent_id TEXT NOT NULL,
        intent_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (wager_id, intent_id)
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_wagers_status ON wagers(status);
      CREATE INDEX IF NOT EXISTS idx_wagers_player_a ON wagers(player_a_id);
      CREATE INDEX IF NOT EXISTS idx_wagers_player_b ON wagers(player_b_id);
    `);

    logger.info('Wager service initialized');
  }

  async createWager(
    request: CreateWagerRequest
  ): Promise<{ wager: WagerMatch; paymentInfo: WagerPaymentInfo }> {
    const wagerId = `wager-${uuidv4()}`;
    const now = Date.now();

    const wager: WagerMatch = {
      id: wagerId,
      gameType: request.gameType,
      status: 'proposed',
      playerA: {
        oderId: request.playerAAddress,
        walletAddress: request.playerAAddress,
        agentId: request.playerAAgentId ?? null,
        hasCommitted: false,
        commitmentSignature: null,
        committedAt: null,
      },
      playerB: request.playerBAddress
        ? {
            oderId: request.playerBAddress,
            walletAddress: request.playerBAddress,
            agentId: request.playerBAgentId ?? null,
            hasCommitted: false,
            commitmentSignature: null,
            committedAt: null,
          }
        : null,
      stakeAmount: request.stakeAmount,
      stakeToken: request.stakeToken,
      stakeChain: request.stakeChain,
      platformFeePercent: this.config.platformFeePercent ?? DEFAULT_PLATFORM_FEE,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      settledAt: null,
      gameId: null,
      marketId: null,
      escrowAddress: null,
    };

    await this.db.execute(
      `INSERT INTO wagers (
        id, game_type, status, player_a_id, player_a_wallet, player_a_agent_id,
        stake_amount, stake_token, stake_chain, platform_fee_percent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wager.id,
        wager.gameType,
        wager.status,
        wager.playerA.oderId,
        wager.playerA.walletAddress,
        wager.playerA.agentId,
        wager.stakeAmount,
        wager.stakeToken,
        wager.stakeChain,
        wager.platformFeePercent,
        wager.createdAt,
      ]
    );

    if (wager.playerB) {
      await this.db.execute(
        `UPDATE wagers SET player_b_id = ?, player_b_wallet = ?, player_b_agent_id = ? WHERE id = ?`,
        [wager.playerB.oderId, wager.playerB.walletAddress, wager.playerB.agentId, wager.id]
      );
    }

    const paymentInfo: WagerPaymentInfo = {
      wagerId: wager.id,
      paymentRequired: {
        scheme: 'exact',
        network: request.stakeChain,
        asset: this.getTokenAddress(request.stakeChain),
        amount: request.stakeAmount,
        recipient: '0xVERSUS_TREASURY',
      },
      purpose: 'match_creation',
      reference: `wager:${wager.id}:creation`,
    };

    logger.info('Wager created', {
      wagerId,
      gameType: request.gameType,
      stake: request.stakeAmount,
    });

    return { wager, paymentInfo };
  }

  async commitStake(
    request: CommitStakeRequest
  ): Promise<{ success: boolean; wager: WagerMatch; intentId?: string }> {
    const wager = await this.getWager(request.wagerId);
    if (!wager) {
      throw new Error(`Wager not found: ${request.wagerId}`);
    }

    if (wager.status !== 'proposed' && wager.status !== 'committed') {
      throw new Error(`Cannot commit to wager with status: ${wager.status}`);
    }

    const isPlayerA = wager.playerA.walletAddress === request.walletAddress;
    const isPlayerB = wager.playerB?.walletAddress === request.walletAddress;

    if (!isPlayerA && !isPlayerB) {
      throw new Error('Wallet address does not match any player in this wager');
    }

    const now = Date.now();
    const commitment: WagerCommitment = {
      id: `commit-${uuidv4()}`,
      wagerId: request.wagerId,
      playerId: request.walletAddress,
      walletAddress: request.walletAddress,
      amount: request.amount,
      signature: request.signature,
      signedAt: now,
      confirmed: true,
    };

    if (isPlayerA) {
      await this.db.execute(
        `UPDATE wagers SET 
          player_a_committed = 1, 
          player_a_commit_signature = ?, 
          player_a_committed_at = ? 
        WHERE id = ?`,
        [request.signature, now, request.wagerId]
      );
    } else {
      await this.db.execute(
        `UPDATE wagers SET 
          player_b_committed = 1, 
          player_b_commit_signature = ?, 
          player_b_committed_at = ? 
        WHERE id = ?`,
        [request.signature, now, request.wagerId]
      );
    }

    const updatedWager = await this.getWager(request.wagerId);
    if (!updatedWager) {
      throw new Error('Failed to retrieve updated wager');
    }

    const bothCommitted =
      updatedWager.playerA.hasCommitted &&
      (updatedWager.playerB === null || updatedWager.playerB.hasCommitted);

    let intentId: string | undefined;

    if (bothCommitted) {
      await this.db.execute(`UPDATE wagers SET status = 'locked' WHERE id = ?`, [request.wagerId]);

      intentId = await this.createStakeIntent(updatedWager);
    } else if (wager.status === 'proposed') {
      await this.db.execute(`UPDATE wagers SET status = 'committed' WHERE id = ?`, [
        request.wagerId,
      ]);
    }

    logger.info('Stake committed', {
      wagerId: request.wagerId,
      walletAddress: request.walletAddress,
      bothCommitted,
    });

    return { success: true, wager: updatedWager, intentId };
  }

  private async createStakeIntent(wager: WagerMatch): Promise<string> {
    const stakesLocked = [];

    stakesLocked.push({
      wallet: wager.playerA.walletAddress ?? '',
      amount: wager.stakeAmount,
      signature: wager.playerA.commitmentSignature ?? '',
      signedAt: wager.playerA.committedAt ?? Date.now(),
      chain: wager.stakeChain,
      signatureScheme: 'eip191' as const,
    });

    if (wager.playerB) {
      stakesLocked.push({
        wallet: wager.playerB.walletAddress ?? '',
        amount: wager.stakeAmount,
        signature: wager.playerB.commitmentSignature ?? '',
        signedAt: wager.playerB.committedAt ?? Date.now(),
        chain: wager.stakeChain,
        signatureScheme: 'eip191' as const,
      });
    }

    const intent = await this.intentService.createStakeLockIntent({
      matchId: wager.id,
      chain: wager.stakeChain,
      stakesLocked,
    });

    await this.db.execute(
      `INSERT INTO wager_intent_mappings (wager_id, intent_id, intent_type, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [wager.id, intent.id, 'stake_lock', 'pending', Date.now()]
    );

    logger.info('Stake intent created', { wagerId: wager.id, intentId: intent.id });

    return intent.id;
  }

  async startGame(wagerId: string, gameId: string): Promise<WagerMatch> {
    const wager = await this.getWager(wagerId);
    if (!wager) {
      throw new Error(`Wager not found: ${wagerId}`);
    }

    if (wager.status !== 'locked') {
      throw new Error(`Cannot start game for wager with status: ${wager.status}`);
    }

    const now = Date.now();

    await this.db.execute(
      `UPDATE wagers SET status = 'in_progress', game_id = ?, started_at = ? WHERE id = ?`,
      [gameId, now, wagerId]
    );

    const updatedWager = await this.getWager(wagerId);
    if (!updatedWager) {
      throw new Error('Failed to retrieve updated wager');
    }

    logger.info('Wager game started', { wagerId, gameId });

    return updatedWager;
  }

  async settleWager(request: WagerSettlementRequest): Promise<WagerMatch> {
    const wager = await this.getWager(request.wagerId);
    if (!wager) {
      throw new Error(`Wager not found: ${request.wagerId}`);
    }

    if (wager.status !== 'in_progress' && wager.status !== 'completed') {
      throw new Error(`Cannot settle wager with status: ${wager.status}`);
    }

    const now = Date.now();
    const totalPot = (parseFloat(wager.stakeAmount) * 2).toString();
    const platformFee = (
      parseFloat(wager.stakeAmount) *
      2 *
      (wager.platformFeePercent / 100)
    ).toString();
    const winnerPayout = (parseFloat(totalPot) - parseFloat(platformFee)).toString();

    await this.db.execute(`UPDATE wagers SET status = 'settled', settled_at = ? WHERE id = ?`, [
      now,
      request.wagerId,
    ]);

    const resolveIntent = await this.intentService.createResolveEventIntent({
      matchId: wager.id,
      chain: wager.stakeChain,
      finalOutcome: request.winnerId === wager.playerA.oderId ? 'WIN_A' : 'WIN_B',
    });

    await this.db.execute(
      `INSERT INTO wager_intent_mappings (wager_id, intent_id, intent_type, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [wager.id, resolveIntent.id, 'resolve_event', 'pending', Date.now()]
    );

    const resolution: WagerResolution = {
      wagerId: wager.id,
      winnerId: request.winnerId,
      winnerAddress: request.winnerAddress,
      loserId: request.loserId,
      loserAddress: request.loserAddress,
      totalPot,
      winnerPayout,
      platformFee,
      proofId: '',
      intentId: resolveIntent.id,
      settled: true,
      settledAt: now,
    };

    const updatedWager = await this.getWager(request.wagerId);
    if (!updatedWager) {
      throw new Error('Failed to retrieve updated wager');
    }

    logger.info('Wager settled', {
      wagerId: request.wagerId,
      winner: request.winnerAddress,
      payout: winnerPayout,
    });

    return updatedWager;
  }

  async cancelWager(wagerId: string, reason: string): Promise<void> {
    const wager = await this.getWager(wagerId);
    if (!wager) {
      throw new Error(`Wager not found: ${wagerId}`);
    }

    if (wager.status === 'settled' || wager.status === 'completed') {
      throw new Error(`Cannot cancel settled wager`);
    }

    await this.db.execute(`UPDATE wagers SET status = 'cancelled' WHERE id = ?`, [wagerId]);

    logger.info('Wager cancelled', { wagerId, reason });
  }

  async getWager(wagerId: string): Promise<WagerMatch | null> {
    const row = await this.db.get(`SELECT * FROM wagers WHERE id = ?`, [wagerId]);

    if (!row) return null;

    return this.deserializeWager(row);
  }

  async listWagers(filters: WagerFilters): Promise<WagerListItem[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.gameType) {
      conditions.push('game_type = ?');
      params.push(filters.gameType);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.playerId) {
      conditions.push('(player_a_id = ? OR player_b_id = ?)');
      params.push(filters.playerId, filters.playerId);
    }

    if (filters.minStake) {
      conditions.push('stake_amount >= ?');
      params.push(filters.minStake);
    }

    if (filters.maxStake) {
      conditions.push('stake_amount <= ?');
      params.push(filters.maxStake);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = await this.db.query(
      `SELECT * FROM wagers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return rows.map((row: any) => this.serializeWagerListItem(row));
  }

  async getWagerState(wagerId: string): Promise<WagerState | null> {
    const wager = await this.getWager(wagerId);
    if (!wager) return null;

    const commitmentRows = await this.db.query(`SELECT * FROM wagers WHERE id = ?`, [wagerId]);

    const intentRows = await this.db.query(
      `SELECT * FROM wager_intent_mappings WHERE wager_id = ?`,
      [wagerId]
    );

    const commitments: WagerCommitment[] = [];
    if (wager.playerA.commitmentSignature) {
      commitments.push({
        id: '',
        wagerId: wager.id,
        playerId: wager.playerA.oderId,
        walletAddress: wager.playerA.walletAddress ?? '',
        amount: wager.stakeAmount,
        signature: wager.playerA.commitmentSignature,
        signedAt: wager.playerA.committedAt ?? 0,
        confirmed: wager.playerA.hasCommitted,
      });
    }

    const intents = intentRows.map((row: any) => ({
      wagerId: row.wager_id,
      intentId: row.intent_id,
      intentType: row.intent_type,
      status: row.status,
      createdAt: row.created_at,
    }));

    return {
      wager,
      commitments,
      intents,
      resolution: null,
    };
  }

  private getTokenAddress(chain: ChainNetwork): string {
    const tokenAddresses: Record<string, string> = {
      base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      arbitrum: '0xaf88d065e77c8cC2239327C5EBb7fC2e7c5f30B',
      near: 'usdc.fakes.testnet',
      solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    };

    return tokenAddresses[chain] ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }

  private deserializeWager(row: any): WagerMatch {
    return {
      id: row.id,
      gameType: row.game_type,
      status: row.status as WagerStatus,
      playerA: {
        oderId: row.player_a_id,
        walletAddress: row.player_a_wallet,
        agentId: row.player_a_agent_id,
        hasCommitted: Boolean(row.player_a_committed),
        commitmentSignature: row.player_a_commit_signature,
        committedAt: row.player_a_committed_at,
      },
      playerB: row.player_b_id
        ? {
            oderId: row.player_b_id,
            walletAddress: row.player_b_wallet,
            agentId: row.player_b_agent_id,
            hasCommitted: Boolean(row.player_b_committed),
            commitmentSignature: row.player_b_commit_signature,
            committedAt: row.player_b_committed_at,
          }
        : null,
      stakeAmount: row.stake_amount,
      stakeToken: row.stake_token,
      stakeChain: row.stake_chain,
      platformFeePercent: row.platform_fee_percent,
      gameId: row.game_id,
      marketId: row.market_id,
      escrowAddress: row.escrow_address,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      settledAt: row.settled_at,
    };
  }

  private serializeWagerListItem(row: any): WagerListItem {
    return {
      id: row.id,
      gameType: row.game_type,
      status: row.status as WagerStatus,
      playerA: {
        oderId: row.player_a_id,
        agentId: row.player_a_agent_id,
        hasCommitted: Boolean(row.player_a_committed),
      },
      playerB: row.player_b_id
        ? {
            oderId: row.player_b_id,
            agentId: row.player_b_agent_id,
            hasCommitted: Boolean(row.player_b_committed),
          }
        : null,
      stakeAmount: row.stake_amount,
      stakeToken: row.stake_token,
      createdAt: row.created_at,
    };
  }
}

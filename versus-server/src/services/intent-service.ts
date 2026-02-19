import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type {
  IntentType,
  IntentStatus,
  ChainNetwork,
  MatchWagerIntent,
  PredictionMarketIntent,
  ResolveEventIntent,
  StakeLockIntent,
  IntentTransaction,
  IntentCreationRequest,
  IntentBroadcastRequest,
  IntentSettlementRequest,
  IntentSettlementResult,
  OutcomeProof,
  MoveSignature,
  SolverInfo,
  SolverQuote,
} from '../types/intent.js';

export interface IntentServiceConfig {
  enabled: boolean;
  nearEndpoint?: string;
  nearNetworkId?: string;
  nearContractId?: string;
  solverEndpoint?: string;
  defaultExpiryMs?: number;
}

export class IntentService {
  private db: DatabaseProvider;
  private config: IntentServiceConfig;
  private solvers: Map<string, SolverInfo> = new Map();

  constructor(db: DatabaseProvider, config: IntentServiceConfig) {
    this.db = db;
    this.config = {
      enabled: config.enabled ?? false,
      nearEndpoint: config.nearEndpoint ?? 'https://rpc.testnet.near.org',
      nearNetworkId: config.nearNetworkId ?? 'testnet',
      solverEndpoint: config.solverEndpoint,
      defaultExpiryMs: config.defaultExpiryMs ?? 3600000,
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Intent service is disabled');
      return;
    }

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS wager_intents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        event_id TEXT NOT NULL,
        intent_hash TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        chain TEXT NOT NULL,
        conditions TEXT,
        stakes_locked TEXT,
        proof_type TEXT,
        game_type TEXT,
        market_id TEXT,
        initial_state_hash TEXT,
        final_state_hash TEXT,
        proof TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        settled_at INTEGER
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS intent_transactions (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        chain TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        solver_id TEXT,
        fee_amount TEXT,
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER,
        error TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS move_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        move_index INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        move_data TEXT NOT NULL,
        signature TEXT NOT NULL,
        signature_scheme TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    await this.discoverSolvers();
    logger.info('Intent service initialized', { solvers: this.solvers.size });
  }

  private async discoverSolvers(): Promise<void> {
    this.solvers.set('default', {
      id: 'default',
      endpoint: this.config.solverEndpoint ?? 'https://solver.near-intents.io',
      supportedChains: ['base', 'near', 'solana', 'ethereum'],
      feeBps: 25,
      latencyMs: 500,
    });
  }

  async createWagerIntent(request: {
    matchId: string;
    gameType: string;
    chain: ChainNetwork;
    conditions: {
      outcome: string;
      recipient: string;
      amount: string;
    }[];
    stakesLocked?: {
      wallet: string;
      amount: string;
      signature: string;
      signedAt: number;
      chain: ChainNetwork;
      signatureScheme: 'eip191' | 'ed25519' | 'solana';
    }[];
    expiresAt?: number;
  }): Promise<MatchWagerIntent> {
    const intentId = `intent-${uuidv4()}`;
    const now = Date.now();
    const expiresAt = request.expiresAt ?? now + (this.config.defaultExpiryMs ?? 3600000);

    const intent: MatchWagerIntent = {
      id: intentId,
      type: 'conditional_transfer',
      eventId: request.matchId,
      createdAt: now,
      expiresAt,
      status: 'pending',
      chain: request.chain,
      conditions: {},
      stakesLocked: request.stakesLocked ?? [],
      proofType: 'deterministic_game_history',
      gameType: request.gameType,
    };

    for (const cond of request.conditions) {
      intent.conditions[cond.outcome] = {
        recipient: cond.recipient,
        amount: cond.amount,
        chain: request.chain,
        token: 'USDC',
      };
    }

    await this.persistIntent(intent);
    logger.info('Created wager intent', { intentId, matchId: request.matchId });

    return intent;
  }

  async createStakeLockIntent(request: {
    matchId: string;
    chain: ChainNetwork;
    stakesLocked: {
      wallet: string;
      amount: string;
      signature: string;
      signedAt: number;
      chain: ChainNetwork;
      signatureScheme: 'eip191' | 'ed25519' | 'solana';
    }[];
    expiresAt?: number;
  }): Promise<StakeLockIntent> {
    const intentId = `intent-${uuidv4()}`;
    const now = Date.now();
    const expiresAt = request.expiresAt ?? now + (this.config.defaultExpiryMs ?? 3600000);

    const intent: StakeLockIntent = {
      id: intentId,
      type: 'stake_lock',
      eventId: request.matchId,
      createdAt: now,
      expiresAt,
      status: 'pending',
      chain: request.chain,
      stakesLocked: request.stakesLocked,
      unlockCondition: 'game_started',
    };

    await this.persistIntent(intent);
    logger.info('Created stake lock intent', { intentId, matchId: request.matchId });

    return intent;
  }

  async createResolveEventIntent(request: {
    matchId: string;
    chain: ChainNetwork;
    finalOutcome: string;
    proof?: OutcomeProof;
    expiresAt?: number;
  }): Promise<ResolveEventIntent> {
    const intentId = `intent-${uuidv4()}`;
    const now = Date.now();
    const expiresAt = request.expiresAt ?? now + 300000;

    const intent: ResolveEventIntent = {
      id: intentId,
      type: 'resolve_event',
      eventId: request.matchId,
      createdAt: now,
      expiresAt,
      status: 'pending',
      chain: request.chain,
      finalOutcome: request.finalOutcome,
      proof: request.proof ?? null,
      signature: null,
      proofType: 'deterministic_game_history',
    };

    await this.persistIntent(intent);
    logger.info('Created resolve event intent', { intentId, matchId: request.matchId });

    return intent;
  }

  async createPredictionIntent(request: {
    marketId: string;
    chain: ChainNetwork;
    predictionOutcome: number;
    amount: string;
    userId: string;
    expiresAt?: number;
  }): Promise<PredictionMarketIntent> {
    const intentId = `intent-${uuidv4()}`;
    const now = Date.now();
    const expiresAt = request.expiresAt ?? now + (this.config.defaultExpiryMs ?? 3600000);

    const intent: PredictionMarketIntent = {
      id: intentId,
      type: 'conditional_pool_entry',
      eventId: request.marketId,
      createdAt: now,
      expiresAt,
      status: 'pending',
      chain: request.chain,
      marketId: request.marketId,
      predictionOutcome: request.predictionOutcome,
      amount: request.amount,
      payoutFormula: 'proportional',
    };

    await this.persistIntent(intent);
    logger.info('Created prediction intent', { intentId, marketId: request.marketId });

    return intent;
  }

  async broadcastIntent(intentId: string, solverId?: string): Promise<IntentTransaction> {
    const intent = await this.getIntent(intentId);
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }

    const solver = solverId ? this.solvers.get(solverId) : this.solvers.get('default');
    if (!solver) {
      throw new Error('No solver available');
    }

    const txId = `tx-${uuidv4()}`;
    const now = Date.now();

    const tx: IntentTransaction = {
      id: txId,
      intentId,
      chain: intent.chain,
      txHash: null,
      status: 'broadcast',
      solverId: solver.id,
      createdAt: now,
      confirmedAt: null,
      error: null,
    };

    await this.db.execute(
      `INSERT INTO intent_transactions (id, intent_id, chain, status, solver_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tx.id, tx.intentId, tx.chain, tx.status, tx.solverId, tx.createdAt]
    );

    await this.db.execute(`UPDATE wager_intents SET status = 'broadcast' WHERE id = ?`, [intentId]);

    logger.info('Broadcast intent to solver', { intentId, solverId: solver.id, txId });

    return tx;
  }

  async settleIntent(request: IntentSettlementRequest): Promise<IntentSettlementResult> {
    const { intentId, outcomeProof, solverId } = request;

    const intent = await this.getIntent(intentId);
    if (!intent) {
      return { success: false, transactionId: null, txHash: null, error: 'Intent not found' };
    }

    const solver = solverId ? this.solvers.get(solverId) : this.solvers.get('default');
    if (!solver) {
      return { success: false, transactionId: null, txHash: null, error: 'No solver available' };
    }

    const resolveIntent = await this.createResolveEventIntent({
      matchId: intent.eventId,
      chain: intent.chain,
      finalOutcome: outcomeProof.winner ?? 'draw',
      proof: outcomeProof,
    });

    const tx = await this.broadcastIntent(resolveIntent.id, solver.id);

    const txHash = await this.executeSettlement(
      intent as MatchWagerIntent | StakeLockIntent | ResolveEventIntent,
      outcomeProof,
      solver
    );

    await this.db.execute(
      `UPDATE intent_transactions SET status = ?, tx_hash = ?, confirmed_at = ? WHERE id = ?`,
      ['completed', txHash, Date.now(), tx.id]
    );

    await this.db.execute(
      `UPDATE wager_intents SET status = 'completed', settled_at = ? WHERE id = ?`,
      [Date.now(), intentId]
    );

    logger.info('Intent settled', { intentId, txHash });

    return {
      success: true,
      transactionId: tx.id,
      txHash,
    };
  }

  private async executeSettlement(
    intent: MatchWagerIntent | StakeLockIntent | ResolveEventIntent,
    proof: OutcomeProof,
    solver: SolverInfo
  ): Promise<string> {
    const settlementData = {
      intentId: intent.id,
      eventId: intent.eventId,
      outcome: proof.winner,
      proof: proof,
      timestamp: Date.now(),
    };

    logger.info('Executing settlement via solver', {
      solverEndpoint: solver.endpoint,
      settlementData,
    });

    return `0x${createHash('sha256').update(JSON.stringify(settlementData)).digest('hex').slice(0, 64)}`;
  }

  async recordMoveSignature(gameId: string, move: MoveSignature): Promise<void> {
    await this.db.execute(
      `INSERT INTO move_signatures (game_id, move_index, player_id, move_data, signature, signature_scheme, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        move.moveIndex,
        move.playerId,
        JSON.stringify(move.moveData),
        move.signature,
        move.signatureScheme,
        move.timestamp,
      ]
    );

    logger.debug('Recorded move signature', {
      gameId,
      playerId: move.playerId,
      moveIndex: move.moveIndex,
    });
  }

  async getMoveSignatures(gameId: string): Promise<MoveSignature[]> {
    const rows = await this.db.query(
      `SELECT * FROM move_signatures WHERE game_id = ? ORDER BY move_index ASC`,
      [gameId]
    );

    return rows.map((row: any) => ({
      playerId: row.player_id,
      moveIndex: row.move_index,
      moveData: JSON.parse(row.move_data),
      signature: row.signature,
      timestamp: row.timestamp,
      signatureScheme: row.signature_scheme,
    }));
  }

  async getIntent(
    intentId: string
  ): Promise<
    MatchWagerIntent | StakeLockIntent | ResolveEventIntent | PredictionMarketIntent | null
  > {
    const row = await this.db.get(`SELECT * FROM wager_intents WHERE id = ?`, [intentId]);

    if (!row) return null;
    return this.deserializeIntent(row);
  }

  async getIntentsByEvent(
    eventId: string
  ): Promise<(MatchWagerIntent | StakeLockIntent | ResolveEventIntent | PredictionMarketIntent)[]> {
    const rows = await this.db.query(
      `SELECT * FROM wager_intents WHERE event_id = ? ORDER BY created_at DESC`,
      [eventId]
    );

    return rows.map((row: any) => this.deserializeIntent(row));
  }

  async getSolvers(): Promise<SolverInfo[]> {
    return Array.from(this.solvers.values());
  }

  async getSolverQuote(solverId: string, intentType: IntentType): Promise<SolverQuote | null> {
    const solver = this.solvers.get(solverId);
    if (!solver) return null;

    const feeBps = solver.feeBps;
    const estimatedFee = (feeBps / 10000).toString();

    return {
      solverId: solver.id,
      feeAmount: estimatedFee,
      feeToken: 'USDC',
      estimatedExecutionTime: solver.latencyMs,
      expiresAt: Date.now() + 60000,
    };
  }

  private async persistIntent(
    intent: MatchWagerIntent | StakeLockIntent | ResolveEventIntent | PredictionMarketIntent
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO wager_intents (id, type, event_id, intent_hash, status, chain, conditions, stakes_locked, proof_type, game_type, market_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        intent.id,
        intent.type,
        intent.eventId,
        this.computeIntentHash(intent),
        intent.status,
        intent.chain,
        'conditions' in intent ? JSON.stringify(intent.conditions) : null,
        'stakesLocked' in intent ? JSON.stringify(intent.stakesLocked) : null,
        'proofType' in intent ? intent.proofType : null,
        'gameType' in intent ? intent.gameType : null,
        'marketId' in intent ? (intent as any).marketId : null,
        intent.expiresAt,
        intent.createdAt,
      ]
    );
  }

  private computeIntentHash(
    intent: MatchWagerIntent | StakeLockIntent | ResolveEventIntent | PredictionMarketIntent
  ): string {
    const data = JSON.stringify({
      id: intent.id,
      type: intent.type,
      eventId: intent.eventId,
      createdAt: intent.createdAt,
      expiresAt: intent.expiresAt,
    });
    return createHash('sha256').update(data).digest('hex');
  }

  private deserializeIntent(
    row: any
  ): MatchWagerIntent | StakeLockIntent | ResolveEventIntent | PredictionMarketIntent {
    const base = {
      id: row.id,
      type: row.type as IntentType,
      eventId: row.event_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.status as IntentStatus,
      chain: row.chain as ChainNetwork,
    };

    if (row.type === 'conditional_transfer') {
      return {
        ...base,
        type: 'conditional_transfer',
        conditions: row.conditions ? JSON.parse(row.conditions) : {},
        stakesLocked: row.stakes_locked ? JSON.parse(row.stakes_locked) : [],
        proofType: row.proof_type ?? 'deterministic_game_history',
        gameType: row.game_type,
      } as MatchWagerIntent;
    }

    if (row.type === 'stake_lock') {
      return {
        ...base,
        type: 'stake_lock',
        stakesLocked: row.stakes_locked ? JSON.parse(row.stakes_locked) : [],
        unlockCondition: 'game_started',
      } as StakeLockIntent;
    }

    if (row.type === 'resolve_event') {
      return {
        ...base,
        type: 'resolve_event',
        finalOutcome: row.final_state_hash,
        proof: row.proof ? JSON.parse(row.proof) : null,
        signature: null,
        proofType: row.proof_type as any,
      } as ResolveEventIntent;
    }

    return {
      ...base,
      type: 'conditional_pool_entry',
      marketId: row.market_id,
      predictionOutcome: 0,
      amount: '',
      payoutFormula: 'proportional',
    } as PredictionMarketIntent;
  }
}

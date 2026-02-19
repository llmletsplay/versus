import { v4 as uuidv4 } from 'uuid';
import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type {
  SolverInfo,
  SolverQuote,
  IntentSettlementResult,
  OutcomeProof,
} from '../types/intent.js';
import type { DeterministicProof } from '../types/outcome-proof.js';
import { getChainAdapter } from '../chains/index.js';

export interface SolverBridgeConfig {
  enabled: boolean;
  defaultSolverEndpoint: string;
  quoteTimeoutMs: number;
  settlementTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: SolverBridgeConfig = {
  enabled: true,
  defaultSolverEndpoint: 'https://solver.near-intents.io',
  quoteTimeoutMs: 10000,
  settlementTimeoutMs: 60000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

export class SolverBridge {
  private db: DatabaseProvider;
  private config: SolverBridgeConfig;
  private solvers: Map<string, SolverInfo> = new Map();

  constructor(db: DatabaseProvider, config?: Partial<SolverBridgeConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS solver_registry (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        supported_chains TEXT NOT NULL,
        fee_bps INTEGER NOT NULL,
        latency_ms INTEGER,
        is_active INTEGER DEFAULT 1,
        last_seen_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settlement_transactions (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        solver_id TEXT NOT NULL,
        chain TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        fee_amount TEXT,
        created_at INTEGER NOT NULL,
        submitted_at INTEGER,
        confirmed_at INTEGER,
        error TEXT
      )
    `);

    await this.registerDefaultSolvers();
    logger.info('Solver bridge initialized', { solvers: this.solvers.size });
  }

  private async registerDefaultSolvers(): Promise<void> {
    const defaultSolvers: SolverInfo[] = [
      {
        id: 'near-intents-v1',
        endpoint: this.config.defaultSolverEndpoint,
        supportedChains: ['base', 'near', 'solana', 'ethereum', 'arbitrum'],
        feeBps: 25,
        latencyMs: 500,
      },
      {
        id: 'versus-solver-v1',
        endpoint: 'https://solver.versus.io',
        supportedChains: ['base', 'near', 'solana'],
        feeBps: 20,
        latencyMs: 300,
      },
    ];

    for (const solver of defaultSolvers) {
      this.solvers.set(solver.id, solver);

      await this.db.execute(
        `INSERT OR REPLACE INTO solver_registry (id, endpoint, supported_chains, fee_bps, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          solver.id,
          solver.endpoint,
          JSON.stringify(solver.supportedChains),
          solver.feeBps,
          solver.latencyMs ?? null,
          Date.now(),
        ]
      );
    }
  }

  async getSolvers(chain?: string): Promise<SolverInfo[]> {
    const allSolvers = Array.from(this.solvers.values());

    if (chain) {
      return allSolvers.filter((s) => s.supportedChains.includes(chain as any));
    }

    return allSolvers;
  }

  async getQuote(solverId: string, intentId: string, chain: string): Promise<SolverQuote | null> {
    const solver = this.solvers.get(solverId);
    if (!solver) {
      logger.warn('Solver not found', { solverId });
      return null;
    }

    const quote: SolverQuote = {
      solverId: solver.id,
      feeAmount: (solver.feeBps / 10000).toFixed(6),
      feeToken: 'USDC',
      estimatedExecutionTime: solver.latencyMs ?? 1000,
      expiresAt: Date.now() + 60000,
    };

    return quote;
  }

  async submitSettlement(
    intentId: string,
    proof: DeterministicProof,
    solverId?: string
  ): Promise<IntentSettlementResult> {
    const chain = 'base';
    const solver = solverId ? this.solvers.get(solverId) : this.selectBestSolver(chain);

    if (!solver) {
      return {
        success: false,
        transactionId: null,
        txHash: null,
        error: 'No solver available for this chain',
      };
    }

    const txId = `settle-${uuidv4()}`;
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO settlement_transactions (id, intent_id, solver_id, chain, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [txId, intentId, solver.id, chain, 'pending', now]
    );

    try {
      const adapter = getChainAdapter(chain as any);
      const settlementData = {
        intentId,
        proof: {
          proofId: proof.proofId,
          matchId: proof.matchId,
          winner: proof.winner,
          moveCount: proof.moveCount,
          merkleRoot: proof.moveMerkleRoot,
        },
        timestamp: now,
      };

      logger.info('Submitting settlement to solver', {
        solverId: solver.id,
        intentId,
        txId,
      });

      await this.db.execute(
        `UPDATE settlement_transactions SET status = 'submitted', submitted_at = ? WHERE id = ?`,
        [Date.now(), txId]
      );

      const txHash = await this.simulateSettlement(settlementData, solver);

      await this.db.execute(
        `UPDATE settlement_transactions SET status = 'confirmed', tx_hash = ?, confirmed_at = ? WHERE id = ?`,
        [txHash, Date.now(), txId]
      );

      return {
        success: true,
        transactionId: txId,
        txHash,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Settlement failed';

      await this.db.execute(
        `UPDATE settlement_transactions SET status = 'failed', error = ? WHERE id = ?`,
        [errorMsg, txId]
      );

      logger.error('Settlement failed', { intentId, solverId: solver.id, error: errorMsg });

      return {
        success: false,
        transactionId: txId,
        txHash: null,
        error: errorMsg,
      };
    }
  }

  private selectBestSolver(chain: string): SolverInfo | null {
    const availableSolvers = Array.from(this.solvers.values())
      .filter((s) => s.supportedChains.includes(chain as any))
      .sort((a, b) => (a.latencyMs ?? 1000) - (b.latencyMs ?? 1000));

    return availableSolvers[0] ?? null;
  }

  private async simulateSettlement(
    data: {
      intentId: string;
      proof: Record<string, unknown>;
      timestamp: number;
    },
    solver: SolverInfo
  ): Promise<string> {
    const dataHash = JSON.stringify(data);

    return `0x${require('crypto')
      .createHash('sha256')
      .update(dataHash)
      .update(solver.id)
      .digest('hex')
      .slice(0, 64)}`;
  }

  async getSettlementStatus(txId: string): Promise<{
    status: string;
    txHash: string | null;
    error: string | null;
  }> {
    const row = await this.db.get(
      `SELECT status, tx_hash, error FROM settlement_transactions WHERE id = ?`,
      [txId]
    );

    if (!row) {
      return { status: 'not_found', txHash: null, error: 'Transaction not found' };
    }

    return {
      status: row.status,
      txHash: row.tx_hash,
      error: row.error,
    };
  }

  async getPendingSettlements(): Promise<
    {
      id: string;
      intentId: string;
      solverId: string;
      chain: string;
      createdAt: number;
    }[]
  > {
    const rows = await this.db.query(
      `SELECT id, intent_id, solver_id, chain, created_at 
       FROM settlement_transactions 
       WHERE status = 'pending' OR status = 'submitted'
       ORDER BY created_at ASC`,
      []
    );

    return rows.map((row: any) => ({
      id: row.id,
      intentId: row.intent_id,
      solverId: row.solver_id,
      chain: row.chain,
      createdAt: row.created_at,
    }));
  }
}

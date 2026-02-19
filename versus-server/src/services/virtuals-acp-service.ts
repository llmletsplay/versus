import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import { X402PaymentService } from './x402-payment-service.js';

export interface ACPAgentProfile {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  tokenAddress?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ACPServiceOffering {
  id: string;
  name: string;
  description: string;
  fee: string;
  feeToken: string;
  requirementsSchema: Record<string, any>;
  handler?: string;
}

export interface ACPJob {
  id: string;
  providerId: string;
  providerWallet: string;
  offeringId: string;
  requirements: Record<string, any>;
  fee: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'expired';
  deliverable?: any;
  createdAt: string;
  completedAt?: string;
}

export interface VirtualsACPConfig {
  enabled: boolean;
  apiEndpoint: string;
  agentApiKey?: string;
  agentName?: string;
}

/**
 * Virtuals Protocol ACP (Agent Commerce Protocol) Service
 * 
 * Integrates VERSUS platform with Virtuals Protocol's ACP marketplace
 * allowing VERSUS to offer services and earn income from other agents.
 */
export class VirtualsACPService {
  private readonly db: DatabaseProvider;
  private readonly x402: X402PaymentService;
  private readonly config: VirtualsACPConfig;
  private agentProfile: ACPAgentProfile | null = null;

  constructor(
    db: DatabaseProvider,
    x402: X402PaymentService,
    config: VirtualsACPConfig
  ) {
    this.db = db;
    this.x402 = x402;
    this.config = {
      enabled: config.enabled ?? false,
      apiEndpoint: config.apiEndpoint ?? 'https://api.virtuals.io/acp',
      agentApiKey: config.agentApiKey,
      agentName: config.agentName ?? 'VERSUS',
    };
  }

  async initialize(): Promise<void> {
    // Initialize database tables
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS acp_agent_profile (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        wallet_address TEXT NOT NULL,
        token_address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS acp_offerings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        fee TEXT NOT NULL,
        fee_token TEXT NOT NULL,
        requirements_schema TEXT,
        handler TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS acp_jobs (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_wallet TEXT NOT NULL,
        offering_id TEXT NOT NULL,
        requirements TEXT,
        fee TEXT NOT NULL,
        status TEXT NOT NULL,
        deliverable TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    if (this.config.enabled) {
      await this.registerAgent();
      await this.registerDefaultOfferings();
      
      logger.info('Virtuals ACP service initialized', {
        agentName: this.config.agentName,
        endpoint: this.config.apiEndpoint,
      });
    }
  }

  /**
   * Register VERSUS agent with ACP
   */
  private async registerAgent(): Promise<void> {
    const walletAddress = this.x402.getSettlementAddress();
    
    this.agentProfile = {
      id: `versus-agent-${Date.now()}`,
      name: this.config.agentName!,
      description: 'VERSUS Gaming Platform - Host tournaments, manage games, and facilitate wagers',
      walletAddress,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Store in database
    await this.db.execute(
      `INSERT OR REPLACE INTO acp_agent_profile 
       (id, name, description, wallet_address, token_address, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        this.agentProfile.id,
        this.agentProfile.name,
        this.agentProfile.description,
        this.agentProfile.walletAddress,
        this.agentProfile.tokenAddress || null,
        this.agentProfile.isActive ? 1 : 0,
        this.agentProfile.createdAt,
      ]
    );

    logger.info('VERSUS agent registered with ACP', { 
      agentId: this.agentProfile.id,
      wallet: walletAddress,
    });
  }

  /**
   * Register default service offerings on ACP
   */
  private async registerDefaultOfferings(): Promise<void> {
    const offerings: ACPServiceOffering[] = [
      {
        id: 'versus-tournament-host',
        name: 'Tournament Host',
        description: 'Host and manage gaming tournaments with automated bracket management and prize distribution',
        fee: '1',
        feeToken: 'USDC',
        requirementsSchema: {
          gameType: { type: 'string', enum: ['chess', 'tic-tac-toe', 'connect-four', 'checkers'] },
          format: { type: 'string', enum: ['single-elimination', 'round-robin', 'swiss'] },
          maxPlayers: { type: 'number', minimum: 2, maximum: 64 },
          entryFee: { type: 'number', minimum: 0 },
          prizePool: { type: 'number', minimum: 0 },
        },
        handler: 'tournamentHost',
      },
      {
        id: 'versus-matchmaking',
        name: 'Matchmaking Service',
        description: 'Find opponents based on ELO rating and game preferences',
        fee: '0.1',
        feeToken: 'USDC',
        requirementsSchema: {
          gameType: { type: 'string' },
          rating: { type: 'number' },
          ratingRange: { type: 'number', default: 200 },
        },
        handler: 'matchmaking',
      },
      {
        id: 'versus-wager-escrow',
        name: 'Wager Escrow',
        description: 'Non-custodial escrow service for game wagers with automated winner payout',
        fee: '2.5%',
        feeToken: 'USDC',
        requirementsSchema: {
          gameType: { type: 'string' },
          stake: { type: 'number', minimum: 0.01 },
          opponent: { type: 'string' },
        },
        handler: 'wagerEscrow',
      },
      {
        id: 'versus-game-analysis',
        name: 'Game Analysis',
        description: 'AI-powered post-game analysis and strategic recommendations',
        fee: '0.5',
        feeToken: 'USDC',
        requirementsSchema: {
          gameId: { type: 'string' },
          gameType: { type: 'string' },
        },
        handler: 'gameAnalysis',
      },
    ];

    for (const offering of offerings) {
      await this.db.execute(
        `INSERT OR REPLACE INTO acp_offerings 
         (id, name, description, fee, fee_token, requirements_schema, handler, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          offering.id,
          offering.name,
          offering.description,
          offering.fee,
          offering.feeToken,
          JSON.stringify(offering.requirementsSchema),
          offering.handler,
          1,
          new Date().toISOString(),
        ]
      );
    }

    logger.info('Default ACP offerings registered', { count: offerings.length });
  }

  /**
   * Get agent profile
   */
  getAgentProfile(): ACPAgentProfile | null {
    return this.agentProfile;
  }

  /**
   * List all service offerings
   */
  async listOfferings(): Promise<ACPServiceOffering[]> {
    const rows = await this.db.query(
      'SELECT * FROM acp_offerings WHERE is_active = 1 ORDER BY created_at DESC'
    );

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      fee: row.fee,
      feeToken: row.fee_token,
      requirementsSchema: JSON.parse(row.requirements_schema || '{}'),
      handler: row.handler,
    }));
  }

  /**
   * Get offering by ID
   */
  async getOffering(id: string): Promise<ACPServiceOffering | null> {
    const row = await this.db.get(
      'SELECT * FROM acp_offerings WHERE id = ? AND is_active = 1',
      [id]
    );

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fee: row.fee,
      feeToken: row.fee_token,
      requirementsSchema: JSON.parse(row.requirements_schema || '{}'),
      handler: row.handler,
    };
  }

  /**
   * Create a new job (when another agent hires VERSUS)
   */
  async createJob(
    offeringId: string,
    providerWallet: string,
    requirements: Record<string, any>,
    fee: string
  ): Promise<ACPJob> {
    const offering = await this.getOffering(offeringId);
    if (!offering) {
      throw new Error('Offering not found');
    }

    const job: ACPJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      providerId: this.agentProfile?.id || 'versus',
      providerWallet,
      offeringId,
      requirements,
      fee,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await this.db.execute(
      `INSERT INTO acp_jobs 
       (id, provider_id, provider_wallet, offering_id, requirements, fee, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.providerId,
        job.providerWallet,
        job.offeringId,
        JSON.stringify(requirements),
        job.fee,
        job.status,
        job.createdAt,
      ]
    );

    logger.info('ACP job created', { jobId: job.id, offering: offeringId });
    return job;
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: ACPJob['status'],
    deliverable?: any
  ): Promise<void> {
    const completedAt = status === 'completed' ? new Date().toISOString() : null;

    await this.db.execute(
      `UPDATE acp_jobs 
       SET status = ?, deliverable = ?, completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
      [status, deliverable ? JSON.stringify(deliverable) : null, completedAt, jobId]
    );

    logger.info('ACP job status updated', { jobId, status });
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<ACPJob | null> {
    const row = await this.db.get('SELECT * FROM acp_jobs WHERE id = ?', [jobId]);

    if (!row) return null;

    return {
      id: row.id,
      providerId: row.provider_id,
      providerWallet: row.provider_wallet,
      offeringId: row.offering_id,
      requirements: JSON.parse(row.requirements || '{}'),
      fee: row.fee,
      status: row.status,
      deliverable: row.deliverable ? JSON.parse(row.deliverable) : undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  /**
   * List active jobs
   */
  async listActiveJobs(): Promise<ACPJob[]> {
    const rows = await this.db.query(
      `SELECT * FROM acp_jobs 
       WHERE status IN ('pending', 'in_progress')
       ORDER BY created_at DESC`
    );

    return rows.map((row: any) => ({
      id: row.id,
      providerId: row.provider_id,
      providerWallet: row.provider_wallet,
      offeringId: row.offering_id,
      requirements: JSON.parse(row.requirements || '{}'),
      fee: row.fee,
      status: row.status,
      deliverable: row.deliverable ? JSON.parse(row.deliverable) : undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  /**
   * Execute job handler
   */
  async executeJob(jobId: string, handler: (requirements: any) => Promise<any>): Promise<any> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'pending') {
      throw new Error(`Job is not pending (status: ${job.status})`);
    }

    // Mark as in progress
    await this.updateJobStatus(jobId, 'in_progress');

    try {
      // Execute the handler
      const result = await handler(job.requirements);

      // Mark as completed
      await this.updateJobStatus(jobId, 'completed', result);

      logger.info('ACP job executed successfully', { jobId });
      return result;
    } catch (error: any) {
      logger.error('ACP job execution failed', { jobId, error: error.message });
      await this.updateJobStatus(jobId, 'rejected');
      throw error;
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

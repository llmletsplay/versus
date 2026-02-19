import { GameManager } from '../core/game-manager.js';
import { TournamentService } from '../services/tournament-service.js';
import { WagerService } from '../services/wager-service.js';
import { X402PaymentService } from '../services/x402-payment-service.js';
import { VirtualsACPService } from '../services/virtuals-acp-service.js';
import { logger } from '../utils/logger.js';

export interface VersusAgentConfig {
  autoJoinTournaments: boolean;
  preferredGames: string[];
  maxEntryFee: number;
  minPrizePool: number;
  autoAcceptWagers: boolean;
  maxWagerStake: number;
  enableTournamentHosting: boolean;
  enableMatchmaking: boolean;
}

export class VersusPlatformAgent {
  private acp: VirtualsACPService;
  private x402: X402PaymentService;
  private games: GameManager;
  private tournaments: TournamentService;
  private wagers: WagerService;
  private config: VersusAgentConfig;
  private isRunning = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    acp: VirtualsACPService,
    x402: X402PaymentService,
    games: GameManager,
    tournaments: TournamentService,
    wagers: WagerService,
    config: Partial<VersusAgentConfig> = {}
  ) {
    this.acp = acp;
    this.x402 = x402;
    this.games = games;
    this.tournaments = tournaments;
    this.wagers = wagers;
    
    this.config = {
      autoJoinTournaments: config.autoJoinTournaments ?? true,
      preferredGames: config.preferredGames ?? ['chess', 'tic-tac-toe', 'connect-four'],
      maxEntryFee: config.maxEntryFee ?? 10,
      minPrizePool: config.minPrizePool ?? 50,
      autoAcceptWagers: config.autoAcceptWagers ?? false,
      maxWagerStake: config.maxWagerStake ?? 100,
      enableTournamentHosting: config.enableTournamentHosting ?? true,
      enableMatchmaking: config.enableMatchmaking ?? true,
    };
  }

  /**
   * Start the VERSUS platform agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('VERSUS agent already running');
      return;
    }

    this.isRunning = true;
    logger.info('VERSUS platform agent starting', { config: this.config });

    // Start ACP job processor
    this.startACPJobProcessor();

    // Start tournament monitor
    if (this.config.autoJoinTournaments) {
      this.startTournamentMonitor();
    }

    // Start wager monitor
    this.startWagerMonitor();

    logger.info('VERSUS platform agent started successfully');
  }

  /**
   * Stop the VERSUS platform agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('VERSUS platform agent stopped');
  }

  /**
   * Process ACP jobs from other agents
   */
  private startACPJobProcessor(): void {
    // Check for new jobs every 30 seconds
    this.checkInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const jobs = await this.acp.listActiveJobs();
        
        for (const job of jobs) {
          await this.processACPJob(job.id);
        }
      } catch (error: any) {
        logger.error('Error processing ACP jobs', { error: error.message });
      }
    }, 30000);
  }

  /**
   * Process a single ACP job
   */
  private async processACPJob(jobId: string): Promise<void> {
    const job = await this.acp.getJob(jobId);
    if (!job || job.status !== 'pending') return;

    const offering = await this.acp.getOffering(job.offeringId);
    if (!offering) return;

    logger.info('Processing ACP job', { jobId, offering: offering.name });

    try {
      switch (offering.handler) {
        case 'tournamentHost':
          await this.acp.executeJob(jobId, async (req) => {
            return this.hostTournament(req);
          });
          break;

        case 'matchmaking':
          await this.acp.executeJob(jobId, async (req) => {
            return this.findMatch(req);
          });
          break;

        case 'wagerEscrow':
          await this.acp.executeJob(jobId, async (req) => {
            return this.createWagerEscrow(req);
          });
          break;

        case 'gameAnalysis':
          await this.acp.executeJob(jobId, async (req) => {
            return this.analyzeGame(req);
          });
          break;

        default:
          logger.warn('Unknown job handler', { handler: offering.handler });
      }
    } catch (error: any) {
      logger.error('Failed to process ACP job', { jobId, error: error.message });
    }
  }

  /**
   * Host a tournament (ACP job handler)
   */
  private async hostTournament(requirements: any): Promise<any> {
    const { gameType, format, maxPlayers, entryFee, prizePool } = requirements;

    // Create tournament
    const tournament = await this.tournaments.createTournament({
      name: `ACP Tournament - ${gameType}`,
      gameType,
      format,
      entryFee,
      prizePool,
      maxPlayers,
      createdBy: 'versus-agent',
    });

    logger.info('Tournament hosted for ACP', { 
      tournamentId: tournament.id,
      gameType,
      prizePool,
    });

    return {
      tournamentId: tournament.id,
      joinUrl: `/tournaments/${tournament.id}/join`,
      startTime: tournament.startsAt,
    };
  }

  /**
   * Find match for player (ACP job handler)
   */
  private async findMatch(requirements: any): Promise<any> {
    const { gameType, rating, ratingRange } = requirements;

    // Use matchmaking service to find opponent
    const match = await this.findOpponent(gameType, rating, ratingRange);

    return {
      matchFound: !!match,
      opponent: match ? {
        id: match.opponentId,
        rating: match.opponentRating,
      } : null,
      gameId: match?.gameId,
      estimatedWait: match ? 0 : 60,
    };
  }

  /**
   * Create wager escrow (ACP job handler)
   */
  private async createWagerEscrow(requirements: any): Promise<any> {
    const { gameType, stake, opponent } = requirements;

    // Validate stake
    if (stake > this.config.maxWagerStake) {
      throw new Error(`Stake exceeds maximum of ${this.config.maxWagerStake}`);
    }

    // Create wager
    const wager = await this.wagers.createWager({
      gameType,
      creatorId: 'versus-agent',
      opponentId: opponent,
      stake,
    });

    return {
      wagerId: wager.id,
      status: wager.status,
      escrowAddress: this.x402.getSettlementAddress(),
    };
  }

  /**
   * Analyze game (ACP job handler)
   */
  private async analyzeGame(requirements: any): Promise<any> {
    const { gameId, gameType } = requirements;

    // Get game state
    const gameState = await this.games.getGameState(gameType, gameId);
    
    // Generate analysis (simplified - would use AI in production)
    const analysis = {
      gameId,
      gameType,
      movesAnalyzed: gameState?.moveHistory?.length || 0,
      keyMoments: [],
      recommendations: [
        'Focus on center control',
        'Develop pieces early',
        'Watch for tactical patterns',
      ],
      skillRating: 'intermediate',
    };

    return analysis;
  }

  /**
   * Find opponent via matchmaking
   */
  private async findOpponent(
    gameType: string,
    rating: number,
    ratingRange: number
  ): Promise<any> {
    // This would integrate with your matchmaking service
    // For now, return mock data
    return {
      opponentId: `opponent-${Date.now()}`,
      opponentRating: rating + Math.floor(Math.random() * ratingRange * 2) - ratingRange,
      gameId: `game-${Date.now()}`,
    };
  }

  /**
   * Monitor tournaments and auto-join suitable ones
   */
  private startTournamentMonitor(): void {
    setInterval(async () => {
      if (!this.isRunning || !this.config.autoJoinTournaments) return;

      try {
        // Get upcoming tournaments
        const tournaments = await this.tournaments.listTournaments({
          status: 'upcoming',
        });

        for (const tournament of tournaments) {
          // Check if tournament matches criteria
          if (this.shouldJoinTournament(tournament)) {
            await this.joinTournament(tournament.id);
          }
        }
      } catch (error: any) {
        logger.error('Error monitoring tournaments', { error: error.message });
      }
    }, 60000); // Check every minute
  }

  /**
   * Determine if agent should join tournament
   */
  private shouldJoinTournament(tournament: any): boolean {
    // Check preferred games
    if (!this.config.preferredGames.includes(tournament.gameType)) {
      return false;
    }

    // Check entry fee
    if (tournament.entryFee > this.config.maxEntryFee) {
      return false;
    }

    // Check prize pool
    if (tournament.prizePool < this.config.minPrizePool) {
      return false;
    }

    return true;
  }

  /**
   * Join a tournament
   */
  private async joinTournament(tournamentId: string): Promise<void> {
    try {
      await this.tournaments.joinTournament(tournamentId, 'versus-agent');
      logger.info('Auto-joined tournament', { tournamentId });
    } catch (error: any) {
      logger.error('Failed to join tournament', { tournamentId, error: error.message });
    }
  }

  /**
   * Monitor wagers and auto-accept suitable ones
   */
  private startWagerMonitor(): void {
    if (!this.config.autoAcceptWagers) return;

    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Get open wagers
        const openWagers = await this.wagers.listOpenWagers();

        for (const wager of openWagers) {
          if (this.shouldAcceptWager(wager)) {
            await this.acceptWager(wager.id);
          }
        }
      } catch (error: any) {
        logger.error('Error monitoring wagers', { error: error.message });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Determine if agent should accept wager
   */
  private shouldAcceptWager(wager: any): boolean {
    // Check stake limit
    if (wager.stake > this.config.maxWagerStake) {
      return false;
    }

    // Check preferred games
    if (!this.config.preferredGames.includes(wager.gameType)) {
      return false;
    }

    // Check opponent rating (if available)
    // Would implement ELO-based decision making

    return true;
  }

  /**
   * Accept a wager
   */
  private async acceptWager(wagerId: string): Promise<void> {
    try {
      await this.wagers.acceptWager(wagerId, 'versus-agent');
      logger.info('Auto-accepted wager', { wagerId });
    } catch (error: any) {
      logger.error('Failed to accept wager', { wagerId, error: error.message });
    }
  }

  /**
   * Get agent configuration
   */
  getConfig(): VersusAgentConfig {
    return { ...this.config };
  }

  /**
   * Update agent configuration
   */
  async updateConfig(updates: Partial<VersusAgentConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    logger.info('VERSUS agent config updated', { config: this.config });
  }

  /**
   * Get agent status
   */
  getStatus(): { isRunning: boolean; config: VersusAgentConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }
}

import { v4 as uuidv4 } from 'uuid';
import { DatabaseProvider } from '../core/database.js';
import { WebSocketServer } from '../core/websocket.js';
import { logger } from '../utils/logger.js';
import type {
  PredictionMarket,
  MarketPosition,
  CreateMarketRequest,
  PlaceBetRequest,
  MarketOdds,
  MarketStatus,
} from '../types/market.js';
import type { IntentService } from './intent-service.js';
import type { ChainNetwork } from '../types/intent.js';

const PLATFORM_RAKE = 0.05;

export class PredictionMarketService {
  private db: DatabaseProvider;
  private wsServer: WebSocketServer;
  private intentService: IntentService | null;

  constructor(db: DatabaseProvider, wsServer: WebSocketServer, intentService?: IntentService) {
    this.db = db;
    this.wsServer = wsServer;
    this.intentService = intentService ?? null;
  }

  /**
   * Create a new prediction market.
   */
  async createMarket(request: CreateMarketRequest): Promise<PredictionMarket> {
    const id = `market-${uuidv4()}`;
    const now = Date.now();
    const outcomePools = new Array(request.outcomes.length).fill(0);

    const market: PredictionMarket = {
      id,
      marketType: request.marketType,
      roomId: request.roomId ?? null,
      tournamentId: request.tournamentId ?? null,
      question: request.question,
      outcomes: request.outcomes,
      status: 'open',
      resolutionSource: request.roomId
        ? 'game_result'
        : request.tournamentId
          ? 'tournament_result'
          : 'admin',
      totalPool: 0,
      outcomePools,
      token: request.token ?? 'USDC',
      winningOutcomeIndex: -1,
      createdAt: now,
      closesAt: request.closesAt,
      resolvedAt: null,
    };

    await this.db.execute(
      `INSERT INTO prediction_markets
       (id, market_type, room_id, tournament_id, question, outcomes, status,
        resolution_source, total_pool, outcome_pools, token, winning_outcome_index,
        created_at, closes_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        market.id,
        market.marketType,
        market.roomId,
        market.tournamentId,
        market.question,
        JSON.stringify(market.outcomes),
        market.status,
        market.resolutionSource,
        market.totalPool,
        JSON.stringify(market.outcomePools),
        market.token,
        market.winningOutcomeIndex,
        market.createdAt,
        market.closesAt,
        market.resolvedAt,
      ]
    );

    logger.info('Prediction market created', { marketId: id, question: request.question });
    return market;
  }

  /**
   * Place a bet on a market outcome.
   */
  async placeBet(userId: string, request: PlaceBetRequest): Promise<MarketPosition> {
    const market = await this.getMarket(request.marketId);
    if (!market) {
      throw new Error(`Market not found: ${request.marketId}`);
    }

    if (market.status !== 'open') {
      throw new Error(`Market is not open for betting: ${market.status}`);
    }

    if (Date.now() > market.closesAt) {
      throw new Error('Market has closed for new bets');
    }

    if (request.outcomeIndex < 0 || request.outcomeIndex >= market.outcomes.length) {
      throw new Error(`Invalid outcome index: ${request.outcomeIndex}`);
    }

    if (request.amount <= 0) {
      throw new Error('Bet amount must be positive');
    }

    // Calculate potential payout at current odds
    const newOutcomePool = (market.outcomePools[request.outcomeIndex] ?? 0) + request.amount;
    const newTotalPool = market.totalPool + request.amount;
    const potentialPayout = (request.amount / newOutcomePool) * newTotalPool * (1 - PLATFORM_RAKE);

    const id = `pos-${uuidv4()}`;
    const position: MarketPosition = {
      id,
      marketId: request.marketId,
      userId,
      outcomeIndex: request.outcomeIndex,
      amount: request.amount,
      token: market.token,
      potentialPayout: Math.round(potentialPayout * 100) / 100,
      settled: false,
      payout: 0,
      createdAt: Date.now(),
    };

    await this.db.execute(
      `INSERT INTO market_positions
       (id, market_id, user_id, outcome_index, amount, token, potential_payout, settled, payout, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        position.id,
        position.marketId,
        position.userId,
        position.outcomeIndex,
        position.amount,
        position.token,
        position.potentialPayout,
        position.settled ? 1 : 0,
        position.payout,
        position.createdAt,
      ]
    );

    // Update market pools
    const updatedOutcomePools = [...(market.outcomePools ?? [])];
    updatedOutcomePools[request.outcomeIndex] =
      (updatedOutcomePools[request.outcomeIndex] ?? 0) + request.amount;

    await this.db.execute(
      `UPDATE prediction_markets
       SET total_pool = total_pool + ?, outcome_pools = ?
       WHERE id = ?`,
      [request.amount, JSON.stringify(updatedOutcomePools), request.marketId]
    );

    logger.info('Bet placed', {
      positionId: id,
      marketId: request.marketId,
      userId,
      outcomeIndex: request.outcomeIndex,
      amount: request.amount,
    });

    // Broadcast market update
    if (market.roomId) {
      this.wsServer.broadcastToRoom(market.roomId, {
        event: 'market:bet',
        data: {
          marketId: market.id,
          outcomeIndex: request.outcomeIndex,
          amount: request.amount,
          newTotalPool: newTotalPool,
          newOutcomePools: updatedOutcomePools,
        },
        roomId: market.roomId,
        timestamp: Date.now(),
      });
    }

    return position;
  }

  /**
   * Resolve a market with the winning outcome.
   * Settles all positions and calculates payouts.
   */
  async resolveMarket(marketId: string, winningOutcomeIndex: number): Promise<void> {
    const market = await this.getMarket(marketId);
    if (!market) {
      throw new Error(`Market not found: ${marketId}`);
    }

    if (market.status === 'resolved' || market.status === 'cancelled') {
      throw new Error(`Market already ${market.status}`);
    }

    if (winningOutcomeIndex < 0 || winningOutcomeIndex >= market.outcomes.length) {
      throw new Error(`Invalid winning outcome index: ${winningOutcomeIndex}`);
    }

    const now = Date.now();

    // Update market status
    await this.db.execute(
      `UPDATE prediction_markets
       SET status = 'resolved', winning_outcome_index = ?, resolved_at = ?
       WHERE id = ?`,
      [winningOutcomeIndex, now, marketId]
    );

    // Calculate and distribute payouts
    const winningPool = market.outcomePools[winningOutcomeIndex] ?? 0;
    const totalPoolAfterRake = market.totalPool * (1 - PLATFORM_RAKE);

    // Get all winning positions
    const winningPositions = await this.db.query<any>(
      `SELECT * FROM market_positions
       WHERE market_id = ? AND outcome_index = ?`,
      [marketId, winningOutcomeIndex]
    );

    // Settle winning positions (guard against division by zero when no one bet on the winner)
    for (const pos of winningPositions) {
      if (winningPool <= 0) {
        logger.warn('Winning pool is zero — skipping payout calculation', { marketId });
        break;
      }
      const share = Number(pos.amount) / winningPool;
      const payout = Math.round(share * totalPoolAfterRake * 100) / 100;

      await this.db.execute(`UPDATE market_positions SET settled = ?, payout = ? WHERE id = ?`, [
        1,
        payout,
        pos.id,
      ]);
    }

    // Settle losing positions (payout = 0)
    await this.db.execute(
      `UPDATE market_positions SET settled = ?, payout = 0
       WHERE market_id = ? AND outcome_index != ?`,
      [1, marketId, winningOutcomeIndex]
    );

    logger.info('Market resolved', {
      marketId,
      winningOutcome: market.outcomes[winningOutcomeIndex],
      totalPool: market.totalPool,
      winningPositions: winningPositions.length,
    });

    // Broadcast resolution
    if (market.roomId) {
      this.wsServer.broadcastToRoom(market.roomId, {
        event: 'market:resolved',
        data: {
          marketId: market.id,
          winningOutcomeIndex,
          winningOutcome: market.outcomes[winningOutcomeIndex],
          totalPool: market.totalPool,
        },
        roomId: market.roomId,
        timestamp: now,
      });
    }
  }

  /**
   * Cancel a market and refund all bets.
   */
  async cancelMarket(marketId: string): Promise<void> {
    await this.db.execute(`UPDATE prediction_markets SET status = 'cancelled' WHERE id = ?`, [
      marketId,
    ]);

    // Settle all positions with refund (payout = amount)
    await this.db.execute(
      `UPDATE market_positions SET settled = ?, payout = amount WHERE market_id = ?`,
      [1, marketId]
    );

    logger.info('Market cancelled and refunded', { marketId });
  }

  /**
   * Lock a market (no more bets, e.g., when game starts).
   */
  async lockMarket(marketId: string): Promise<void> {
    await this.db.execute(`UPDATE prediction_markets SET status = 'locked' WHERE id = ?`, [
      marketId,
    ]);
  }

  /**
   * Place a bet with intent creation for non-custodial settlement.
   */
  async placeBetWithIntent(
    userId: string,
    request: PlaceBetRequest & { walletAddress: string; chain: ChainNetwork }
  ): Promise<{ position: MarketPosition; intentId: string | null }> {
    const position = await this.placeBet(userId, request);

    let intentId: string | null = null;

    if (this.intentService) {
      try {
        const intent = await this.intentService.createPredictionIntent({
          marketId: request.marketId,
          chain: request.chain,
          predictionOutcome: request.outcomeIndex,
          amount: request.amount.toString(),
          userId,
        });

        intentId = intent.id;

        await this.db.execute(
          `INSERT INTO market_intent_mappings (market_id, position_id, intent_id, created_at)
           VALUES (?, ?, ?, ?)`,
          [request.marketId, position.id, intentId, Date.now()]
        );

        logger.info('Created prediction intent', { positionId: position.id, intentId });
      } catch (error) {
        logger.error('Failed to create prediction intent', { error, positionId: position.id });
      }
    }

    return { position, intentId };
  }

  /**
   * Resolve a market with intent-based settlement.
   * Triggers intent settlement for all winning positions.
   */
  async resolveMarketWithIntent(
    marketId: string,
    winningOutcomeIndex: number,
    proof?: { matchId: string; winner: string | null }
  ): Promise<{ settled: boolean; intentIds: string[] }> {
    await this.resolveMarket(marketId, winningOutcomeIndex);

    const intentIds: string[] = [];

    if (this.intentService) {
      try {
        const market = await this.getMarket(marketId);
        if (!market) {
          throw new Error('Market not found after resolution');
        }

        const winningPositions = await this.db.query<any>(
          `SELECT * FROM market_positions WHERE market_id = ? AND outcome_index = ? AND payout > 0`,
          [marketId, winningOutcomeIndex]
        );

        for (const pos of winningPositions) {
          const intentRows = await this.db.query<any>(
            `SELECT intent_id FROM market_intent_mappings WHERE position_id = ?`,
            [pos.id]
          );

          for (const row of intentRows) {
            intentIds.push(row.intent_id);
          }
        }

        if (proof) {
          const resolveIntent = await this.intentService.createResolveEventIntent({
            matchId: proof.matchId,
            chain: 'base',
            finalOutcome: proof.winner ?? 'draw',
          });

          intentIds.push(resolveIntent.id);
          logger.info('Created market resolution intent', { marketId, intentId: resolveIntent.id });
        }
      } catch (error) {
        logger.error('Failed to create resolution intents', { error, marketId });
      }
    }

    return { settled: true, intentIds };
  }

  /**
   * Get intent mappings for a market.
   */
  async getMarketIntents(marketId: string): Promise<{ positionId: string; intentId: string }[]> {
    const rows = await this.db.query<any>(
      `SELECT position_id, intent_id FROM market_intent_mappings WHERE market_id = ?`,
      [marketId]
    );

    return rows.map((row: any) => ({
      positionId: row.position_id,
      intentId: row.intent_id,
    }));
  }

  /**
   * Get a market by ID.
   */
  async getMarket(marketId: string): Promise<PredictionMarket | null> {
    const row = await this.db.get<any>('SELECT * FROM prediction_markets WHERE id = ?', [marketId]);

    if (!row) return null;
    return this.deserializeMarket(row);
  }

  /**
   * Get market by room ID.
   */
  async getMarketByRoom(roomId: string): Promise<PredictionMarket | null> {
    const row = await this.db.get<any>('SELECT * FROM prediction_markets WHERE room_id = ?', [
      roomId,
    ]);

    if (!row) return null;
    return this.deserializeMarket(row);
  }

  /**
   * List open markets.
   */
  async listMarkets(status?: MarketStatus): Promise<PredictionMarket[]> {
    const where = status ? `WHERE status = ?` : `WHERE status IN ('open', 'locked')`;
    const params = status ? [status] : [];

    const rows = await this.db.query<any>(
      `SELECT * FROM prediction_markets ${where} ORDER BY created_at DESC`,
      params
    );

    return rows.map((row: any) => this.deserializeMarket(row));
  }

  /**
   * Get computed odds for a market.
   */
  async getMarketOdds(marketId: string): Promise<MarketOdds | null> {
    const market = await this.getMarket(marketId);
    if (!market) return null;

    const impliedProbabilities = market.outcomes.map((_: string, i: number) =>
      market.totalPool > 0
        ? (market.outcomePools[i] ?? 0) / market.totalPool
        : 1 / market.outcomes.length
    );

    const payoutMultipliers = market.outcomes.map((_: string, i: number) => {
      const pool = market.outcomePools[i] ?? 0;
      return pool > 0 ? Math.round((market.totalPool / pool) * (1 - PLATFORM_RAKE) * 100) / 100 : 0;
    });

    return {
      marketId: market.id,
      outcomes: market.outcomes,
      impliedProbabilities,
      payoutMultipliers,
      totalPool: market.totalPool,
    };
  }

  /**
   * Get a user's positions across all markets or a specific market.
   */
  async getUserPositions(userId: string, marketId?: string): Promise<MarketPosition[]> {
    const where = marketId ? 'WHERE user_id = ? AND market_id = ?' : 'WHERE user_id = ?';
    const params = marketId ? [userId, marketId] : [userId];

    const rows = await this.db.query<any>(
      `SELECT * FROM market_positions ${where} ORDER BY created_at DESC`,
      params
    );

    return rows.map((row: any) => this.deserializePosition(row));
  }

  /**
   * Auto-create a match outcome market for a room.
   */
  async createMatchOutcomeMarket(
    roomId: string,
    gameType: string,
    playerNames: string[],
    closesAt: number
  ): Promise<PredictionMarket> {
    const outcomes = [...playerNames, 'Draw'];
    return this.createMarket({
      marketType: 'match_outcome',
      roomId,
      question: `Who wins this ${gameType} match?`,
      outcomes,
      closesAt,
    });
  }

  private deserializeMarket(row: any): PredictionMarket {
    return {
      id: row.id,
      marketType: row.market_type,
      roomId: row.room_id || null,
      tournamentId: row.tournament_id || null,
      question: row.question,
      outcomes: JSON.parse(row.outcomes),
      status: row.status as MarketStatus,
      resolutionSource: row.resolution_source,
      totalPool: Number(row.total_pool),
      outcomePools: JSON.parse(row.outcome_pools),
      token: row.token,
      winningOutcomeIndex: row.winning_outcome_index,
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
      closesAt:
        typeof row.closes_at === 'number' ? row.closes_at : new Date(row.closes_at).getTime(),
      resolvedAt: row.resolved_at
        ? typeof row.resolved_at === 'number'
          ? row.resolved_at
          : new Date(row.resolved_at).getTime()
        : null,
    };
  }

  private deserializePosition(row: any): MarketPosition {
    return {
      id: row.id,
      marketId: row.market_id,
      userId: row.user_id,
      outcomeIndex: row.outcome_index,
      amount: Number(row.amount),
      token: row.token,
      potentialPayout: Number(row.potential_payout),
      settled: Boolean(row.settled),
      payout: Number(row.payout),
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
    };
  }
}

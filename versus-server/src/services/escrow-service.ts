import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { DatabaseProvider } from '../core/database.js';
import { WebSocketServer } from '../core/websocket.js';
import { logger } from '../utils/logger.js';
import type {
  EscrowTransaction,
  EscrowDeposit,
  CreateEscrowRequest,
  ResolveEscrowRequest,
  EscrowStatus,
} from '../types/escrow.js';

const DEFAULT_CHAIN_ID = 8453; // Base L2
const DEFAULT_PLATFORM_FEE = 2.5; // percent

export class EscrowService {
  private db: DatabaseProvider;
  private wsServer: WebSocketServer;

  constructor(db: DatabaseProvider, wsServer: WebSocketServer) {
    this.db = db;
    this.wsServer = wsServer;
  }

  /**
   * Create a new escrow for a wager room.
   */
  async createEscrow(request: CreateEscrowRequest): Promise<EscrowTransaction> {
    const id = `escrow-${uuidv4()}`;
    const now = Date.now();

    const escrow: EscrowTransaction = {
      id,
      roomId: request.roomId,
      gameId: null,
      contractAddress: null,
      chainId: request.chainId ?? DEFAULT_CHAIN_ID,
      totalAmount: 0,
      token: request.token,
      platformFeePercent: DEFAULT_PLATFORM_FEE,
      status: 'pending',
      winnerAddress: null,
      resultSignature: null,
      createdAt: now,
      resolvedAt: null,
    };

    await this.db.execute(
      `INSERT INTO escrow_transactions
       (id, room_id, game_id, contract_address, chain_id, total_amount, token,
        platform_fee_percent, status, winner_address, result_signature, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        escrow.id,
        escrow.roomId,
        escrow.gameId,
        escrow.contractAddress,
        escrow.chainId,
        escrow.totalAmount,
        escrow.token,
        escrow.platformFeePercent,
        escrow.status,
        escrow.winnerAddress,
        escrow.resultSignature,
        escrow.createdAt,
        escrow.resolvedAt,
      ]
    );

    logger.info('Escrow created', { escrowId: id, roomId: request.roomId, token: request.token });
    return escrow;
  }

  /**
   * Record a player's deposit into an escrow.
   */
  async recordDeposit(
    escrowId: string,
    userId: string,
    walletAddress: string,
    amount: number,
    token: string,
    txHash?: string
  ): Promise<EscrowDeposit> {
    const id = `deposit-${uuidv4()}`;
    const now = Date.now();

    const deposit: EscrowDeposit = {
      id,
      escrowId,
      userId,
      walletAddress,
      amount,
      token,
      txHash: txHash ?? null,
      status: txHash ? 'confirmed' : 'pending',
      createdAt: now,
      confirmedAt: txHash ? now : null,
    };

    await this.db.execute(
      `INSERT INTO escrow_deposits
       (id, escrow_id, user_id, wallet_address, amount, token, tx_hash, status, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deposit.id,
        deposit.escrowId,
        deposit.userId,
        deposit.walletAddress,
        deposit.amount,
        deposit.token,
        deposit.txHash,
        deposit.status,
        deposit.createdAt,
        deposit.confirmedAt,
      ]
    );

    // Update escrow total
    await this.db.execute(
      `UPDATE escrow_transactions SET total_amount = total_amount + ? WHERE id = ?`,
      [amount, escrowId]
    );

    logger.info('Deposit recorded', { depositId: id, escrowId, userId, amount, token });

    // Check if escrow is fully funded
    await this.checkAndUpdateFundingStatus(escrowId);

    return deposit;
  }

  /**
   * Confirm a pending deposit (e.g., after tx confirmation on-chain).
   */
  async confirmDeposit(depositId: string, txHash: string): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `UPDATE escrow_deposits SET status = 'confirmed', tx_hash = ?, confirmed_at = ? WHERE id = ?`,
      [txHash, now, depositId]
    );

    // Get the escrow ID from the deposit
    const deposit = await this.db.get<any>('SELECT escrow_id FROM escrow_deposits WHERE id = ?', [
      depositId,
    ]);

    if (deposit) {
      await this.checkAndUpdateFundingStatus(deposit.escrow_id);
    }
  }

  /**
   * Resolve the escrow — pay the winner.
   * Called when GameManager determines a winner.
   */
  async resolveEscrow(request: ResolveEscrowRequest): Promise<EscrowTransaction> {
    const escrow = await this.getEscrow(request.escrowId);
    if (!escrow) {
      throw new Error(`Escrow not found: ${request.escrowId}`);
    }

    if (escrow.status !== 'funded') {
      throw new Error(`Escrow is not in funded state: ${escrow.status}`);
    }

    // Generate result signature for on-chain verification
    const signature = this.generateResultSignature(
      escrow.id,
      request.winnerId,
      request.gameHistoryHash
    );

    const now = Date.now();

    await this.db.execute(
      `UPDATE escrow_transactions
       SET status = 'released', winner_address = ?, result_signature = ?, resolved_at = ?
       WHERE id = ?`,
      [request.winnerAddress, signature, now, request.escrowId]
    );

    const platformFee = escrow.totalAmount * (escrow.platformFeePercent / 100);
    const payout = escrow.totalAmount - platformFee;

    logger.info('Escrow resolved', {
      escrowId: request.escrowId,
      winnerId: request.winnerId,
      totalAmount: escrow.totalAmount,
      platformFee,
      payout,
    });

    // Notify room via WebSocket
    this.wsServer.broadcastToRoom(escrow.roomId, {
      event: 'game:over',
      data: {
        escrowId: escrow.id,
        winnerId: request.winnerId,
        payout,
        platformFee,
      },
      roomId: escrow.roomId,
      timestamp: now,
    });

    return {
      ...escrow,
      status: 'released',
      winnerAddress: request.winnerAddress,
      resultSignature: signature,
      resolvedAt: now,
    };
  }

  /**
   * Refund all deposits (e.g., opponent never joined or game cancelled).
   */
  async refundEscrow(escrowId: string): Promise<void> {
    const escrow = await this.getEscrow(escrowId);
    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    if (escrow.status === 'released' || escrow.status === 'refunded') {
      throw new Error(`Escrow already resolved: ${escrow.status}`);
    }

    await this.db.execute(
      `UPDATE escrow_transactions SET status = 'refunded', resolved_at = ? WHERE id = ?`,
      [Date.now(), escrowId]
    );

    logger.info('Escrow refunded', { escrowId, totalAmount: escrow.totalAmount });
  }

  /**
   * Flag an escrow as disputed.
   */
  async disputeEscrow(escrowId: string, reason: string): Promise<void> {
    await this.db.execute(`UPDATE escrow_transactions SET status = 'disputed' WHERE id = ?`, [
      escrowId,
    ]);
    logger.warn('Escrow disputed', { escrowId, reason });
  }

  /**
   * Get an escrow by ID.
   */
  async getEscrow(escrowId: string): Promise<EscrowTransaction | null> {
    const row = await this.db.get<any>('SELECT * FROM escrow_transactions WHERE id = ?', [
      escrowId,
    ]);

    if (!row) return null;
    return this.deserializeEscrow(row);
  }

  /**
   * Get escrow by room ID.
   */
  async getEscrowByRoom(roomId: string): Promise<EscrowTransaction | null> {
    const row = await this.db.get<any>('SELECT * FROM escrow_transactions WHERE room_id = ?', [
      roomId,
    ]);

    if (!row) return null;
    return this.deserializeEscrow(row);
  }

  /**
   * Get all deposits for an escrow.
   */
  async getDeposits(escrowId: string): Promise<EscrowDeposit[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM escrow_deposits WHERE escrow_id = ? ORDER BY created_at',
      [escrowId]
    );

    return rows.map((row: any) => this.deserializeDeposit(row));
  }

  /**
   * Link a game ID to the escrow (called when game starts).
   */
  async setGameId(escrowId: string, gameId: string): Promise<void> {
    await this.db.execute(`UPDATE escrow_transactions SET game_id = ? WHERE id = ?`, [
      gameId,
      escrowId,
    ]);
  }

  /**
   * Generate a hash of the game's move history for auditability.
   */
  generateGameHistoryHash(moves: any[]): string {
    const data = JSON.stringify(moves);
    return createHash('sha256').update(data).digest('hex');
  }

  private async checkAndUpdateFundingStatus(escrowId: string): Promise<void> {
    const deposits = await this.db.query<any>(
      `SELECT * FROM escrow_deposits WHERE escrow_id = ? AND status = 'confirmed'`,
      [escrowId]
    );

    // Check if we have deposits from at least 2 players
    const uniqueUsers = new Set(deposits.map((d: any) => d.user_id));
    if (uniqueUsers.size >= 2) {
      await this.db.execute(
        `UPDATE escrow_transactions SET status = 'funded' WHERE id = ? AND status = 'pending'`,
        [escrowId]
      );
      logger.info('Escrow fully funded', { escrowId, depositors: uniqueUsers.size });
    }
  }

  /**
   * Generate a server-signed result for on-chain verification.
   * In production, this would use an actual private key for ECDSA signing.
   */
  private generateResultSignature(
    escrowId: string,
    winnerId: string,
    gameHistoryHash: string
  ): string {
    const payload = `${escrowId}:${winnerId}:${gameHistoryHash}`;
    const signingKey = process.env.ESCROW_SIGNING_KEY || process.env.JWT_SECRET || 'dev-key';
    return createHash('sha256').update(`${payload}:${signingKey}`).digest('hex');
  }

  private deserializeEscrow(row: any): EscrowTransaction {
    return {
      id: row.id,
      roomId: row.room_id,
      gameId: row.game_id || null,
      contractAddress: row.contract_address || null,
      chainId: row.chain_id,
      totalAmount: Number(row.total_amount),
      token: row.token,
      platformFeePercent: Number(row.platform_fee_percent),
      status: row.status as EscrowStatus,
      winnerAddress: row.winner_address || null,
      resultSignature: row.result_signature || null,
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
      resolvedAt: row.resolved_at
        ? typeof row.resolved_at === 'number'
          ? row.resolved_at
          : new Date(row.resolved_at).getTime()
        : null,
    };
  }

  private deserializeDeposit(row: any): EscrowDeposit {
    return {
      id: row.id,
      escrowId: row.escrow_id,
      userId: row.user_id,
      walletAddress: row.wallet_address,
      amount: Number(row.amount),
      token: row.token,
      txHash: row.tx_hash || null,
      status: row.status,
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
      confirmedAt: row.confirmed_at
        ? typeof row.confirmed_at === 'number'
          ? row.confirmed_at
          : new Date(row.confirmed_at).getTime()
        : null,
    };
  }
}

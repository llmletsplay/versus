import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { EscrowService } from '../services/escrow-service.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

const createEscrowSchema = z.object({
  roomId: z.string().min(1),
  wagerAmount: z.number().positive(),
  token: z.string().min(1).default('USDC'),
  chainId: z.number().optional(),
});

const depositSchema = z.object({
  walletAddress: z.string().min(1),
  amount: z.number().positive(),
  token: z.string().min(1).default('USDC'),
  txHash: z.string().optional(),
});

const resolveSchema = z.object({
  winnerId: z.string().min(1),
  winnerAddress: z.string().min(1),
  gameHistoryHash: z.string().min(1),
});

export function createEscrowRoutes(escrowService: EscrowService) {
  const app = new Hono();

  /**
   * POST /
   * Create a new escrow for a room
   */
  app.post('/', zValidator('json', createEscrowSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      const escrow = await escrowService.createEscrow(body);
      return c.json({ success: true, data: escrow }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create escrow';
      logger.error('Error creating escrow', { error: message });
      return c.json({ success: false, error: message, code: 'ESCROW_CREATE_ERROR' }, 500);
    }
  });

  /**
   * GET /:escrowId
   * Get escrow details
   */
  app.get('/:escrowId', async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      const escrow = await escrowService.getEscrow(escrowId);
      if (!escrow) {
        return c.json({ success: false, error: 'Escrow not found', code: 'ESCROW_NOT_FOUND' }, 404);
      }
      return c.json({ success: true, data: escrow });
    } catch (error) {
      logger.error('Error fetching escrow', { error });
      return c.json({ success: false, error: 'Failed to fetch escrow', code: 'ESCROW_ERROR' }, 500);
    }
  });

  /**
   * GET /room/:roomId
   * Get escrow for a specific room
   */
  app.get('/room/:roomId', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const escrow = await escrowService.getEscrowByRoom(roomId);
      if (!escrow) {
        return c.json(
          { success: false, error: 'No escrow found for room', code: 'ESCROW_NOT_FOUND' },
          404
        );
      }
      return c.json({ success: true, data: escrow });
    } catch (error) {
      logger.error('Error fetching escrow by room', { error });
      return c.json({ success: false, error: 'Failed to fetch escrow', code: 'ESCROW_ERROR' }, 500);
    }
  });

  /**
   * POST /:escrowId/deposit
   * Record a deposit into the escrow
   */
  app.post('/:escrowId/deposit', requireAuth, zValidator('json', depositSchema), async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      const userId = getAuthUserId(c);

      const body = c.req.valid('json');
      const deposit = await escrowService.recordDeposit(
        escrowId,
        userId,
        body.walletAddress,
        body.amount,
        body.token,
        body.txHash
      );
      return c.json({ success: true, data: deposit }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deposit failed';
      logger.error('Error recording deposit', { error: message });
      return c.json({ success: false, error: message, code: 'DEPOSIT_ERROR' }, 500);
    }
  });

  /**
   * POST /:escrowId/deposit/:depositId/confirm
   * Confirm a pending deposit with tx hash
   */
  app.post('/:escrowId/deposit/:depositId/confirm', async (c) => {
    try {
      const depositId = c.req.param('depositId');
      const body = (await c.req.json()) as { txHash: string };
      if (!body.txHash) {
        return c.json({ success: false, error: 'txHash required', code: 'VALIDATION_ERROR' }, 400);
      }

      await escrowService.confirmDeposit(depositId, body.txHash);
      return c.json({ success: true, data: { status: 'confirmed' } });
    } catch (error) {
      logger.error('Error confirming deposit', { error });
      return c.json(
        { success: false, error: 'Failed to confirm deposit', code: 'CONFIRM_ERROR' },
        500
      );
    }
  });

  /**
   * GET /:escrowId/deposits
   * Get all deposits for an escrow
   */
  app.get('/:escrowId/deposits', async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      const deposits = await escrowService.getDeposits(escrowId);
      return c.json({ success: true, data: deposits });
    } catch (error) {
      logger.error('Error fetching deposits', { error });
      return c.json(
        { success: false, error: 'Failed to fetch deposits', code: 'DEPOSIT_ERROR' },
        500
      );
    }
  });

  /**
   * POST /:escrowId/resolve
   * Resolve escrow and pay winner (admin/system only)
   */
  app.post('/:escrowId/resolve', zValidator('json', resolveSchema), async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      const body = c.req.valid('json');
      const result = await escrowService.resolveEscrow({
        escrowId,
        ...body,
      });
      return c.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resolution failed';
      logger.error('Error resolving escrow', { error: message });
      return c.json({ success: false, error: message, code: 'RESOLVE_ERROR' }, 500);
    }
  });

  /**
   * POST /:escrowId/refund
   * Refund all deposits
   */
  app.post('/:escrowId/refund', async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      await escrowService.refundEscrow(escrowId);
      return c.json({ success: true, data: { status: 'refunded' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refund failed';
      logger.error('Error refunding escrow', { error: message });
      return c.json({ success: false, error: message, code: 'REFUND_ERROR' }, 500);
    }
  });

  /**
   * POST /:escrowId/dispute
   * Flag escrow as disputed
   */
  app.post('/:escrowId/dispute', async (c) => {
    try {
      const escrowId = c.req.param('escrowId');
      const body = (await c.req.json()) as { reason: string };
      await escrowService.disputeEscrow(escrowId, body.reason || 'No reason provided');
      return c.json({ success: true, data: { status: 'disputed' } });
    } catch (error) {
      logger.error('Error disputing escrow', { error });
      return c.json(
        { success: false, error: 'Failed to dispute escrow', code: 'DISPUTE_ERROR' },
        500
      );
    }
  });

  return app;
}

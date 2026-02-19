import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { RoomService } from '../services/room-service.js';
import type { RoomFilters } from '../types/room.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const createRoomSchema = z.object({
  gameType: z.string().min(1),
  minPlayers: z.number().int().min(1).optional().default(2),
  maxPlayers: z.number().int().min(1).optional().default(2),
  isPublic: z.boolean().optional().default(true),
  isRanked: z.boolean().optional().default(false),
  spectatorsAllowed: z.boolean().optional().default(true),
  wagerAmount: z.number().nonnegative().optional(),
  wagerCurrency: z.string().optional(),
  escrowAddress: z.string().optional(),
  gameConfig: z.record(z.unknown()).optional(),
});

const joinRoomSchema = z.object({
  role: z.enum(['player', 'spectator']).optional().default('player'),
  agentId: z.string().optional(),
  eloAtJoin: z.number().optional(),
});

const listRoomsQuerySchema = z.object({
  gameType: z.string().optional(),
  status: z.string().optional(),
  isRanked: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  hasWager: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});

const matchmakingSchema = z.object({
  gameType: z.string().min(1),
  isRanked: z.boolean().optional().default(false),
  wagerAmount: z.number().nonnegative().optional(),
  wagerCurrency: z.string().optional(),
  elo: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createRoomRoutes(roomService: RoomService): Hono {
  const app = new Hono();

  // -------------------------------------------------------------------------
  // POST / — Create room (auth required)
  // -------------------------------------------------------------------------
  app.post('/', requireAuth, zValidator('json', createRoomSchema), async (c) => {
    try {
      const userId = getAuthUserId(c);
      const body = c.req.valid('json');

      const room = await roomService.createRoom(userId, body);

      return c.json({ success: true, data: room }, 201);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to create room', { error: err.message });
      return c.json({ success: false, error: err.message, code: 'CREATE_ROOM_FAILED' }, 400);
    }
  });

  // -------------------------------------------------------------------------
  // GET / — List rooms (public)
  // -------------------------------------------------------------------------
  app.get('/', zValidator('query', listRoomsQuerySchema), async (c) => {
    try {
      const filters = c.req.valid('query') as RoomFilters;
      const rooms = await roomService.listRooms(filters);

      return c.json({ success: true, data: rooms });
    } catch (err: any) {
      logger.error('Failed to list rooms', { error: err.message });
      return c.json({ success: false, error: err.message, code: 'LIST_ROOMS_FAILED' }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // GET /:roomId — Get room details + participants (public)
  // -------------------------------------------------------------------------
  app.get('/:roomId', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const room = await roomService.getRoom(roomId);

      if (!room) {
        return c.json({ success: false, error: 'Room not found', code: 'ROOM_NOT_FOUND' }, 404);
      }

      const participants = await roomService.getRoomParticipants(roomId);

      return c.json({ success: true, data: { ...room, participants } });
    } catch (err: any) {
      logger.error('Failed to get room', { error: err.message });
      return c.json({ success: false, error: err.message, code: 'GET_ROOM_FAILED' }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:roomId/join — Join room (auth required)
  // -------------------------------------------------------------------------
  app.post('/:roomId/join', requireAuth, zValidator('json', joinRoomSchema), async (c) => {
    try {
      const userId = getAuthUserId(c);
      const roomId = c.req.param('roomId');
      const body = c.req.valid('json');

      const participant = await roomService.joinRoom(roomId, userId, body);

      return c.json({ success: true, data: participant });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to join room', { error: err.message, roomId: c.req.param('roomId') });
      const status = err.message === 'Room not found' ? 404 : 400;
      return c.json({ success: false, error: err.message, code: 'JOIN_ROOM_FAILED' }, status);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:roomId/leave — Leave room (auth required)
  // -------------------------------------------------------------------------
  app.post('/:roomId/leave', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);
      const roomId = c.req.param('roomId');

      await roomService.leaveRoom(roomId, userId);

      return c.json({ success: true, data: { message: 'Left room' } });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to leave room', { error: err.message, roomId: c.req.param('roomId') });
      return c.json({ success: false, error: err.message, code: 'LEAVE_ROOM_FAILED' }, 400);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:roomId/ready — Ready up (auth required)
  // -------------------------------------------------------------------------
  app.post('/:roomId/ready', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);
      const roomId = c.req.param('roomId');

      await roomService.readyUp(roomId, userId);

      return c.json({ success: true, data: { message: 'Ready' } });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to ready up', { error: err.message, roomId: c.req.param('roomId') });
      return c.json({ success: false, error: err.message, code: 'READY_FAILED' }, 400);
    }
  });

  // -------------------------------------------------------------------------
  // POST /:roomId/unready — Unready (auth required)
  // -------------------------------------------------------------------------
  app.post('/:roomId/unready', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);
      const roomId = c.req.param('roomId');

      await roomService.unready(roomId, userId);

      return c.json({ success: true, data: { message: 'Unready' } });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to unready', { error: err.message, roomId: c.req.param('roomId') });
      return c.json({ success: false, error: err.message, code: 'UNREADY_FAILED' }, 400);
    }
  });

  // -------------------------------------------------------------------------
  // POST /matchmaking — Queue for matchmaking (auth required)
  // -------------------------------------------------------------------------
  app.post('/matchmaking', requireAuth, zValidator('json', matchmakingSchema), async (c) => {
    try {
      const userId = getAuthUserId(c);
      const body = c.req.valid('json');

      const result = await roomService.enqueueForMatchmaking({
        userId,
        gameType: body.gameType,
        isRanked: body.isRanked,
        wagerAmount: body.wagerAmount ?? null,
        wagerCurrency: body.wagerCurrency ?? null,
        elo: body.elo,
      });

      return c.json({ success: true, data: result });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to enqueue for matchmaking', { error: err.message });
      return c.json({ success: false, error: err.message, code: 'MATCHMAKING_FAILED' }, 400);
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /matchmaking — Leave matchmaking queue (auth required)
  // -------------------------------------------------------------------------
  app.delete('/matchmaking', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);

      await roomService.dequeueFromMatchmaking(userId);

      return c.json({ success: true, data: { message: 'Removed from matchmaking queue' } });
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return c.json(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
          401
        );
      }
      logger.error('Failed to dequeue from matchmaking', { error: err.message });
      return c.json(
        { success: false, error: err.message, code: 'MATCHMAKING_DEQUEUE_FAILED' },
        400
      );
    }
  });

  return app;
}

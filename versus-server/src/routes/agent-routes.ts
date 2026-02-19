import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { OpenClawBridge } from '../services/openclaw-bridge.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

const registerAgentSchema = z.object({
  displayName: z.string().min(1).max(64),
  provider: z.enum(['openclaw', 'mcp', 'api']),
  providerAgentId: z.string().optional(),
  gamesSupported: z.array(z.string().min(1)).min(1),
});

const webhookSchema = z.object({
  type: z.string().min(1),
  agentId: z.string().min(1),
  sessionKey: z.string().optional(),
  payload: z.any(),
});

export function createAgentRoutes(bridge: OpenClawBridge): Hono {
  const app = new Hono();

  // Register a new agent (auth required)
  app.post('/register', requireAuth, zValidator('json', registerAgentSchema), async (c) => {
    const userId = getAuthUserId(c);
    const body = c.req.valid('json');

    try {
      const agent = await bridge.registerAgent(userId, {
        displayName: body.displayName,
        provider: body.provider,
        providerAgentId: body.providerAgentId,
        gamesSupported: body.gamesSupported,
      });

      logger.info('Agent registered via API', { agentId: agent.id, userId });

      return c.json({ success: true, data: agent }, 201);
    } catch (err: any) {
      logger.error('Failed to register agent', { error: err.message });
      return c.json({ success: false, error: 'Failed to register agent' }, 500);
    }
  });

  // List all active agents
  app.get('/', async (c) => {
    try {
      const agents = await bridge.listAgents(true);
      return c.json({ success: true, data: agents });
    } catch (err: any) {
      logger.error('Failed to list agents', { error: err.message });
      return c.json({ success: false, error: 'Failed to list agents' }, 500);
    }
  });

  // Get agent details
  app.get('/:agentId', async (c) => {
    const agentId = c.req.param('agentId');

    try {
      const agent = await bridge.getAgent(agentId);

      if (!agent) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      return c.json({ success: true, data: agent });
    } catch (err: any) {
      logger.error('Failed to get agent', { agentId, error: err.message });
      return c.json({ success: false, error: 'Failed to get agent' }, 500);
    }
  });

  // Get agent stats
  app.get('/:agentId/stats', async (c) => {
    const agentId = c.req.param('agentId');

    try {
      const agent = await bridge.getAgent(agentId);

      if (!agent) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
      }

      return c.json({
        success: true,
        data: {
          agentId: agent.id,
          displayName: agent.displayName,
          stats: {
            totalGames: agent.totalGames,
            wins: agent.wins,
            losses: agent.losses,
            draws: agent.draws,
          },
          eloRatings: agent.eloRatings,
        },
      });
    } catch (err: any) {
      logger.error('Failed to get agent stats', { agentId, error: err.message });
      return c.json({ success: false, error: 'Failed to get agent stats' }, 500);
    }
  });

  // OpenClaw webhook receiver
  app.post('/webhook', zValidator('json', webhookSchema), async (c) => {
    const authHeader = c.req.header('Authorization');
    const expectedToken = (bridge as any).config?.hookToken;

    if (expectedToken) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

      if (token !== expectedToken) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
    }

    const body = c.req.valid('json');

    try {
      logger.info('Received OpenClaw webhook', {
        type: body.type,
        agentId: body.agentId,
      });

      switch (body.type) {
        case 'agent_move':
          await (bridge as any).handleAgentMove(body.agentId, body.sessionKey ?? '', body.payload);
          break;
        case 'agent_join':
          await (bridge as any).handleAgentJoin(body.agentId, body.payload);
          break;
        case 'agent_leave':
          (bridge as any).handleAgentLeave(body.agentId, body.sessionKey ?? '');
          break;
        default:
          logger.warn('Unknown webhook message type', { type: body.type });
          return c.json({ success: false, error: `Unknown message type: ${body.type}` }, 400);
      }

      return c.json({ success: true, data: { received: true } });
    } catch (err: any) {
      logger.error('Webhook processing failed', {
        type: body.type,
        agentId: body.agentId,
        error: err.message,
      });
      return c.json({ success: false, error: 'Webhook processing failed' }, 500);
    }
  });

  return app;
}

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { TournamentService } from '../services/tournament-service.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

const createTournamentSchema = z.object({
  name: z.string().min(1).max(100),
  gameType: z.string().min(1),
  format: z.enum(['single_elimination', 'round_robin', 'swiss']),
  maxParticipants: z.number().int().min(2).max(256),
  entryFee: z.number().nonnegative().optional(),
  entryFeeToken: z.string().optional(),
  gameConfig: z.record(z.any()).optional(),
});

export function createTournamentRoutes(tournamentService: TournamentService) {
  const app = new Hono();

  /** POST / — Create tournament */
  app.post('/', zValidator('json', createTournamentSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      const tournament = await tournamentService.createTournament(body);
      return c.json({ success: true, data: tournament }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create tournament';
      logger.error('Error creating tournament', { error: message });
      return c.json({ success: false, error: message, code: 'TOURNAMENT_CREATE_ERROR' }, 500);
    }
  });

  /** GET / — List tournaments */
  app.get('/', async (c) => {
    try {
      const status = c.req.query('status') as any;
      const tournaments = await tournamentService.listTournaments(status || undefined);
      return c.json({ success: true, data: tournaments });
    } catch (error) {
      logger.error('Error listing tournaments', { error });
      return c.json(
        { success: false, error: 'Failed to list tournaments', code: 'TOURNAMENT_LIST_ERROR' },
        500
      );
    }
  });

  /** GET /:tournamentId — Get tournament details */
  app.get('/:tournamentId', async (c) => {
    try {
      const tournamentId = c.req.param('tournamentId');
      const tournament = await tournamentService.getTournament(tournamentId);
      if (!tournament) {
        return c.json(
          { success: false, error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' },
          404
        );
      }
      return c.json({ success: true, data: tournament });
    } catch (error) {
      logger.error('Error fetching tournament', { error });
      return c.json(
        { success: false, error: 'Failed to fetch tournament', code: 'TOURNAMENT_ERROR' },
        500
      );
    }
  });

  /** GET /:tournamentId/standings — Get tournament standings */
  app.get('/:tournamentId/standings', async (c) => {
    try {
      const tournamentId = c.req.param('tournamentId');
      const standings = await tournamentService.getStandings(tournamentId);
      return c.json({ success: true, data: standings });
    } catch (error) {
      logger.error('Error fetching standings', { error });
      return c.json(
        { success: false, error: 'Failed to fetch standings', code: 'STANDINGS_ERROR' },
        500
      );
    }
  });

  /** GET /:tournamentId/participants — Get participants */
  app.get('/:tournamentId/participants', async (c) => {
    try {
      const tournamentId = c.req.param('tournamentId');
      const participants = await tournamentService.getParticipants(tournamentId);
      return c.json({ success: true, data: participants });
    } catch (error) {
      logger.error('Error fetching participants', { error });
      return c.json(
        { success: false, error: 'Failed to fetch participants', code: 'PARTICIPANTS_ERROR' },
        500
      );
    }
  });

  /** POST /:tournamentId/register — Register for tournament (auth required) */
  app.post('/:tournamentId/register', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);
      const tournamentId = c.req.param('tournamentId');
      const body = (await c.req.json().catch(() => ({}))) as { agentId?: string };
      const participant = await tournamentService.registerParticipant(
        tournamentId,
        userId,
        body.agentId
      );
      return c.json({ success: true, data: participant }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      logger.error('Error registering for tournament', { error: message });
      const statusCode = message.includes('not found')
        ? 404
        : message.includes('closed') || message.includes('full')
          ? 400
          : 500;
      return c.json({ success: false, error: message, code: 'REGISTRATION_ERROR' }, statusCode);
    }
  });

  /** POST /:tournamentId/start — Start the tournament (admin) */
  app.post('/:tournamentId/start', async (c) => {
    try {
      const tournamentId = c.req.param('tournamentId');
      const matches = await tournamentService.startTournament(tournamentId);
      return c.json({ success: true, data: { status: 'started', matches } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start';
      logger.error('Error starting tournament', { error: message });
      return c.json({ success: false, error: message, code: 'START_ERROR' }, 400);
    }
  });

  /** GET /:tournamentId/rounds/:round — Get matches for a round */
  app.get('/:tournamentId/rounds/:round', async (c) => {
    try {
      const tournamentId = c.req.param('tournamentId');
      const round = parseInt(c.req.param('round'));
      const matches = await tournamentService.getRoundMatches(tournamentId, round);
      return c.json({ success: true, data: matches });
    } catch (error) {
      logger.error('Error fetching round matches', { error });
      return c.json(
        { success: false, error: 'Failed to fetch matches', code: 'MATCHES_ERROR' },
        500
      );
    }
  });

  /** POST /matches/:matchId/result — Record match result */
  app.post('/matches/:matchId/result', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const body = (await c.req.json()) as { winnerId: string | null };

      await tournamentService.recordMatchResult(matchId, body.winnerId);
      return c.json({ success: true, data: { status: 'recorded' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record result';
      logger.error('Error recording match result', { error: message });
      return c.json({ success: false, error: message, code: 'RESULT_ERROR' }, 500);
    }
  });

  return app;
}

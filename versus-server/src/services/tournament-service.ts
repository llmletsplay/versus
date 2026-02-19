import { v4 as uuidv4 } from 'uuid';
import { DatabaseProvider } from '../core/database.js';
import { WebSocketServer } from '../core/websocket.js';
import { logger } from '../utils/logger.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentMatch,
  CreateTournamentRequest,
  TournamentStanding,
  TournamentStatus,
} from '../types/tournament.js';

export class TournamentService {
  private db: DatabaseProvider;
  private wsServer: WebSocketServer;

  constructor(db: DatabaseProvider, wsServer: WebSocketServer) {
    this.db = db;
    this.wsServer = wsServer;
  }

  /**
   * Create a new tournament.
   */
  async createTournament(request: CreateTournamentRequest): Promise<Tournament> {
    const id = `tournament-${uuidv4()}`;
    const now = Date.now();

    const totalRounds = this.calculateTotalRounds(request.format, request.maxParticipants);

    const tournament: Tournament = {
      id,
      name: request.name,
      gameType: request.gameType,
      format: request.format,
      status: 'registration',
      entryFee: request.entryFee ?? 0,
      entryFeeToken: request.entryFeeToken ?? 'USDC',
      prizePool: 0,
      maxParticipants: request.maxParticipants,
      currentParticipants: 0,
      currentRound: 0,
      totalRounds,
      gameConfig: request.gameConfig ?? null,
      marketId: null,
      createdAt: now,
      startedAt: null,
      endedAt: null,
    };

    await this.db.execute(
      `INSERT INTO tournaments
       (id, name, game_type, format, status, entry_fee, entry_fee_token,
        prize_pool, max_participants, current_participants, current_round,
        total_rounds, game_config, market_id, created_at, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tournament.id,
        tournament.name,
        tournament.gameType,
        tournament.format,
        tournament.status,
        tournament.entryFee,
        tournament.entryFeeToken,
        tournament.prizePool,
        tournament.maxParticipants,
        tournament.currentParticipants,
        tournament.currentRound,
        tournament.totalRounds,
        tournament.gameConfig ? JSON.stringify(tournament.gameConfig) : null,
        tournament.marketId,
        tournament.createdAt,
        tournament.startedAt,
        tournament.endedAt,
      ]
    );

    logger.info('Tournament created', {
      tournamentId: id,
      name: request.name,
      format: request.format,
    });
    return tournament;
  }

  /**
   * Register a participant in a tournament.
   */
  async registerParticipant(
    tournamentId: string,
    userId: string,
    agentId?: string
  ): Promise<TournamentParticipant> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament not found: ${tournamentId}`);
    }

    if (tournament.status !== 'registration') {
      throw new Error('Tournament registration is closed');
    }

    if (tournament.currentParticipants >= tournament.maxParticipants) {
      throw new Error('Tournament is full');
    }

    // Check if already registered
    const existing = await this.db.get<any>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?',
      [tournamentId, userId]
    );
    if (existing) {
      throw new Error('Already registered for this tournament');
    }

    const seed = tournament.currentParticipants + 1;
    const now = Date.now();

    const participant: TournamentParticipant = {
      tournamentId,
      userId,
      agentId: agentId ?? null,
      seed,
      currentRound: 0,
      eliminated: false,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      registeredAt: now,
    };

    await this.db.execute(
      `INSERT INTO tournament_participants
       (tournament_id, user_id, agent_id, seed, current_round, eliminated,
        wins, losses, draws, points, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tournamentId, userId, participant.agentId, seed, 0, 0, 0, 0, 0, 0, now]
    );

    // Update participant count and prize pool
    await this.db.execute(
      `UPDATE tournaments
       SET current_participants = current_participants + 1,
           prize_pool = prize_pool + ?
       WHERE id = ?`,
      [tournament.entryFee, tournamentId]
    );

    logger.info('Tournament participant registered', { tournamentId, userId, seed });
    return participant;
  }

  /**
   * Start the tournament and generate the first round of matches.
   */
  async startTournament(tournamentId: string): Promise<TournamentMatch[]> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament) {
      throw new Error(`Tournament not found: ${tournamentId}`);
    }

    if (tournament.status !== 'registration') {
      throw new Error('Tournament is not in registration phase');
    }

    if (tournament.currentParticipants < 2) {
      throw new Error('Need at least 2 participants to start');
    }

    const now = Date.now();

    await this.db.execute(
      `UPDATE tournaments SET status = 'in_progress', current_round = 1, started_at = ? WHERE id = ?`,
      [now, tournamentId]
    );

    const participants = await this.getParticipants(tournamentId);
    const matches = this.generateRoundMatches(tournament, participants, 1);

    // Insert matches into DB
    for (const match of matches) {
      await this.db.execute(
        `INSERT INTO tournament_matches
         (id, tournament_id, round, match_number, room_id, player_a_id, player_b_id, winner_id, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match.id,
          match.tournamentId,
          match.round,
          match.matchNumber,
          match.roomId,
          match.playerAId,
          match.playerBId,
          match.winnerId,
          match.status,
          match.createdAt,
          match.completedAt,
        ]
      );
    }

    // Broadcast tournament start
    this.wsServer.broadcastToAll({
      event: 'tournament:update',
      data: { tournamentId, status: 'in_progress', round: 1, matches },
      timestamp: now,
    });

    logger.info('Tournament started', { tournamentId, round: 1, matchCount: matches.length });
    return matches;
  }

  /**
   * Record a match result and advance the tournament.
   */
  async recordMatchResult(matchId: string, winnerId: string | null): Promise<void> {
    const match = await this.getMatch(matchId);
    if (!match) {
      throw new Error(`Match not found: ${matchId}`);
    }

    const now = Date.now();

    await this.db.execute(
      `UPDATE tournament_matches SET winner_id = ?, status = 'completed', completed_at = ? WHERE id = ?`,
      [winnerId, now, matchId]
    );

    // Update participant stats
    if (winnerId) {
      const loserId = winnerId === match.playerAId ? match.playerBId : match.playerAId;

      await this.db.execute(
        `UPDATE tournament_participants SET wins = wins + 1, points = points + 1 WHERE tournament_id = ? AND user_id = ?`,
        [match.tournamentId, winnerId]
      );

      if (loserId) {
        await this.db.execute(
          `UPDATE tournament_participants SET losses = losses + 1 WHERE tournament_id = ? AND user_id = ?`,
          [match.tournamentId, loserId]
        );

        // In single elimination, loser is eliminated
        const tournament = await this.getTournament(match.tournamentId);
        if (tournament?.format === 'single_elimination') {
          await this.db.execute(
            `UPDATE tournament_participants SET eliminated = ? WHERE tournament_id = ? AND user_id = ?`,
            [1, match.tournamentId, loserId]
          );
        }
      }
    } else {
      // Draw
      await this.db.execute(
        `UPDATE tournament_participants SET draws = draws + 1, points = points + 0.5 WHERE tournament_id = ? AND user_id IN (?, ?)`,
        [match.tournamentId, match.playerAId, match.playerBId ?? '']
      );
    }

    // Broadcast match result
    this.wsServer.broadcastToAll({
      event: 'tournament:match_end',
      data: { matchId, tournamentId: match.tournamentId, winnerId, round: match.round },
      timestamp: now,
    });

    // Check if round is complete
    await this.checkRoundCompletion(match.tournamentId, match.round);
  }

  /**
   * Check if all matches in a round are complete and advance if so.
   */
  private async checkRoundCompletion(tournamentId: string, round: number): Promise<void> {
    const pendingMatches = await this.db.query<any>(
      `SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ? AND status != 'completed' AND status != 'bye'`,
      [tournamentId, round]
    );

    if (pendingMatches.length > 0) {
      return; // Round not yet complete
    }

    const tournament = await this.getTournament(tournamentId);
    if (!tournament) return;

    // Check if tournament is over
    if (round >= tournament.totalRounds) {
      await this.completeTournament(tournamentId);
      return;
    }

    // For single elimination, check if only one player remains
    if (tournament.format === 'single_elimination') {
      const remaining = await this.db.query<any>(
        `SELECT * FROM tournament_participants WHERE tournament_id = ? AND eliminated = 0`,
        [tournamentId]
      );
      if (remaining.length <= 1) {
        await this.completeTournament(tournamentId);
        return;
      }
    }

    // Advance to next round
    const nextRound = round + 1;
    await this.db.execute(`UPDATE tournaments SET current_round = ? WHERE id = ?`, [
      nextRound,
      tournamentId,
    ]);

    const participants = await this.getParticipants(tournamentId);
    const activeParticipants = participants.filter((p) => !p.eliminated);
    const matches = this.generateRoundMatches(tournament, activeParticipants, nextRound);

    for (const match of matches) {
      await this.db.execute(
        `INSERT INTO tournament_matches
         (id, tournament_id, round, match_number, room_id, player_a_id, player_b_id, winner_id, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match.id,
          match.tournamentId,
          match.round,
          match.matchNumber,
          match.roomId,
          match.playerAId,
          match.playerBId,
          match.winnerId,
          match.status,
          match.createdAt,
          match.completedAt,
        ]
      );
    }

    this.wsServer.broadcastToAll({
      event: 'tournament:round_advance',
      data: { tournamentId, round: nextRound, matches },
      timestamp: Date.now(),
    });

    logger.info('Tournament advanced to next round', {
      tournamentId,
      round: nextRound,
      matchCount: matches.length,
    });
  }

  private async completeTournament(tournamentId: string): Promise<void> {
    const now = Date.now();
    await this.db.execute(
      `UPDATE tournaments SET status = 'completed', ended_at = ? WHERE id = ?`,
      [now, tournamentId]
    );

    this.wsServer.broadcastToAll({
      event: 'tournament:update',
      data: { tournamentId, status: 'completed' },
      timestamp: now,
    });

    logger.info('Tournament completed', { tournamentId });
  }

  /**
   * Generate matches for a round based on tournament format.
   */
  private generateRoundMatches(
    tournament: Tournament,
    participants: TournamentParticipant[],
    round: number
  ): TournamentMatch[] {
    switch (tournament.format) {
      case 'single_elimination':
        return this.generateSingleEliminationMatches(tournament.id, participants, round);
      case 'round_robin':
        return this.generateRoundRobinMatches(tournament.id, participants, round);
      case 'swiss':
        return this.generateSwissMatches(tournament.id, participants, round);
      default:
        return this.generateSingleEliminationMatches(tournament.id, participants, round);
    }
  }

  private generateSingleEliminationMatches(
    tournamentId: string,
    participants: TournamentParticipant[],
    round: number
  ): TournamentMatch[] {
    const now = Date.now();
    const matches: TournamentMatch[] = [];

    // Sort by seed
    const sorted = [...participants].sort((a, b) => a.seed - b.seed);

    for (let i = 0; i < sorted.length; i += 2) {
      const playerA = sorted[i];
      const playerB = sorted[i + 1]; // may be undefined = bye

      if (!playerA) continue;

      const matchId = `match-${uuidv4()}`;

      if (!playerB) {
        // Bye — playerA auto-advances
        matches.push({
          id: matchId,
          tournamentId,
          round,
          matchNumber: Math.floor(i / 2) + 1,
          roomId: null,
          playerAId: playerA.userId,
          playerBId: null,
          winnerId: playerA.userId,
          status: 'bye',
          createdAt: now,
          completedAt: now,
        });
      } else {
        matches.push({
          id: matchId,
          tournamentId,
          round,
          matchNumber: Math.floor(i / 2) + 1,
          roomId: null,
          playerAId: playerA.userId,
          playerBId: playerB.userId,
          winnerId: null,
          status: 'pending',
          createdAt: now,
          completedAt: null,
        });
      }
    }

    return matches;
  }

  private generateRoundRobinMatches(
    tournamentId: string,
    participants: TournamentParticipant[],
    round: number
  ): TournamentMatch[] {
    const now = Date.now();
    const matches: TournamentMatch[] = [];
    let matchNumber = 1;

    // For round robin, each round pairs different opponents
    // Using the "circle method" for round-robin scheduling
    const n = participants.length;
    const playerList = [...participants];

    // If odd number, add a "bye" placeholder
    if (n % 2 !== 0) {
      playerList.push(null as any);
    }

    const size = playerList.length;
    const roundIndex = (round - 1) % (size - 1);

    // Rotate all but the first element
    const rotated = [playerList[0]];
    for (let i = 1; i < size; i++) {
      const idx = ((i - 1 + roundIndex) % (size - 1)) + 1;
      rotated.push(playerList[idx]);
    }

    for (let i = 0; i < size / 2; i++) {
      const playerA = rotated[i];
      const playerB = rotated[size - 1 - i];

      if (!playerA || !playerB) {
        // This participant gets a bye this round
        continue;
      }

      matches.push({
        id: `match-${uuidv4()}`,
        tournamentId,
        round,
        matchNumber: matchNumber++,
        roomId: null,
        playerAId: playerA.userId,
        playerBId: playerB.userId,
        winnerId: null,
        status: 'pending',
        createdAt: now,
        completedAt: null,
      });
    }

    return matches;
  }

  private generateSwissMatches(
    tournamentId: string,
    participants: TournamentParticipant[],
    round: number
  ): TournamentMatch[] {
    const now = Date.now();
    const matches: TournamentMatch[] = [];
    let matchNumber = 1;

    // Sort by points (desc), then seed (asc)
    const sorted = [...participants].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.seed - b.seed;
    });

    const paired = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const pA = sorted[i];
      if (!pA || paired.has(pA.userId)) continue;

      // Find the next unpaired opponent
      for (let j = i + 1; j < sorted.length; j++) {
        const pB = sorted[j];
        if (!pB || paired.has(pB.userId)) continue;

        paired.add(pA.userId);
        paired.add(pB.userId);

        matches.push({
          id: `match-${uuidv4()}`,
          tournamentId,
          round,
          matchNumber: matchNumber++,
          roomId: null,
          playerAId: pA.userId,
          playerBId: pB.userId,
          winnerId: null,
          status: 'pending',
          createdAt: now,
          completedAt: null,
        });

        break;
      }
    }

    return matches;
  }

  // ── Query Methods ──────────────────────────────────────────────────

  async getTournament(tournamentId: string): Promise<Tournament | null> {
    const row = await this.db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!row) return null;
    return this.deserializeTournament(row);
  }

  async listTournaments(status?: TournamentStatus): Promise<Tournament[]> {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];

    const rows = await this.db.query<any>(
      `SELECT * FROM tournaments ${where} ORDER BY created_at DESC`,
      params
    );
    return rows.map((row: any) => this.deserializeTournament(row));
  }

  async getParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY seed`,
      [tournamentId]
    );
    return rows.map((row: any) => this.deserializeParticipant(row));
  }

  async getMatch(matchId: string): Promise<TournamentMatch | null> {
    const row = await this.db.get<any>('SELECT * FROM tournament_matches WHERE id = ?', [matchId]);
    if (!row) return null;
    return this.deserializeMatch(row);
  }

  async getRoundMatches(tournamentId: string, round: number): Promise<TournamentMatch[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ? ORDER BY match_number`,
      [tournamentId, round]
    );
    return rows.map((row: any) => this.deserializeMatch(row));
  }

  async getStandings(tournamentId: string): Promise<TournamentStanding[]> {
    const participants = await this.getParticipants(tournamentId);

    const standings = participants
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.seed - b.seed;
      })
      .map((p, index) => ({
        rank: index + 1,
        userId: p.userId,
        agentId: p.agentId,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        points: p.points,
        eliminated: p.eliminated,
      }));

    return standings;
  }

  private calculateTotalRounds(format: string, maxParticipants: number): number {
    switch (format) {
      case 'single_elimination':
        return Math.ceil(Math.log2(maxParticipants));
      case 'round_robin':
        return maxParticipants % 2 === 0 ? maxParticipants - 1 : maxParticipants;
      case 'swiss':
        return Math.ceil(Math.log2(maxParticipants));
      default:
        return Math.ceil(Math.log2(maxParticipants));
    }
  }

  // ── Deserializers ──────────────────────────────────────────────────

  private deserializeTournament(row: any): Tournament {
    return {
      id: row.id,
      name: row.name,
      gameType: row.game_type,
      format: row.format,
      status: row.status as TournamentStatus,
      entryFee: Number(row.entry_fee),
      entryFeeToken: row.entry_fee_token,
      prizePool: Number(row.prize_pool),
      maxParticipants: row.max_participants,
      currentParticipants: row.current_participants,
      currentRound: row.current_round,
      totalRounds: row.total_rounds,
      gameConfig: row.game_config ? JSON.parse(row.game_config) : null,
      marketId: row.market_id || null,
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
      startedAt: row.started_at
        ? typeof row.started_at === 'number'
          ? row.started_at
          : new Date(row.started_at).getTime()
        : null,
      endedAt: row.ended_at
        ? typeof row.ended_at === 'number'
          ? row.ended_at
          : new Date(row.ended_at).getTime()
        : null,
    };
  }

  private deserializeParticipant(row: any): TournamentParticipant {
    return {
      tournamentId: row.tournament_id,
      userId: row.user_id,
      agentId: row.agent_id || null,
      seed: row.seed,
      currentRound: row.current_round,
      eliminated: Boolean(row.eliminated),
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      points: Number(row.points),
      registeredAt:
        typeof row.registered_at === 'number'
          ? row.registered_at
          : new Date(row.registered_at).getTime(),
    };
  }

  private deserializeMatch(row: any): TournamentMatch {
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      round: row.round,
      matchNumber: row.match_number,
      roomId: row.room_id || null,
      playerAId: row.player_a_id,
      playerBId: row.player_b_id || null,
      winnerId: row.winner_id || null,
      status: row.status,
      createdAt:
        typeof row.created_at === 'number' ? row.created_at : new Date(row.created_at).getTime(),
      completedAt: row.completed_at
        ? typeof row.completed_at === 'number'
          ? row.completed_at
          : new Date(row.completed_at).getTime()
        : null,
    };
  }
}

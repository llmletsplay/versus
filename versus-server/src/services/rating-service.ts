import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type {
  PlayerRating,
  EloResult,
  LeaderboardEntry,
  LeaderboardQuery,
} from '../types/rating.js';

const DEFAULT_RATING = 1200;

/**
 * K-factor determines how much a single game affects the rating.
 * Higher K = faster rating changes (good for new players).
 */
function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 30) return 32; // New player — fast calibration
  if (gamesPlayed < 100) return 24; // Intermediate
  return 16; // Established
}

/**
 * Calculate expected score using the standard ELO formula.
 * Returns a value between 0 and 1.
 */
function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

export class RatingService {
  private db: DatabaseProvider;

  constructor(db: DatabaseProvider) {
    this.db = db;
  }

  /**
   * Get a player's rating for a specific game type.
   * Returns default rating if no record exists.
   */
  async getPlayerRating(userId: string, gameType: string): Promise<PlayerRating> {
    const row = await this.db.get<any>(
      'SELECT * FROM player_ratings WHERE user_id = ? AND game_type = ?',
      [userId, gameType]
    );

    if (!row) {
      return {
        userId,
        gameType,
        eloRating: DEFAULT_RATING,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        peakRating: DEFAULT_RATING,
        currentStreak: 0,
        updatedAt: Date.now(),
      };
    }

    return this.deserializeRating(row);
  }

  /**
   * Process a game result and update both players' ratings.
   * winnerId = null means a draw.
   */
  async processGameResult(
    playerAId: string,
    playerBId: string,
    gameType: string,
    winnerId: string | null
  ): Promise<EloResult> {
    const ratingA = await this.getPlayerRating(playerAId, gameType);
    const ratingB = await this.getPlayerRating(playerBId, gameType);

    const kA = getKFactor(ratingA.gamesPlayed);
    const kB = getKFactor(ratingB.gamesPlayed);

    const expectedA = expectedScore(ratingA.eloRating, ratingB.eloRating);
    const expectedB = expectedScore(ratingB.eloRating, ratingA.eloRating);

    let actualA: number;
    let actualB: number;

    if (winnerId === null) {
      // Draw
      actualA = 0.5;
      actualB = 0.5;
    } else if (winnerId === playerAId) {
      actualA = 1;
      actualB = 0;
    } else {
      actualA = 0;
      actualB = 1;
    }

    const deltaA = Math.round(kA * (actualA - expectedA));
    const deltaB = Math.round(kB * (actualB - expectedB));

    const newRatingA = Math.max(100, ratingA.eloRating + deltaA);
    const newRatingB = Math.max(100, ratingB.eloRating + deltaB);

    // Update player A
    await this.updateRating(
      ratingA,
      newRatingA,
      winnerId === null ? 'draw' : winnerId === playerAId ? 'win' : 'loss'
    );

    // Update player B
    await this.updateRating(
      ratingB,
      newRatingB,
      winnerId === null ? 'draw' : winnerId === playerBId ? 'win' : 'loss'
    );

    const result: EloResult = {
      winnerId: winnerId ?? playerAId, // For draws, first player is listed
      loserId: winnerId === null ? null : winnerId === playerAId ? playerBId : playerAId,
      winnerNewRating:
        winnerId === playerAId ? newRatingA : winnerId === playerBId ? newRatingB : newRatingA,
      loserNewRating:
        winnerId === playerAId ? newRatingB : winnerId === playerBId ? newRatingA : newRatingB,
      winnerDelta: winnerId === playerAId ? deltaA : winnerId === playerBId ? deltaB : deltaA,
      loserDelta: winnerId === playerAId ? deltaB : winnerId === playerBId ? deltaA : deltaB,
    };

    logger.info('ELO ratings updated', {
      gameType,
      playerA: { id: playerAId, old: ratingA.eloRating, new: newRatingA, delta: deltaA },
      playerB: { id: playerBId, old: ratingB.eloRating, new: newRatingB, delta: deltaB },
      winnerId,
    });

    return result;
  }

  /**
   * Get the leaderboard for a game type.
   */
  async getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = await this.db.query<any>(
      `SELECT pr.*, u.username,
              ar.id as agent_id, ar.display_name as agent_name
       FROM player_ratings pr
       LEFT JOIN users u ON pr.user_id = u.id
       LEFT JOIN agent_registry ar ON u.id = ar.owner_user_id
       WHERE pr.game_type = ?
       ORDER BY pr.elo_rating DESC
       LIMIT ? OFFSET ?`,
      [query.gameType, limit, offset]
    );

    return rows.map((row: any, index: number) => ({
      rank: offset + index + 1,
      userId: row.user_id,
      username: row.username || 'Unknown',
      agentId: row.agent_id || null,
      agentName: row.agent_name || null,
      eloRating: row.elo_rating,
      gamesPlayed: row.games_played,
      winRate: row.games_played > 0 ? Math.round((row.wins / row.games_played) * 100) / 100 : 0,
      peakRating: row.peak_rating,
    }));
  }

  /**
   * Get all ratings for a specific user across all game types.
   */
  async getUserRatings(userId: string): Promise<PlayerRating[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM player_ratings WHERE user_id = ? ORDER BY elo_rating DESC',
      [userId]
    );

    return rows.map((row: any) => this.deserializeRating(row));
  }

  private async updateRating(
    current: PlayerRating,
    newRating: number,
    outcome: 'win' | 'loss' | 'draw'
  ): Promise<void> {
    const newPeak = Math.max(current.peakRating, newRating);
    let newStreak = current.currentStreak;

    if (outcome === 'win') {
      newStreak = newStreak >= 0 ? newStreak + 1 : 1;
    } else if (outcome === 'loss') {
      newStreak = newStreak <= 0 ? newStreak - 1 : -1;
    } else {
      newStreak = 0;
    }

    const wins = current.wins + (outcome === 'win' ? 1 : 0);
    const losses = current.losses + (outcome === 'loss' ? 1 : 0);
    const draws = current.draws + (outcome === 'draw' ? 1 : 0);
    const gamesPlayed = current.gamesPlayed + 1;
    const now = Date.now();

    if (current.gamesPlayed === 0) {
      // Insert new rating record
      await this.db.execute(
        `INSERT INTO player_ratings
         (user_id, game_type, elo_rating, games_played, wins, losses, draws, peak_rating, current_streak, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          current.userId,
          current.gameType,
          newRating,
          gamesPlayed,
          wins,
          losses,
          draws,
          newPeak,
          newStreak,
          now,
        ]
      );
    } else {
      // Update existing
      await this.db.execute(
        `UPDATE player_ratings
         SET elo_rating = ?, games_played = ?, wins = ?, losses = ?, draws = ?,
             peak_rating = ?, current_streak = ?, updated_at = ?
         WHERE user_id = ? AND game_type = ?`,
        [
          newRating,
          gamesPlayed,
          wins,
          losses,
          draws,
          newPeak,
          newStreak,
          now,
          current.userId,
          current.gameType,
        ]
      );
    }
  }

  private deserializeRating(row: any): PlayerRating {
    return {
      userId: row.user_id,
      gameType: row.game_type,
      eloRating: row.elo_rating,
      gamesPlayed: row.games_played,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      peakRating: row.peak_rating,
      currentStreak: row.current_streak,
      updatedAt:
        typeof row.updated_at === 'number' ? row.updated_at : new Date(row.updated_at).getTime(),
    };
  }
}

// ── Player Rating ────────────────────────────────────────────────────
export interface PlayerRating {
  userId: string;
  gameType: string;
  eloRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  peakRating: number;
  /** Win streak (positive) or loss streak (negative) */
  currentStreak: number;
  updatedAt: number;
}

// ── ELO Calculation Result ───────────────────────────────────────────
export interface EloResult {
  winnerId: string;
  loserId: string | null; // null for draws
  winnerNewRating: number;
  loserNewRating: number;
  winnerDelta: number;
  loserDelta: number;
}

// ── Leaderboard Entry ────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  agentId: string | null;
  agentName: string | null;
  eloRating: number;
  gamesPlayed: number;
  winRate: number;
  peakRating: number;
}

// ── Leaderboard Query ────────────────────────────────────────────────
export interface LeaderboardQuery {
  gameType: string;
  limit?: number;
  offset?: number;
  /** Include agents in the leaderboard */
  includeAgents?: boolean;
}

export interface PlayerRating {
  userId: string;
  gameType: string;
  eloRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  peakRating: number;
  currentStreak: number;
  updatedAt: number;
}

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

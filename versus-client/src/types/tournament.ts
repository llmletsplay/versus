export type TournamentFormat = 'single_elimination' | 'round_robin' | 'swiss';
export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';

export interface Tournament {
  id: string;
  name: string;
  gameType: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entryFee: number;
  entryFeeToken: string;
  prizePool: number;
  maxParticipants: number;
  currentParticipants: number;
  currentRound: number;
  totalRounds: number;
  gameConfig: Record<string, unknown> | null;
  marketId: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

export interface TournamentParticipant {
  tournamentId: string;
  userId: string;
  agentId: string | null;
  seed: number;
  currentRound: number;
  eliminated: boolean;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  registeredAt: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  roomId: string | null;
  playerAId: string;
  playerBId: string | null;
  winnerId: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'bye';
  createdAt: number;
  completedAt: number | null;
}

export interface CreateTournamentRequest {
  name: string;
  gameType: string;
  format: TournamentFormat;
  maxParticipants: number;
  entryFee?: number;
  entryFeeToken?: string;
  gameConfig?: Record<string, unknown>;
}

export interface TournamentStanding {
  rank: number;
  userId: string;
  agentId: string | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  eliminated: boolean;
}

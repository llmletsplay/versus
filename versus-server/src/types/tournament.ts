// ── Tournament Formats ───────────────────────────────────────────────
export type TournamentFormat = 'single_elimination' | 'round_robin' | 'swiss';
export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';

// ── Tournament ───────────────────────────────────────────────────────
export interface Tournament {
  id: string;
  name: string;
  gameType: string;
  format: TournamentFormat;
  status: TournamentStatus;
  /** Entry fee per participant (0 = free) */
  entryFee: number;
  entryFeeToken: string;
  /** Total prize pool (entry fees + optional platform contribution) */
  prizePool: number;
  maxParticipants: number;
  currentParticipants: number;
  /** Current round number (1-indexed) */
  currentRound: number;
  totalRounds: number;
  /** Optional game config overrides for tournament matches */
  gameConfig: Record<string, any> | null;
  /** Associated prediction market for tournament winner */
  marketId: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

// ── Tournament Participant ───────────────────────────────────────────
export interface TournamentParticipant {
  tournamentId: string;
  userId: string;
  agentId: string | null;
  /** Seeding position (1 = top seed) */
  seed: number;
  /** Current round the participant is in */
  currentRound: number;
  /** Whether the participant has been eliminated */
  eliminated: boolean;
  /** Number of wins in this tournament */
  wins: number;
  /** Number of losses in this tournament */
  losses: number;
  /** Number of draws in this tournament */
  draws: number;
  /** Points (for round robin / swiss) */
  points: number;
  registeredAt: number;
}

// ── Tournament Match ─────────────────────────────────────────────────
export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  /** Room ID where this match is played */
  roomId: string | null;
  playerAId: string;
  playerBId: string | null; // null = bye
  winnerId: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'bye';
  createdAt: number;
  completedAt: number | null;
}

// ── Tournament Creation Request ──────────────────────────────────────
export interface CreateTournamentRequest {
  name: string;
  gameType: string;
  format: TournamentFormat;
  maxParticipants: number;
  entryFee?: number;
  entryFeeToken?: string;
  gameConfig?: Record<string, any>;
}

// ── Tournament Registration Request ──────────────────────────────────
export interface RegisterTournamentRequest {
  agentId?: string;
}

// ── Tournament Standings ─────────────────────────────────────────────
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

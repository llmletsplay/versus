import type { GameConfig } from './game.js';

// ── Room Status Lifecycle ────────────────────────────────────────────
export type RoomStatus = 'waiting' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
export type ParticipantRole = 'player' | 'spectator';
export type ReadyStatus = 'not_ready' | 'ready';

// ── Room ─────────────────────────────────────────────────────────────
export interface Room {
  id: string;
  gameType: string;
  status: RoomStatus;
  creatorId: string;
  minPlayers: number;
  maxPlayers: number;
  isPublic: boolean;
  isRanked: boolean;
  spectatorsAllowed: boolean;
  /** Wager amount in USD-equivalent (null = free play) */
  wagerAmount: number | null;
  /** Token symbol for wager (e.g., 'USDC', 'ETH') */
  wagerCurrency: string | null;
  /** On-chain escrow contract address, set when wager is deposited */
  escrowAddress: string | null;
  /** The game instance ID once the game starts */
  gameId: string | null;
  /** Optional game configuration overrides */
  gameConfig: GameConfig | null;
  /** Prediction market ID auto-created for this room */
  marketId: string | null;
  /** Tournament match reference (null if standalone) */
  tournamentMatchId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ── Room Participant ─────────────────────────────────────────────────
export interface RoomParticipant {
  roomId: string;
  userId: string;
  /** If this participant is an AI agent, the agent registry ID */
  agentId: string | null;
  role: ParticipantRole;
  readyStatus: ReadyStatus;
  /** Player's ELO at time of joining (for display) */
  eloAtJoin: number | null;
  joinedAt: number;
}

// ── Room Creation Request ────────────────────────────────────────────
export interface CreateRoomRequest {
  gameType: string;
  isPublic?: boolean;
  isRanked?: boolean;
  spectatorsAllowed?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  wagerAmount?: number;
  wagerCurrency?: string;
  escrowAddress?: string;
  gameConfig?: GameConfig;
}

// ── Room Join Request ────────────────────────────────────────────────
export interface JoinRoomRequest {
  role?: ParticipantRole;
  agentId?: string;
  eloAtJoin?: number;
}

// ── Room Filters for Browsing ────────────────────────────────────────
export interface RoomFilters {
  gameType?: string;
  status?: RoomStatus;
  isRanked?: boolean;
  hasWager?: boolean;
  minWager?: number;
  maxWager?: number;
  limit?: number;
  offset?: number;
}

// ── Matchmaking Queue Entry ──────────────────────────────────────────
export interface MatchmakingEntry {
  userId: string;
  agentId?: string | null;
  gameType: string;
  eloRating?: number;
  isRanked?: boolean;
  wagerAmount?: number | null;
  wagerCurrency?: string | null;
  enqueuedAt?: number;
  elo?: number;
}

// ── Matchmaking Result ───────────────────────────────────────────────
export interface MatchmakingResult {
  matched: boolean;
  roomId?: string;
  opponents?: string[];
}

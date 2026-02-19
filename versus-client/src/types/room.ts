export type RoomStatus = 'waiting' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
export type ParticipantRole = 'player' | 'spectator';
export type ReadyStatus = 'not_ready' | 'ready';

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
  wagerAmount: number | null;
  wagerCurrency: string | null;
  escrowAddress: string | null;
  gameId: string | null;
  gameConfig: Record<string, unknown> | null;
  marketId: string | null;
  tournamentMatchId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RoomParticipant {
  roomId: string;
  userId: string;
  agentId: string | null;
  role: ParticipantRole;
  readyStatus: ReadyStatus;
  eloAtJoin: number | null;
  joinedAt: number;
}

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
  gameConfig?: Record<string, unknown>;
}

export interface JoinRoomRequest {
  role?: ParticipantRole;
  agentId?: string;
  eloAtJoin?: number;
}

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

export interface MatchmakingRequest {
  gameType: string;
  isRanked?: boolean;
  wagerAmount?: number | null;
  wagerCurrency?: string | null;
}

export interface MatchmakingResult {
  matched: boolean;
  roomId?: string;
  opponents?: string[];
}

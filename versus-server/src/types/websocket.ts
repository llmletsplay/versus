import type { JWTPayload } from './auth.js';

// ── WebSocket Event Types ────────────────────────────────────────────
export type WSEventType =
  // Room events
  | 'room:join'
  | 'room:leave'
  | 'room:ready'
  | 'room:unready'
  | 'room:start'
  | 'room:update'
  | 'room:closed'
  | 'room:player_joined'
  | 'room:player_left'
  | 'room:player_ready'
  | 'room:player_unready'
  | 'room:cancelled'
  | 'room:game_started'
  | 'room:completed'
  // Game events
  | 'game:move'
  | 'game:state'
  | 'game:over'
  | 'game:error'
  // Chat events
  | 'chat:message'
  // Spectator events
  | 'spectator:join'
  | 'spectator:leave'
  | 'spectator:count'
  // Market events
  | 'market:update'
  | 'market:bet'
  | 'market:resolved'
  // Tournament events
  | 'tournament:update'
  | 'tournament:match_start'
  | 'tournament:match_end'
  | 'tournament:round_advance'
  // System events
  | 'system:ping'
  | 'system:pong'
  | 'system:error'
  | 'system:connected';

// ── WebSocket Message Envelope ───────────────────────────────────────
export interface WSMessage<T = any> {
  event: WSEventType;
  data: T;
  roomId?: string;
  timestamp: number;
}

// ── Client → Server Messages ─────────────────────────────────────────
export interface WSClientMessage {
  event: WSEventType;
  data: Record<string, any>;
  roomId?: string;
}

// ── Authenticated WebSocket Connection ───────────────────────────────
export interface WSClient {
  id: string;
  user: JWTPayload;
  /** Rooms this client is subscribed to */
  rooms: Set<string>;
  /** Whether this client is an AI agent */
  isAgent: boolean;
  agentId: string | null;
  connectedAt: number;
  lastPingAt: number;
}

// ── Room Chat Message ────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  isAgent: boolean;
  timestamp: number;
}

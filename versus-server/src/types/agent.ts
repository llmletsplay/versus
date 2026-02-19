// ── Agent Provider Types ─────────────────────────────────────────────
export type AgentProvider = 'openclaw' | 'mcp' | 'api';

// ── Agent Registry Entry ─────────────────────────────────────────────
export interface Agent {
  id: string;
  displayName: string;
  /** The Versus user ID that owns/operates this agent */
  ownerUserId: string;
  provider: AgentProvider;
  /** Provider-specific agent identifier (e.g., OpenClaw agentId) */
  providerAgentId: string | null;
  /** Game types this agent can play */
  gamesSupported: string[];
  /** ELO ratings keyed by game type */
  eloRatings: Record<string, number>;
  isActive: boolean;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── Agent Registration Request ───────────────────────────────────────
export interface RegisterAgentRequest {
  displayName: string;
  provider: AgentProvider;
  providerAgentId?: string;
  gamesSupported: string[];
}

// ── Agent Session (active connection) ────────────────────────────────
export interface AgentSession {
  agentId: string;
  roomId: string;
  /** OpenClaw session key for maintaining conversation context */
  sessionKey: string | null;
  connectedAt: number;
  lastActivityAt: number;
}

// ── OpenClaw Bridge Message Types ────────────────────────────────────
export interface OpenClawInboundMessage {
  type: 'move' | 'join' | 'leave' | 'chat' | 'status';
  agentId: string;
  sessionKey: string;
  payload: Record<string, any>;
}

export interface OpenClawOutboundMessage {
  type: 'game_state' | 'move_result' | 'game_over' | 'error' | 'room_update';
  roomId: string;
  gameId: string | null;
  payload: Record<string, any>;
}

// ── OpenClaw Gateway Config ──────────────────────────────────────────
export interface OpenClawConfig {
  enabled: boolean;
  gatewayUrl: string;
  hookToken: string;
  /** Path prefix for webhook endpoints */
  hookPath: string;
}

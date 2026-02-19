export type AgentProvider = 'openclaw' | 'mcp' | 'api';

export interface Agent {
  id: string;
  displayName: string;
  ownerUserId: string;
  provider: AgentProvider;
  providerAgentId: string | null;
  gamesSupported: string[];
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

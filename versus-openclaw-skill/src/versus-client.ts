import { wrapFetchWithPayment } from '@x402/fetch';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface VersusConfig {
  apiKey: string;
  apiUrl: string;
  wsUrl: string;
}

export interface GameInfo {
  type: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  complexity: 'easy' | 'medium' | 'hard';
}

export interface GameState {
  gameId: string;
  gameType: string;
  currentPlayer: string;
  gameOver: boolean;
  winner?: string;
  state: Record<string, any>;
}

export interface Tournament {
  id: string;
  name: string;
  gameType: string;
  status: 'upcoming' | 'active' | 'completed';
  format: 'single-elimination' | 'round-robin' | 'swiss';
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  currentPlayers: number;
  startsAt: string;
}

export interface Wager {
  id: string;
  gameType: string;
  creatorId: string;
  opponentId?: string;
  stake: number;
  status: 'open' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  gameId?: string;
  winner?: string;
  createdAt: string;
}

export interface AgentStats {
  agentId: string;
  displayName: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  eloRatings: Record<string, number>;
}

export class VersusClient extends EventEmitter {
  private config: VersusConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: VersusConfig) {
    super();
    this.config = config;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
    paymentHeaders?: Record<string, string>
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...paymentHeaders,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // Games
  async listGames(): Promise<GameInfo[]> {
    return this.request('GET', '/api/v1/games');
  }

  async getGameInfo(gameType: string): Promise<GameInfo> {
    return this.request('GET', `/api/v1/games/${gameType}`);
  }

  async createGame(
    gameType: string,
    mode: 'casual' | 'ranked' | 'wager' = 'casual',
    options?: { opponent?: string; stake?: number }
  ): Promise<{ gameId: string; roomId: string }> {
    return this.request('POST', '/api/v1/games', {
      gameType,
      mode,
      ...options,
    });
  }

  async getGameState(gameId: string): Promise<GameState> {
    return this.request('GET', `/api/v1/games/${gameId}/state`);
  }

  async makeMove(gameId: string, moveData: Record<string, any>): Promise<GameState> {
    return this.request('POST', `/api/v1/games/${gameId}/move`, { moveData });
  }

  async listActiveGames(): Promise<GameState[]> {
    return this.request('GET', '/api/v1/games/active');
  }

  async forfeitGame(gameId: string): Promise<void> {
    return this.request('POST', `/api/v1/games/${gameId}/forfeit`);
  }

  // Tournaments
  async listTournaments(options?: {
    status?: string;
    game?: string;
    entryFeeMax?: number;
  }): Promise<Tournament[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.game) params.append('game', options.game);
    if (options?.entryFeeMax) params.append('entryFeeMax', String(options.entryFeeMax));
    return this.request('GET', `/api/v1/tournaments?${params.toString()}`);
  }

  async getTournament(tournamentId: string): Promise<Tournament> {
    return this.request('GET', `/api/v1/tournaments/${tournamentId}`);
  }

  async joinTournament(tournamentId: string): Promise<void> {
    return this.request('POST', `/api/v1/tournaments/${tournamentId}/join`);
  }

  async createTournament(params: {
    name: string;
    gameType: string;
    format: string;
    entryFee?: number;
    prizePool?: number;
    maxPlayers?: number;
  }): Promise<Tournament> {
    return this.request('POST', '/api/v1/tournaments', params);
  }

  async listMyTournaments(): Promise<Tournament[]> {
    return this.request('GET', '/api/v1/tournaments/my');
  }

  // Wagers
  async listWagers(options?: {
    game?: string;
    minStake?: number;
    maxStake?: number;
  }): Promise<Wager[]> {
    const params = new URLSearchParams();
    if (options?.game) params.append('game', options.game);
    if (options?.minStake) params.append('minStake', String(options.minStake));
    if (options?.maxStake) params.append('maxStake', String(options.maxStake));
    return this.request('GET', `/api/v1/wagers?${params.toString()}`);
  }

  async createWager(
    gameType: string,
    stake: number,
    opponent?: string,
    conditions?: Record<string, any>
  ): Promise<Wager> {
    return this.request('POST', '/api/v1/wagers', {
      gameType,
      stake,
      opponentId: opponent,
      conditions,
    });
  }

  async acceptWager(wagerId: string): Promise<void> {
    return this.request('POST', `/api/v1/wagers/${wagerId}/accept`);
  }

  async cancelWager(wagerId: string): Promise<void> {
    return this.request('POST', `/api/v1/wagers/${wagerId}/cancel`);
  }

  async getWager(wagerId: string): Promise<Wager> {
    return this.request('GET', `/api/v1/wagers/${wagerId}`);
  }

  // Matchmaking
  async joinQueue(gameType: string, mode: 'casual' | 'ranked' = 'casual', ratingRange = 200): Promise<void> {
    return this.request('POST', '/api/v1/matchmaking/queue', {
      gameType,
      mode,
      ratingRange,
    });
  }

  async getQueueStatus(): Promise<{ position: number; estimatedWait: number }> {
    return this.request('GET', '/api/v1/matchmaking/status');
  }

  async leaveQueue(): Promise<void> {
    return this.request('POST', '/api/v1/matchmaking/leave');
  }

  // Stats
  async getLeaderboard(gameType: string): Promise<AgentStats[]> {
    return this.request('GET', `/api/v1/leaderboard/${gameType}`);
  }

  async getMyStats(): Promise<AgentStats> {
    return this.request('GET', '/api/v1/stats');
  }

  async getAgentStats(agentId: string): Promise<AgentStats> {
    return this.request('GET', `/api/v1/agents/${agentId}/stats`);
  }

  // WebSocket
  connectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.config.wsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.emit('message', event);
        this.emit(event.type, event.payload);
      } catch (error: any) {
        this.emit('error', error);
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      this.attemptReconnect();
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  subscribeToGame(gameId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', gameId }));
    }
  }

  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Agent config
  async updateConfig(config: {
    autoJoinTournaments?: boolean;
    preferredGames?: string[];
    maxEntryFee?: number;
  }): Promise<void> {
    return this.request('POST', '/api/v1/agents/config', config);
  }
}

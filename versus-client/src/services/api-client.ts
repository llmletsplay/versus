/* eslint-disable @typescript-eslint/no-explicit-any, prettier/prettier */
import type { AuthResponse, RegisterRequest, LoginRequest, User } from '../types/auth'
import type { Room, CreateRoomRequest, JoinRoomRequest, RoomFilters, MatchmakingResult, RoomParticipant } from '../types/room'
import type { Tournament, CreateTournamentRequest, TournamentStanding, TournamentMatch } from '../types/tournament'
import type { PredictionMarket, PlaceBetRequest, MarketOdds, MarketPosition } from '../types/market'
import type { Agent } from '../types/agent'
import type { EscrowTransaction } from '../types/escrow'
import type { PlayerRating, LeaderboardEntry } from '../types/rating'

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:6789'
const API_V1_URL = `${API_BASE_URL}/api/v1`

// Types
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  code?: string
  details?: Record<string, unknown>
}

export interface GameMetadata {
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  estimatedDuration: string
  complexity: string
  categories: string[]
}

export interface GameState {
  gameId: string
  gameType: string
  gameOver: boolean
  winner: string | null
  currentPlayer: string
  [key: string]: unknown
}

export interface GameStats {
  totalGamesPlayed: number
  totalGamesActive: number
  totalMoves: number
  gamesByType: Record<string, number>
  activeGamesByType: Record<string, number>
  averageGameDuration: number
  popularGameTypes: Array<{ gameType: string; count: number; percentage: number }>
  playerStats: {
    totalUniquePlayers: number
    averagePlayersPerGame: number
  }
  timeStats: {
    gamesPlayedToday: number
    gamesPlayedThisWeek: number
    gamesPlayedThisMonth: number
  }
  recentActivity: Array<{
    gameId: string
    gameType: string
    action: string
    timestamp: number
    players?: string[]
  }>
}

export interface HealthStatus {
  status: string
  timestamp: string
  uptime: number
  gameTypes: number
  environment: string
}

// Error classes
export class ApiError extends Error {
  public readonly code: string
  public readonly details?: Record<string, unknown>
  public readonly status: number

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    status: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NetworkError extends ApiError {
  constructor(message: string = 'Network error occurred') {
    super(message, 'NETWORK_ERROR', 0)
    this.name = 'NetworkError'
  }
}

export class TimeoutError extends ApiError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT_ERROR', 408)
    this.name = 'TimeoutError'
  }
}

// API Client class
export class ApiClient {
  private static instance: ApiClient
  private baseUrl: string

  private constructor() {
    this.baseUrl = API_V1_URL
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient()
    }
    return ApiClient.instance
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    // Auto-attach auth token
    const token = localStorage.getItem('auth_token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (!response.ok) {
        let errorData: { error?: string; code?: string; details?: Record<string, unknown> }
        try {
          errorData = await response.json()
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
        }

        return {
          error: errorData.error || `HTTP ${response.status}`,
          code: errorData.code || 'HTTP_ERROR',
          details: errorData.details,
        }
      }

      const json = await response.json()
      // Server wraps responses as { success, data, error }.
      // Unwrap so callers get the inner payload directly.
      if (json && typeof json === 'object' && 'data' in json) {
        return { data: json.data as T }
      }
      return { data: json as T }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'NETWORK_ERROR',
      }
    }
  }

  // Game API methods
  public async getGames(): Promise<ApiResponse<string[]>> {
    return this.request<string[]>('/games')
  }

  public async getGameMetadata(
    gameType?: string
  ): Promise<ApiResponse<Record<string, GameMetadata> | GameMetadata>> {
    const endpoint = gameType ? `/games/${gameType}/metadata` : '/games/metadata'
    return this.request(endpoint)
  }

  public async getGameRules(
    gameType: string
  ): Promise<ApiResponse<{ gameType: string; rules: string }>> {
    return this.request(`/games/${gameType}/rules`)
  }

  public async createGame(
    gameType: string,
    config: Record<string, unknown> = {}
  ): Promise<ApiResponse<{ gameId: string }>> {
    return this.request(`/games/${gameType}/new`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    })
  }

  public async makeMove(
    gameType: string,
    gameId: string,
    moveData: Record<string, unknown>
  ): Promise<ApiResponse<GameState>> {
    return this.request(`/games/${gameType}/${gameId}/move`, {
      method: 'POST',
      body: JSON.stringify(moveData),
    })
  }

  public async getGameState(gameType: string, gameId: string): Promise<ApiResponse<GameState>> {
    return this.request(`/games/${gameType}/${gameId}/state`)
  }

  public async getGameHistory(gameType: string, gameId: string): Promise<ApiResponse<any[]>> {
    return this.request(`/games/${gameType}/${gameId}/history`)
  }

  public async validateMove(
    gameType: string,
    gameId: string,
    moveData: Record<string, any>
  ): Promise<ApiResponse<{ valid: boolean; error?: string }>> {
    return this.request(`/games/${gameType}/${gameId}/validate`, {
      method: 'POST',
      body: JSON.stringify(moveData),
    })
  }

  public async deleteGame(gameId: string): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/games/${gameId}`, {
      method: 'DELETE',
    })
  }

  // Stats API methods
  public async getStats(): Promise<ApiResponse<unknown>> {
    return this.request('/stats')
  }

  public async getGameTypeStats(gameType: string): Promise<ApiResponse<any>> {
    return this.request(`/stats/${gameType}`)
  }

  // Health API methods
  public async getHealth(): Promise<ApiResponse<unknown>> {
    return this.request('/health')
  }

  // Auth API methods
  public async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async getMe(): Promise<ApiResponse<User>> {
    return this.request('/auth/me')
  }

  public async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    return this.request('/auth/refresh', { method: 'POST' })
  }

  // Room API methods
  public async listRooms(filters?: RoomFilters): Promise<ApiResponse<Room[]>> {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value))
      })
    }
    const qs = params.toString()
    return this.request(`/rooms${qs ? `?${qs}` : ''}`)
  }

  public async createRoom(data: CreateRoomRequest): Promise<ApiResponse<Room>> {
    return this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async getRoom(roomId: string): Promise<ApiResponse<Room & { participants: RoomParticipant[] }>> {
    return this.request(`/rooms/${roomId}`)
  }

  public async joinRoom(roomId: string, data?: JoinRoomRequest): Promise<ApiResponse<Room>> {
    return this.request(`/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  }

  public async leaveRoom(roomId: string): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/rooms/${roomId}/leave`, { method: 'POST' })
  }

  public async readyUp(roomId: string): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/rooms/${roomId}/ready`, { method: 'POST' })
  }

  public async unready(roomId: string): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/rooms/${roomId}/unready`, { method: 'POST' })
  }

  public async queueMatchmaking(data: { gameType: string; isRanked?: boolean }): Promise<ApiResponse<MatchmakingResult>> {
    return this.request('/rooms/matchmaking', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async dequeueMatchmaking(): Promise<ApiResponse<{ status: string }>> {
    return this.request('/rooms/matchmaking', { method: 'DELETE' })
  }

  // Tournament API methods
  public async listTournaments(status?: string): Promise<ApiResponse<Tournament[]>> {
    const qs = status ? `?status=${status}` : ''
    return this.request(`/tournaments${qs}`)
  }

  public async createTournament(data: CreateTournamentRequest): Promise<ApiResponse<Tournament>> {
    return this.request('/tournaments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async getTournament(id: string): Promise<ApiResponse<Tournament>> {
    return this.request(`/tournaments/${id}`)
  }

  public async registerForTournament(id: string, agentId?: string): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/tournaments/${id}/register`, {
      method: 'POST',
      body: JSON.stringify(agentId ? { agentId } : {}),
    })
  }

  public async startTournament(id: string): Promise<ApiResponse<Tournament>> {
    return this.request(`/tournaments/${id}/start`, { method: 'POST' })
  }

  public async getTournamentStandings(id: string): Promise<ApiResponse<TournamentStanding[]>> {
    return this.request(`/tournaments/${id}/standings`)
  }

  public async getTournamentRoundMatches(id: string, round: number): Promise<ApiResponse<TournamentMatch[]>> {
    return this.request(`/tournaments/${id}/rounds/${round}`)
  }

  // Market API methods
  public async listMarkets(): Promise<ApiResponse<PredictionMarket[]>> {
    return this.request('/markets')
  }

  public async createMarket(data: Omit<PlaceBetRequest, 'marketId'> & { marketType: string; question: string; outcomes: string[]; closesAt: number; token?: string; roomId?: string; tournamentId?: string }): Promise<ApiResponse<PredictionMarket>> {
    return this.request('/markets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async getMarket(id: string): Promise<ApiResponse<PredictionMarket>> {
    return this.request(`/markets/${id}`)
  }

  public async getMarketOdds(id: string): Promise<ApiResponse<MarketOdds>> {
    return this.request(`/markets/${id}/odds`)
  }

  public async placeBet(id: string, data: Omit<PlaceBetRequest, 'marketId'>): Promise<ApiResponse<MarketPosition>> {
    return this.request(`/markets/${id}/bet`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  public async getMarketPositions(id: string): Promise<ApiResponse<MarketPosition[]>> {
    return this.request(`/markets/${id}/positions`)
  }

  public async getMarketsByRoom(roomId: string): Promise<ApiResponse<PredictionMarket[]>> {
    return this.request(`/markets/room/${roomId}`)
  }

  // Agent API methods
  public async listAgents(): Promise<ApiResponse<Agent[]>> {
    return this.request('/agents')
  }

  public async getAgent(id: string): Promise<ApiResponse<Agent>> {
    return this.request(`/agents/${id}`)
  }

  public async getAgentStats(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request(`/agents/${id}/stats`)
  }

  // Escrow API methods
  public async listEscrows(): Promise<ApiResponse<EscrowTransaction[]>> {
    return this.request('/escrow')
  }

  public async getEscrow(id: string): Promise<ApiResponse<EscrowTransaction>> {
    return this.request(`/escrow/${id}`)
  }

  public async getEscrowByRoom(roomId: string): Promise<ApiResponse<EscrowTransaction>> {
    return this.request(`/escrow/room/${roomId}`)
  }

  // Rating API methods
  public async getLeaderboard(gameType: string, limit?: number): Promise<ApiResponse<LeaderboardEntry[]>> {
    const params = new URLSearchParams({ gameType })
    if (limit) params.set('limit', String(limit))
    return this.request(`/ratings/leaderboard?${params}`)
  }

  public async getUserRating(userId: string): Promise<ApiResponse<PlayerRating[]>> {
    return this.request(`/ratings/user/${userId}`)
  }

  public async getUserGameRating(userId: string, gameType: string): Promise<ApiResponse<PlayerRating>> {
    return this.request(`/ratings/user/${userId}/${gameType}`)
  }

  // Utility methods
  public async testEndpoint(
    endpoint: string,
    method: string = 'GET',
    body?: string
  ): Promise<ApiResponse<unknown>> {
    const options: RequestInit = { method }
    if (body && method !== 'GET') {
      options.body = body
    }
    return this.request(endpoint, options)
  }
}

// Export singleton instance
export const apiClient = ApiClient.getInstance()

// Convenience functions
export const gameApi = {
  getGames: () => apiClient.getGames(),
  getMetadata: (gameType?: string) => apiClient.getGameMetadata(gameType),
  getRules: (gameType: string) => apiClient.getGameRules(gameType),
  create: (gameType: string, config?: Record<string, unknown>) =>
    apiClient.createGame(gameType, config),
  makeMove: (gameType: string, gameId: string, moveData: Record<string, unknown>) =>
    apiClient.makeMove(gameType, gameId, moveData),
  getState: (gameType: string, gameId: string) => apiClient.getGameState(gameType, gameId),
  getHistory: (gameType: string, gameId: string) => apiClient.getGameHistory(gameType, gameId),
  validate: (gameType: string, gameId: string, moveData: Record<string, any>) =>
    apiClient.validateMove(gameType, gameId, moveData),
  delete: (gameId: string) => apiClient.deleteGame(gameId),
}

export const statsApi = {
  getGlobal: () => apiClient.getStats(),
  getByType: (gameType: string) => apiClient.getGameTypeStats(gameType),
}

export const healthApi = {
  check: () => apiClient.getHealth(),
}

export const authApi = {
  register: (data: RegisterRequest) => apiClient.register(data),
  login: (data: LoginRequest) => apiClient.login(data),
  me: () => apiClient.getMe(),
  refresh: () => apiClient.refreshToken(),
}

export const roomApi = {
  list: (filters?: RoomFilters) => apiClient.listRooms(filters),
  create: (data: CreateRoomRequest) => apiClient.createRoom(data),
  get: (roomId: string) => apiClient.getRoom(roomId),
  join: (roomId: string, data?: JoinRoomRequest) => apiClient.joinRoom(roomId, data),
  leave: (roomId: string) => apiClient.leaveRoom(roomId),
  ready: (roomId: string) => apiClient.readyUp(roomId),
  unready: (roomId: string) => apiClient.unready(roomId),
}

export const matchmakingApi = {
  queue: (data: { gameType: string; isRanked?: boolean }) => apiClient.queueMatchmaking(data),
  dequeue: () => apiClient.dequeueMatchmaking(),
}

export const tournamentApi = {
  list: (status?: string) => apiClient.listTournaments(status),
  create: (data: CreateTournamentRequest) => apiClient.createTournament(data),
  get: (id: string) => apiClient.getTournament(id),
  register: (id: string, agentId?: string) => apiClient.registerForTournament(id, agentId),
  start: (id: string) => apiClient.startTournament(id),
  standings: (id: string) => apiClient.getTournamentStandings(id),
  roundMatches: (id: string, round: number) => apiClient.getTournamentRoundMatches(id, round),
}

export const marketApi = {
  list: () => apiClient.listMarkets(),
  get: (id: string) => apiClient.getMarket(id),
  odds: (id: string) => apiClient.getMarketOdds(id),
  bet: (id: string, data: Omit<PlaceBetRequest, 'marketId'>) => apiClient.placeBet(id, data),
  positions: (id: string) => apiClient.getMarketPositions(id),
  byRoom: (roomId: string) => apiClient.getMarketsByRoom(roomId),
}

export const agentApi = {
  list: () => apiClient.listAgents(),
  get: (id: string) => apiClient.getAgent(id),
  stats: (id: string) => apiClient.getAgentStats(id),
}

export const escrowApi = {
  list: () => apiClient.listEscrows(),
  get: (id: string) => apiClient.getEscrow(id),
  byRoom: (roomId: string) => apiClient.getEscrowByRoom(roomId),
}

export const ratingApi = {
  leaderboard: (gameType: string, limit?: number) => apiClient.getLeaderboard(gameType, limit),
  userRating: (userId: string) => apiClient.getUserRating(userId),
  userGameRating: (userId: string, gameType: string) => apiClient.getUserGameRating(userId, gameType),
}

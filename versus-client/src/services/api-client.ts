/* eslint-disable @typescript-eslint/no-explicit-any, prettier/prettier */
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

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
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

      const data = await response.json()
      return { data }
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

/**
 * API endpoints configuration
 * Centralizes all API URLs for easier management
 */

export const API_ENDPOINTS = {
  PAYMENTS: {
    CREATE_CHARGE: '/api/v1/payments/x402/charges',
    CHARGE: (chargeId: string) => `/api/v1/payments/x402/charges/${chargeId}`,
    REFRESH: (chargeId: string) => `/api/v1/payments/x402/charges/${chargeId}/refresh`,
    WEBHOOK: '/api/v1/payments/x402/webhook',
    PAYMENT_REQUIRED: '/api/v1/payments/x402/402',
  },

  GAMES: {
    LIST: '/api/v1/games',
    METADATA: (gameType?: string) =>
      gameType ? `/api/v1/games/${gameType}/metadata` : '/api/v1/games/metadata',
    RULES: (gameType: string) => `/api/v1/games/${gameType}/rules`,
    CREATE: (gameType: string) => `/api/v1/games/${gameType}/new`,
    STATE: (gameType: string, gameId: string) => `/api/v1/games/${gameType}/${gameId}/state`,
    MOVE: (gameType: string, gameId: string) => `/api/v1/games/${gameType}/${gameId}/move`,
    HISTORY: (gameType: string, gameId: string) => `/api/v1/games/${gameType}/${gameId}/history`,
    VALIDATE: (gameType: string, gameId: string) => `/api/v1/games/${gameType}/${gameId}/validate`,
    RESTORE: (gameType: string, gameId: string) => `/api/v1/games/${gameType}/${gameId}/restore`,
  },

  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
    PROFILE: '/api/v1/auth/profile',
  },

  HEALTH: '/api/v1/health',
} as const;

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:5556',
  DEFAULT_TIMEOUT: 30000,
} as const;

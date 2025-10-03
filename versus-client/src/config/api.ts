/**
 * API endpoints configuration
 * Centralizes all API URLs for easier management
 */

export const API_ENDPOINTS = {
  // Subscription endpoints
  SUBSCRIPTIONS: {
    CURRENT: "/api/v1/subscriptions/current",
    TIERS: "/api/v1/subscriptions/tiers",
    BILLING_HISTORY: "/api/v1/subscriptions/billing-history",
    UPGRADE: "/api/v1/subscriptions/upgrade",
    CANCEL: "/api/v1/subscriptions/cancel",
    RESUME: "/api/v1/subscriptions/resume",
    CHECKOUT: "/api/v1/subscriptions/checkout",
    USAGE: "/api/v1/subscriptions/usage",
  },

  // Game endpoints
  GAMES: {
    LIST: "/api/v1/games",
    CREATE: "/api/v1/games",
    JOIN: "/api/v1/games/join",
    LEAVE: "/api/v1/games/leave",
    MOVE: "/api/v1/games/move",
    STATE: "/api/v1/games/:id",
  },

  // Analytics endpoints
  ANALYTICS: {
    EVENTS: "/api/v1/analytics/events",
    STATS: "/api/v1/analytics/stats",
    USER_METRICS: "/api/v1/analytics/user/:userId",
  },

  // Auth endpoints
  AUTH: {
    LOGIN: "/api/v1/auth/login",
    LOGOUT: "/api/v1/auth/logout",
    REGISTER: "/api/v1/auth/register",
    REFRESH: "/api/v1/auth/refresh",
    PROFILE: "/api/v1/auth/profile",
  },

  // Utility endpoints
  HEALTH: "/api/v1/health",
  VERSION: "/api/v1/version",
} as const;

/**
 * Helper function to build API URLs with path parameters
 */
export function buildUrl(
  template: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce(
    (url, [key, value]) => url.replace(`:${key}`, String(value)),
    template,
  );
}

/**
 * Default API configuration
 */
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || "",
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_RETRY_ATTEMPTS: 3,
} as const;

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5556'
export const API_V1_URL = `${API_BASE_URL}/api/v1`
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '10000')
export const API_RETRY_ATTEMPTS = parseInt(import.meta.env.VITE_API_RETRY_ATTEMPTS || '3')
export const API_RETRY_DELAY = parseInt(import.meta.env.VITE_API_RETRY_DELAY || '1000')
export const POLLING_INTERVAL = parseInt(import.meta.env.VITE_POLLING_INTERVAL || '2000')
export const ENABLE_DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true'
export const MAX_GAME_HISTORY = parseInt(import.meta.env.VITE_MAX_GAME_HISTORY || '100')

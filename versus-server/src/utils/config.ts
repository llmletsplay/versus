import { logger } from './logger.js';
import type { X402PaymentConfig } from '../services/x402-payment-service.js';

export interface ServerConfig {
  // Server settings
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  gameDataPath: string;

  // Database settings
  databaseUrl?: string;
  sqlitePath?: string;

  // Memory management settings
  maxActiveGames: number;
  gameInactivityTimeout: number;
  cleanupInterval: number;
  memoryCheckInterval: number;
  maxMemoryUsage: number;

  // Logging settings
  logLevel: string;

  // Game settings
  defaultPlayerTimeout: number;
  maxGameDuration: number;
  autoSaveInterval: number;

  // Security settings
  enableCors: boolean;
  enableHelmet: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // x402 payment settings
  x402Enabled: boolean;
  x402ApiKey?: string;
  x402WebhookSecret?: string;
  x402BaseUrl?: string;
  x402DefaultAmountUsd?: number;
  x402DefaultCurrency?: string;
  x402CallbackUrl?: string;
  x402SettlementAddress?: string;

  // JWT settings
  jwtSecret: string;
  jwtExpiration: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ServerConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): ServerConfig {
    return {
      // Server settings
      port: parseInt(process.env.PORT || '4444'),
      nodeEnv: process.env.NODE_ENV || 'development',
      corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      gameDataPath: process.env.GAME_DATA_PATH || './game_data',

      // Database settings
      databaseUrl: process.env.DATABASE_URL,
      sqlitePath: process.env.SQLITE_PATH || './game_data/stats.db',

      // Memory management settings
      maxActiveGames: parseInt(process.env.MAX_ACTIVE_GAMES || '1000'),
      gameInactivityTimeout: parseInt(process.env.GAME_INACTIVITY_TIMEOUT || '1800000'), // 30 minutes
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000'), // 5 minutes
      memoryCheckInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL || '60000'), // 1 minute
      maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE || '536870912'), // 512MB

      // Logging settings
      logLevel:
        process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO'),

      // Game settings
      defaultPlayerTimeout: parseInt(process.env.DEFAULT_PLAYER_TIMEOUT || '300000'), // 5 minutes
      maxGameDuration: parseInt(process.env.MAX_GAME_DURATION || '7200000'), // 2 hours
      autoSaveInterval: parseInt(process.env.AUTO_SAVE_INTERVAL || '30000'), // 30 seconds

      // Security settings
      enableCors: process.env.ENABLE_CORS !== 'false',
      enableHelmet: process.env.ENABLE_HELMET !== 'false',
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

      // x402 payment settings
      x402Enabled:
        process.env.X402_ENABLED === 'true' ||
        (!!process.env.X402_API_KEY && process.env.X402_ENABLED !== 'false'),
      x402ApiKey: process.env.X402_API_KEY,
      x402WebhookSecret: process.env.X402_WEBHOOK_SECRET,
      x402BaseUrl: process.env.X402_BASE_URL,
      x402DefaultAmountUsd: process.env.X402_DEFAULT_AMOUNT_USD
        ? Number(process.env.X402_DEFAULT_AMOUNT_USD)
        : undefined,
      x402DefaultCurrency: process.env.X402_DEFAULT_CURRENCY,
      x402CallbackUrl: process.env.X402_CALLBACK_URL,
      x402SettlementAddress: process.env.X402_SETTLEMENT_ADDRESS,

      // JWT settings — no default; must be set via environment variable
      jwtSecret: process.env.JWT_SECRET || '',
      jwtExpiration: process.env.JWT_EXPIRATION || '7d',
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate port
    if (this.config.port < 1 || this.config.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }

    // Validate memory settings
    if (this.config.maxActiveGames < 1) {
      errors.push('maxActiveGames must be greater than 0');
    }

    if (this.config.gameInactivityTimeout < 60000) {
      errors.push('gameInactivityTimeout must be at least 60 seconds');
    }

    if (this.config.maxMemoryUsage < 50 * 1024 * 1024) {
      errors.push('maxMemoryUsage must be at least 50MB');
    }

    // Validate timeouts
    if (this.config.defaultPlayerTimeout < 1000) {
      errors.push('defaultPlayerTimeout must be at least 1 second');
    }

    if (this.config.maxGameDuration < 60000) {
      errors.push('maxGameDuration must be at least 1 minute');
    }

    // Validate rate limiting
    if (this.config.rateLimitMaxRequests < 1) {
      errors.push('rateLimitMaxRequests must be greater than 0');
    }

    // Validate JWT — always require a secret
    if (!this.config.jwtSecret) {
      errors.push('JWT_SECRET environment variable is required');
    } else if (this.config.jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    if (this.config.x402Enabled && !this.config.x402ApiKey) {
      errors.push('X402_API_KEY must be set when x402 payments are enabled');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    logger.info('Configuration loaded and validated', {
      nodeEnv: this.config.nodeEnv,
      port: this.config.port,
      maxActiveGames: this.config.maxActiveGames,
      logLevel: this.config.logLevel,
    });
  }

  public getConfig(): ServerConfig {
    return { ...this.config };
  }

  public get<K extends keyof ServerConfig>(key: K): ServerConfig[K] {
    return this.config[key];
  }

  public isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  public isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }

  // Helper methods for common configurations
  public getDatabaseConfig(): {
    type: 'sqlite' | 'postgresql';
    connectionString?: string;
    sqlitePath?: string;
  } {
    if (this.config.databaseUrl) {
      return {
        type: 'postgresql',
        connectionString: this.config.databaseUrl,
      };
    }
    return {
      type: 'sqlite',
      sqlitePath: this.config.sqlitePath,
    };
  }

  public getMemoryManagerConfig() {
    return {
      maxActiveGames: this.config.maxActiveGames,
      gameInactivityTimeout: this.config.gameInactivityTimeout,
      cleanupInterval: this.config.cleanupInterval,
      memoryCheckInterval: this.config.memoryCheckInterval,
      maxMemoryUsage: this.config.maxMemoryUsage,
    };
  }

  public getCorsConfig() {
    return {
      origin: this.config.corsOrigin,
      credentials: true,
      optionsSuccessStatus: 200,
    };
  }

  // Environment-specific helpers
  public shouldLogDebug(): boolean {
    return this.config.logLevel === 'DEBUG' || this.isDevelopment();
  }

  public getLogLevel(): string {
    return this.config.logLevel;
  }

  public getX402Config(): X402PaymentConfig {
    return {
      enabled: this.config.x402Enabled,
      apiKey: this.config.x402ApiKey,
      webhookSecret: this.config.x402WebhookSecret,
      baseUrl: this.config.x402BaseUrl,
      defaultAmountUsd: this.config.x402DefaultAmountUsd,
      defaultCurrency: this.config.x402DefaultCurrency,
      callbackUrl: this.config.x402CallbackUrl,
      settlementAddress: this.config.x402SettlementAddress,
    };
  }

  // JWT configuration helper
  public getJwtConfig(): {
    secret: string;
    expiration: string;
  } {
    return {
      secret: this.config.jwtSecret,
      expiration: this.config.jwtExpiration,
    };
  }

  // Update configuration at runtime (for testing or dynamic updates)
  public updateConfig(updates: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
    logger.info('Configuration updated', { updates });
  }

  // Get configuration summary for debugging
  public getConfigSummary(): Record<string, unknown> {
    return {
      environment: this.config.nodeEnv,
      port: this.config.port,
      database: this.config.databaseUrl ? 'PostgreSQL' : 'SQLite',
      memoryManagement: {
        maxActiveGames: this.config.maxActiveGames,
        inactivityTimeout: `${this.config.gameInactivityTimeout / 1000}s`,
        maxMemory: `${Math.round(this.config.maxMemoryUsage / 1024 / 1024)}MB`,
      },
      security: {
        cors: this.config.enableCors,
        helmet: this.config.enableHelmet,
        rateLimit: `${this.config.rateLimitMaxRequests} req/${this.config.rateLimitWindowMs / 1000}s`,
        x402Enabled: this.config.x402Enabled,
      },
    };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();

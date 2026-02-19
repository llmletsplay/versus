import { createApp } from '../app.js';
import { registerGames } from '../games/index.js';
import type { DatabaseConfig } from '../core/database.js';
import { logger } from '../utils/logger.js';

// Cloudflare Workers environment variables interface
interface CloudflareEnv {
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;
  SENTRY_DSN?: string;
  APP_VERSION?: string;
  X402_ENABLED?: string;
  X402_API_KEY?: string;
  X402_WEBHOOK_SECRET?: string;
  X402_BASE_URL?: string;
  X402_DEFAULT_AMOUNT_USD?: string;
  X402_DEFAULT_CURRENCY?: string;
  X402_CALLBACK_URL?: string;
  X402_SETTLEMENT_ADDRESS?: string;
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    // Database configuration for Cloudflare Workers
    // Note: For production, you'd use Cloudflare D1 or external database
    const databaseConfig: DatabaseConfig = env.DATABASE_URL
      ? {
          type: 'postgresql',
          connectionString: env.DATABASE_URL,
        }
      : {
          type: 'sqlite',
          sqlitePath: ':memory:', // In-memory SQLite for Workers (temporary sessions)
        };

    // Create Hono app with Cloudflare configuration
    const x402Config = {
      enabled: env.X402_ENABLED === 'true' || (!!env.X402_API_KEY && env.X402_ENABLED !== 'false'),
      apiKey: env.X402_API_KEY,
      webhookSecret: env.X402_WEBHOOK_SECRET,
      baseUrl: env.X402_BASE_URL,
      defaultAmountUsd: env.X402_DEFAULT_AMOUNT_USD
        ? Number(env.X402_DEFAULT_AMOUNT_USD)
        : undefined,
      defaultCurrency: env.X402_DEFAULT_CURRENCY,
      callbackUrl: env.X402_CALLBACK_URL,
      settlementAddress: env.X402_SETTLEMENT_ADDRESS,
    };

    const result = await createApp({
      databaseConfig,
      corsOrigin: env.CORS_ORIGIN || '*',
      nodeEnv: env.NODE_ENV || 'production',
      jwtSecret: env.JWT_SECRET,
      monitoring: {
        sentryDsn: env.SENTRY_DSN,
        environment: env.NODE_ENV || 'production',
        release: env.APP_VERSION || '2.0.0',
        enableTracing: true,
        traceSampleRate: 1.0,
      },
      getX402Config: () => x402Config,
    });

    const { app, gameManager, authService } = result;

    // Register all games
    registerGames(gameManager);

    // Initialize services (for in-memory DB, this happens on each request)
    try {
      await gameManager.initialize();
      await authService.initializeUserTable();
    } catch (error) {
      logger.error(
        'Failed to initialize services:',
        error instanceof Error ? error : new Error(String(error))
      );
      return new Response('Service initialization failed', { status: 500 });
    }

    // Handle the request
    return app.fetch(request, env);
  },
};

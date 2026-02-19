import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import path from 'path';
import { createApp } from '../app.js';
import { registerGames } from '../games/index.js';
import { logger } from '../utils/logger.js';
import type { DatabaseConfig } from '../core/database.js';

// Load environment variables (prefer local .env, fallback to workspace root)
dotenv.config();

if (!process.env.JWT_SECRET) {
  const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
  dotenv.config({ path: rootEnvPath, override: false });
}

const PORT = parseInt(process.env.PORT || '5556');
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5555';

if (!process.env.DATABASE_URL) {
  logger.error('DATABASE_URL is required. Set it to your PostgreSQL connection string.');
  logger.error('Example: DATABASE_URL=postgresql://user:password@localhost:5433/versus_db');
  process.exit(1);
}

const databaseConfig: DatabaseConfig = {
  type: 'postgresql',
  connectionString: process.env.DATABASE_URL,
};

// Global service references for shutdown
let app: any,
  gameManager: any,
  authService: any,
  wsServer: any,
  monitoringService: any,
  backupService: any,
  openClawBridge: any;

// Initialize and start server
async function startServer() {
  try {
    // Create Hono app with comprehensive configuration
    const result = await createApp({
      databaseConfig,
      corsOrigin: CORS_ORIGIN,
      nodeEnv: NODE_ENV,
      jwtSecret: process.env.JWT_SECRET,
      monitoring: {
        sentryDsn: process.env.SENTRY_DSN,
        environment: NODE_ENV,
        release: process.env.APP_VERSION || '2.0.0',
        enableTracing: true,
        traceSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
      },
      backup: {
        enabled: process.env.BACKUP_ENABLED === 'true' || NODE_ENV === 'production',
        schedule: process.env.BACKUP_SCHEDULE || 'daily',
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
        backupPath: process.env.BACKUP_PATH || './backups',
        compression: true,
        includeGameStates: true,
        includeUserData: true,
        includeStats: true,
      },
      getX402Config: () => ({
        enabled:
          process.env.X402_ENABLED === 'true' ||
          (!!process.env.X402_API_KEY && process.env.X402_ENABLED !== 'false'),
        apiKey: process.env.X402_API_KEY,
        webhookSecret: process.env.X402_WEBHOOK_SECRET,
        baseUrl: process.env.X402_BASE_URL,
        defaultAmountUsd: process.env.X402_DEFAULT_AMOUNT_USD
          ? Number(process.env.X402_DEFAULT_AMOUNT_USD)
          : undefined,
        defaultCurrency: process.env.X402_DEFAULT_CURRENCY,
        callbackUrl: process.env.X402_CALLBACK_URL,
        settlementAddress: process.env.X402_SETTLEMENT_ADDRESS,
      }),
      openClaw: {
        enabled: process.env.OPENCLAW_ENABLED === 'true',
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
        hookToken: process.env.OPENCLAW_HOOK_TOKEN || '',
        hookPath: process.env.OPENCLAW_HOOK_PATH || '/hooks',
      },
    });

    app = result.app;
    gameManager = result.gameManager;
    authService = result.authService;
    wsServer = result.wsServer;
    monitoringService = result.monitoringService;
    backupService = result.backupService;
    openClawBridge = result.openClawBridge;

    // Register all games
    registerGames(gameManager);

    // Initialize services
    await gameManager.initialize();
    await authService.initializeUserTable();

    // Start backup service if configured
    if (backupService) {
      await backupService.start();
      logger.info('💾 Backup service initialized');
    }

    logger.info('🔐 Authentication service initialized');
    logger.info('🎮 Game manager initialized with database storage');
    if (monitoringService) {
      logger.info('📊 Monitoring service initialized (Sentry)');
    }

    // Start HTTP server
    const server = serve({
      fetch: app.fetch,
      port: PORT,
    });

    // Attach WebSocket server to the HTTP server
    wsServer.initialize(server);

    logger.info(`🚀 Versus Platform running on port ${PORT}`);
    logger.info(`📝 Environment: ${NODE_ENV}`);
    logger.info(`🌐 CORS origin: ${CORS_ORIGIN}`);
    logger.info(`💾 Database: ${databaseConfig.type}`);
    logger.info(`🔌 WebSocket: enabled (ws://localhost:${PORT})`);
    logger.info(`🔒 Security: Rate limiting and authentication enabled`);
    logger.info(`🌍 Platform: Node.js with multiplatform support`);

    if (process.env.OPENCLAW_ENABLED === 'true') {
      logger.info(
        `🤖 OpenClaw: bridge active → ${process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'}`
      );
    }

    logger.info('📡 API Endpoints:');
    logger.info('   /api/v1/auth          — Authentication');
    logger.info('   /api/v1/games         — Game engine (29+ games)');
    logger.info('   /api/v1/rooms         — Room management & matchmaking');
    logger.info('   /api/v1/ratings       — ELO ratings & leaderboards');
    logger.info('   /api/v1/agents        — AI agent registry & OpenClaw bridge');
    logger.info('   /api/v1/escrow        — Crypto escrow & wagering');
    logger.info('   /api/v1/markets       — Prediction markets');
    logger.info('   /api/v1/tournaments   — Tournament system');

    // Cleanup inactive games every hour
    setInterval(
      () => {
        const cleanedCount = gameManager.cleanupInactiveGames();
        if (cleanedCount > 0) {
          logger.info(`🧹 Cleaned up ${cleanedCount} inactive games`);
        }
      },
      60 * 60 * 1000
    );

    return server;
  } catch (error) {
    logger.error('Failed to initialize server', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

// Graceful shutdown with full service cleanup
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await shutdown();
});

async function shutdown() {
  try {
    // Close WebSocket server
    if (wsServer) {
      wsServer.close();
    }

    // Close OpenClaw bridge
    if (openClawBridge) {
      openClawBridge.close();
    }

    // Stop backup service
    if (backupService) {
      await backupService.stop();
    }

    // Close monitoring service
    if (monitoringService) {
      await monitoringService.close();
    }

    // Close game manager
    await gameManager.close();

    logger.info('All services shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, gameManager, authService };

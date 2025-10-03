import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import { createApp } from '../app.js';
import { registerGames } from '../games/index.js';
import { logger } from '../utils/logger.js';
import type { DatabaseConfig } from '../core/database.js';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '6789');
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const GAME_DATA_PATH = process.env.GAME_DATA_PATH || './game_data';

// Database configuration for unified storage
const databaseConfig: DatabaseConfig = process.env.DATABASE_URL
  ? {
      type: 'postgresql',
      connectionString: process.env.DATABASE_URL,
    }
  : {
      type: 'sqlite',
      sqlitePath: `${GAME_DATA_PATH}/versus.db`,
    };

// Global service references for shutdown
let app: any, gameManager: any, authService: any, monitoringService: any, backupService: any;

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
        enableProfiling: NODE_ENV === 'production',
        enableTracing: true,
        sampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
        profilesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
      },
      backup: {
        enabled: process.env.BACKUP_ENABLED === 'true' || NODE_ENV === 'production',
        schedule: process.env.BACKUP_SCHEDULE || 'daily',
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
        backupPath: process.env.BACKUP_PATH || `${GAME_DATA_PATH}/backups`,
        compression: true,
        includeGameStates: true,
        includeUserData: true,
        includeStats: true,
      },
      getStripeConfig: () => ({
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        enabled: !!process.env.STRIPE_SECRET_KEY,
      }),
    });

    app = result.app;
    gameManager = result.gameManager;
    authService = result.authService;
    monitoringService = result.monitoringService;
    backupService = result.backupService;

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

    // Start server
    const server = serve({
      fetch: app.fetch,
      port: PORT,
    });

    logger.info(`🚀 Versus Server (Hono) running on port ${PORT}`);
    logger.info(`📝 Environment: ${NODE_ENV}`);
    logger.info(`🌐 CORS origin: ${CORS_ORIGIN}`);
    logger.info(`💾 Database: ${databaseConfig.type}`);
    logger.info(`🔒 Security: Rate limiting and authentication enabled`);
    logger.info(`🌍 Platform: Node.js with multiplatform support`);

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

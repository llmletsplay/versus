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

// Create Hono app with configuration
const { app, gameManager, authService } = createApp({
  databaseConfig,
  corsOrigin: CORS_ORIGIN,
  nodeEnv: NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
});

// Register all games
registerGames(gameManager);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await gameManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await gameManager.close();
  process.exit(0);
});

// Initialize and start server
async function startServer() {
  try {
    // Initialize services
    await gameManager.initialize();
    await authService.initializeUserTable();

    logger.info('🔐 Authentication service initialized');
    logger.info('🎮 Game manager initialized with database storage');

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

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, gameManager, authService };

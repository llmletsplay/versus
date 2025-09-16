import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createGameRoutes } from './api/routes.js';
import { GameManager } from './core/game-manager.js';
import { registerGames } from './games/index.js';
import { AuthService } from './services/auth-service.js';
import authRoutes from './api/auth-routes.js';
import { apiLimiter, authLimiter } from './middleware/rate-limit.js';
import { logger } from './utils/logger.js';
import type { DatabaseConfig } from './core/database.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
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
      sqlitePath: `${GAME_DATA_PATH}/versus.db`, // Single database for everything
    };

// Initialize game manager with database-only storage
const gameManager = new GameManager(databaseConfig);
registerGames(gameManager);

// Security middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding for development
  })
);

// CORS configuration
app.use(
  cors({
    origin: NODE_ENV === 'development' ? true : CORS_ORIGIN,
    credentials: true,
  })
);

// Body parsing middleware with secure limits
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb for security
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Compression middleware
app.use(compression());

// Logging middleware with enhanced security
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        },
      },
    })
  );
}

// Trust proxy for rate limiting (needed if behind reverse proxy)
app.set('trust proxy', 1);

// Apply rate limiting
app.use('/api', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// Authentication routes
app.use('/api/v1/auth', authRoutes);

// Game API routes
app.use('/api', createGameRoutes(gameManager));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Versus Server',
    version: '1.0.0',
    description: 'TypeScript game arcade API and MCP server for AI agents',
    endpoints: {
      games: '/api/games',
      metadata: '/api/games/metadata',
      health: '/api/health',
    },
    documentation: 'https://github.com/your-repo/versus-server',
  });
});

// Error handling middleware with proper logging
app.use(
  (err: any, req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    // Log error with context
    logger.error('API Error', {
      error: err.message,
      stack: NODE_ENV === 'development' ? err.stack : undefined,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (err.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: err.message,
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    if (err.status) {
      res.status(err.status).json({
        success: false,
        error: err.message || 'An error occurred',
        code: 'API_ERROR',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: NODE_ENV === 'development' ? err.message : 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Graceful shutdown with proper logging
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

// Initialize database and start server
async function startServer() {
  try {
    // Initialize game manager
    await gameManager.initialize();
    logger.info(`💾 Database initialized: ${databaseConfig.type}`);

    // Initialize authentication service and create users table
    const authService = new AuthService();
    await authService.initializeUserTable();
    logger.info('🔐 Authentication service initialized');

    app.listen(PORT, () => {
      logger.info(`🚀 Versus Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${NODE_ENV}`);
      logger.info(`📁 Game data path: ${GAME_DATA_PATH}`);
      logger.info(`🌐 CORS origin: ${CORS_ORIGIN}`);
      logger.info(`🔒 Security: Rate limiting and authentication enabled`);
      logger.info(`📚 API documentation: http://localhost:${PORT}/api/games`);

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
    });
  } catch (error) {
    logger.error('Failed to initialize server:', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

startServer();

export { app };

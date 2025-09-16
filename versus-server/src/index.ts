import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createGameRoutes } from './api/routes.js';
import { GameManager } from './core/game-manager.js';
import { registerGames } from './games/index.js';
import type { DatabaseConfig } from './core/database.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const GAME_DATA_PATH = process.env.GAME_DATA_PATH || './game_data';

// Database configuration
const databaseConfig: DatabaseConfig = process.env.DATABASE_URL
  ? {
      type: 'postgresql',
      connectionString: process.env.DATABASE_URL,
    }
  : {
      type: 'sqlite',
      sqlitePath: `${GAME_DATA_PATH}/stats.db`,
    };

// Initialize game manager and register games
const gameManager = new GameManager(GAME_DATA_PATH, databaseConfig);
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// API routes
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

// Error handling middleware
app.use(
  (err: any, req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    console.error('Error:', err);

    if (err.name === 'ValidationError') {
      res.status(400).json({
        error: 'Validation Error',
        message: err.message,
      });
      return;
    }

    if (err.status) {
      res.status(err.status).json({
        error: err.message || 'An error occurred',
      });
      return;
    }

    res.status(500).json({
      error: NODE_ENV === 'development' ? err.message : 'Internal Server Error',
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await gameManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await gameManager.close();
  process.exit(0);
});

// Initialize database and start server
async function startServer() {
  try {
    await gameManager.initialize();
    console.log(`💾 Database initialized: ${databaseConfig.type}`);

    app.listen(PORT, () => {
      console.log(`🚀 Versus Server running on port ${PORT}`);
      console.log(`📝 Environment: ${NODE_ENV}`);
      console.log(`📁 Game data path: ${GAME_DATA_PATH}`);
      console.log(`🌐 CORS origin: ${CORS_ORIGIN}`);
      console.log(`📚 API documentation: http://localhost:${PORT}/api/games`);

      // Cleanup inactive games every hour
      setInterval(
        () => {
          gameManager.cleanupInactiveGames();
        },
        60 * 60 * 1000
      );
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

startServer();

export { app };

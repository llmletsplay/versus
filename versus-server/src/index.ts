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

// SECURITY: Comprehensive security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for development
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: NODE_ENV === 'production',
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: 'same-origin' },
    xssFilter: true,
  })
);

// SECURITY: Additional security headers
app.use((req, res, next) => {
  // Request ID for tracking
  const requestId =
    (req.headers['x-request-id'] as string) ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Security headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // SECURITY: Remove powered-by header
  res.removeHeader('X-Powered-By');

  next();
});

// CORS configuration
app.use(
  cors({
    origin: NODE_ENV === 'development' ? true : CORS_ORIGIN,
    credentials: true,
  })
);

// SECURITY: Body parsing with strict limits and validation
app.use(
  express.json({
    limit: '100kb', // SECURITY: Strict limit to prevent DoS
    type: ['application/json', 'application/csp-report'],
    verify: (req, res, buf) => {
      // SECURITY: Store raw body for signature verification if needed
      // DEBT: Type casting to 'any' bypasses TypeScript safety
      // TODO: Extend Request interface to include rawBody property
      (req as any).rawBody = buf.toString('utf8');
    },
  })
);
app.use(
  express.urlencoded({
    extended: false, // SECURITY: Use simple parser
    limit: '100kb',
    parameterLimit: 50, // SECURITY: Limit number of parameters
  })
);

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

// SECURITY: Error handling middleware with sanitization
app.use(
  (err: any, req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    // Generate request ID for tracking
    const requestId =
      req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log error with context (internal only)
    logger.error('API Error', {
      requestId,
      error: err.message,
      stack: err.stack, // Always log stack internally
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      // Log additional context in non-production
      ...(NODE_ENV !== 'production' && {
        body: req.body,
        query: req.query,
        params: req.params,
      }),
    });

    // SECURITY: Sanitize error responses
    const isProduction = NODE_ENV === 'production';

    if (err.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: isProduction ? 'Invalid input provided' : err.message,
        code: 'VALIDATION_ERROR',
        requestId,
      });
      return;
    }

    if (err.name === 'UnauthorizedError' || err.status === 401) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
        requestId,
      });
      return;
    }

    if (err.name === 'ForbiddenError' || err.status === 403) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requestId,
      });
      return;
    }

    if (err.status && err.status < 500) {
      res.status(err.status).json({
        success: false,
        error: isProduction ? 'Request Error' : err.message,
        code: 'CLIENT_ERROR',
        requestId,
      });
      return;
    }

    // SECURITY: Never expose internal errors in production
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: isProduction ? 'An unexpected error occurred. Please try again later.' : err.message,
      code: 'INTERNAL_ERROR',
      requestId,
      // Only include stack trace in development
      ...(NODE_ENV === 'development' && { stack: err.stack }),
    });
  }
);

// SECURITY: 404 handler with sanitized response
app.use((req, res) => {
  const requestId =
    req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log 404s for monitoring
  logger.warn('404 Not Found', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json({
    error: 'Not Found',
    message:
      NODE_ENV === 'production'
        ? 'The requested resource was not found'
        : `Route ${req.method} ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    requestId,
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
          gameManager.cleanupInactiveGames();
          logger.info('🧹 Periodic game cleanup completed');
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

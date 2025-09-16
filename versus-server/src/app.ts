import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { rateLimiter } from 'hono/rate-limiter';
import { AuthService } from './services/auth-service.js';
import { GameManager } from './core/game-manager.js';
import { createGameRoutes } from './routes/game-routes.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { logger } from './utils/logger.js';
import type { DatabaseConfig } from './core/database.js';

export interface AppConfig {
  databaseConfig: DatabaseConfig;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret?: string;
}

export function createApp(config: AppConfig) {
  const app = new Hono();

  // Security middleware
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
    })
  );

  // CORS configuration
  app.use(
    '*',
    cors({
      origin: config.nodeEnv === 'development' ? '*' : config.corsOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Compression
  app.use('*', compress());

  // Request logging
  if (config.nodeEnv === 'development') {
    app.use('*', honoLogger());
  } else {
    app.use(
      '*',
      honoLogger((message, ...args) => {
        logger.info(message, { args });
      })
    );
  }

  // Rate limiting
  app.use(
    '/api/*',
    rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 100, // limit each IP to 100 requests per windowMs
      keyGenerator: c => c.env?.ip || c.req.header('x-forwarded-for') || 'unknown',
    })
  );

  // Strict rate limiting for auth endpoints
  app.use(
    '/api/v1/auth/*',
    rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 10, // limit each IP to 10 auth requests per windowMs
      keyGenerator: c => c.env?.ip || c.req.header('x-forwarded-for') || 'unknown',
    })
  );

  // Initialize services
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService();

  // Health check endpoint
  app.get('/api/v1/health', c => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      environment: config.nodeEnv,
    });
  });

  // Root endpoint
  app.get('/', c => {
    return c.json({
      name: 'Versus Server',
      version: '1.0.0',
      description: 'TypeScript game arcade API with multiplatform support',
      platforms: ['Node.js', 'Cloudflare Workers', 'Bun', 'Deno'],
      endpoints: {
        auth: '/api/v1/auth',
        games: '/api/v1/games',
        health: '/api/v1/health',
      },
      documentation: 'https://github.com/lightnolimit/versus',
    });
  });

  // Mount route handlers
  app.route('/api/v1/auth', createAuthRoutes());
  app.route('/api/v1/games', createGameRoutes(gameManager));

  // Global error handler
  app.onError((err, c) => {
    logger.error('API Error', {
      error: err.message,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
      method: c.req.method,
      url: c.req.url,
      userAgent: c.req.header('User-Agent'),
    });

    if (err.name === 'ValidationError') {
      return c.json(
        {
          success: false,
          error: 'Validation Error',
          message: err.message,
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  });

  // 404 handler
  app.notFound(c => {
    return c.json(
      {
        success: false,
        error: 'Not Found',
        message: `Route ${c.req.method} ${c.req.url} not found`,
        code: 'NOT_FOUND',
      },
      404
    );
  });

  return { app, gameManager, authService };
}

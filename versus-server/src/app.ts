import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
// Note: Using custom rate limiting for now
import { AuthService } from './services/auth-service.js';
import { HealthService } from './services/health-service.js';
import { MonitoringService, type MonitoringConfig } from './services/monitoring-service.js';
import { BackupService, type BackupConfig } from './services/backup-service.js';
import { GameManager } from './core/game-manager.js';
import { createGameRoutes } from './routes/game-routes.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { logger } from './utils/logger.js';
import { ErrorHandler, GameError } from './utils/error-handler.js';
import type { DatabaseConfig } from './core/database.js';

export interface AppConfig {
  databaseConfig: DatabaseConfig;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret?: string;
  monitoring?: MonitoringConfig;
  backup?: BackupConfig;
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

  // DEBT: Rate limiting not implemented - security vulnerability
  // TODO: Implement custom rate limiting middleware for Hono
  // Impact: Server vulnerable to DoS attacks without rate limiting
  // Estimated effort: 2-3 days

  // Initialize services
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService();
  const healthService = new HealthService(gameManager.getDatabase());
  const errorHandler = ErrorHandler.getInstance();

  // Initialize monitoring if configured
  let monitoringService: MonitoringService | undefined;
  if (config.monitoring) {
    monitoringService = new MonitoringService(config.monitoring);
    monitoringService.initialize();
  }

  // Initialize backup service if configured
  let backupService: BackupService | undefined;
  if (config.backup) {
    backupService = new BackupService(gameManager.getDatabase(), config.backup);
  }

  // Comprehensive health check endpoint
  app.get('/api/v1/health', async c => {
    try {
      const healthCheck = await healthService.performHealthCheck();

      // Return appropriate status code based on health
      const statusCode =
        healthCheck.status === 'healthy' ? 200 : healthCheck.status === 'degraded' ? 200 : 503;

      return c.json(healthCheck, statusCode);
    } catch (error) {
      logger.error('Health check failed', { error });
      return c.json(
        {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
        },
        503
      );
    }
  });

  // Metrics endpoint for monitoring
  app.get('/api/v1/metrics', c => {
    try {
      const metrics = healthService.getMetrics();
      return c.json(metrics);
    } catch (error) {
      logger.error('Metrics collection failed', { error });
      return c.json({ error: 'Metrics unavailable' }, 500);
    }
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

  // Production-ready global error handler
  app.onError((err, c) => {
    // Convert to GameError if needed
    const gameError = err instanceof GameError ? err : errorHandler.handleError(err);

    // Log error with full context
    logger.error('API Error', {
      error: gameError.message,
      code: gameError.code,
      isOperational: gameError.isOperational,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
      method: c.req.method,
      url: c.req.url,
      userAgent: c.req.header('User-Agent'),
      context: gameError.context,
    });

    // Convert to production-safe API response
    const apiResponse = errorHandler.toAPIResponse(gameError);
    const { statusCode, ...responseBody } = apiResponse;

    return c.json(responseBody, statusCode);
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

  return { app, gameManager, authService, monitoringService, backupService };
}

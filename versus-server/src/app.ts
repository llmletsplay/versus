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
import { isAppError, toAppError } from './utils/errors.js';
import { GameError } from './utils/error-handler.js';
import { config } from './utils/config.js';
import {
  apiRateLimit,
  authRateLimit,
  gameCreationRateLimit,
  moveRateLimit,
  healthRateLimit,
} from './middleware/hono-rate-limit.js';
import { PaymentService, SUBSCRIPTION_TIERS } from './services/payment-service.js';
import { AnalyticsService } from './services/analytics-service.js';
import { RateLimitService } from './services/rate-limit-service.js';
import { SubscriptionService } from './services/subscription-service.js';
import { createPaymentRoutes } from './routes/payment-routes.js';
import { createAnalyticsRoutes } from './routes/analytics-routes.js';
import { createSubscriptionRoutes } from './routes/subscription-routes.js';
import type { DatabaseConfig } from './core/database.js';

export interface AppConfig {
  databaseConfig: DatabaseConfig;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret?: string;
  monitoring?: MonitoringConfig;
  backup?: BackupConfig;

  // Configuration helper methods
  getStripeConfig(): {
    secretKey?: string;
    webhookSecret?: string;
    enabled: boolean;
  };
}

export async function createApp(config: AppConfig) {
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

  // Apply general API rate limiting to all /api routes
  app.use('/api/*', apiRateLimit);

  // Initialize services
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService(config.databaseConfig);
  const healthService = new HealthService(gameManager.getDatabase());

  // Initialize monitoring if configured
  let monitoringService: MonitoringService | undefined;
  if (config.monitoring) {
    monitoringService = new MonitoringService(config.monitoring);
    await monitoringService.initialize();
  }

  // Initialize backup service if configured
  let backupService: BackupService | undefined;
  if (config.backup) {
    backupService = new BackupService(gameManager.getDatabase(), config.backup);
  }

  // Initialize payment service if Stripe is configured
  let paymentService: PaymentService | undefined;
  const stripeConfig = config.getStripeConfig();
  if (stripeConfig.enabled) {
    try {
      paymentService = new PaymentService(stripeConfig.secretKey!, gameManager.getDatabase());
      logger.info('Payment service initialized');
    } catch (error) {
      logger.error('Failed to initialize payment service', { error });
    }
  }

  // Initialize analytics service
  const analyticsService = new AnalyticsService(gameManager.getDatabase());
  logger.info('Analytics service initialized');

  // Initialize subscription service if payment service is available
  let subscriptionService: SubscriptionService | undefined;
  if (paymentService) {
    try {
      subscriptionService = new SubscriptionService(gameManager.getDatabase(), paymentService);
      await subscriptionService.initializeTables();
      logger.info('Subscription service initialized');
    } catch (error) {
      logger.error('Failed to initialize subscription service', { error });
    }
  }

  // Initialize rate limit service with Redis if available
  let rateLimitService: RateLimitService | undefined;
  if (process.env.REDIS_URL) {
    try {
      rateLimitService = new RateLimitService(
        process.env.REDIS_URL,
        gameManager.getDatabase(),
        paymentService as any
      );
      logger.info('Redis-based rate limiting initialized');
    } catch (error) {
      logger.error('Failed to initialize Redis rate limiting', { error });
    }
  }

  // Comprehensive health check endpoint with strict rate limit
  app.get('/api/v1/health', healthRateLimit, async (c) => {
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

  // Metrics endpoint for monitoring with rate limit
  app.get('/api/v1/metrics', healthRateLimit, (c) => {
    try {
      const metrics = healthService.getMetrics();
      return c.json(metrics);
    } catch (error) {
      logger.error('Metrics collection failed', { error });
      return c.json({ error: 'Metrics unavailable' }, 500);
    }
  });

  // Root endpoint
  app.get('/', (c) => {
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

  // Mount payment routes if payment service is available
  if (paymentService) {
    app.route('/api/v1/payments', createPaymentRoutes(paymentService));
  }

  // Mount subscription routes if subscription service is available
  if (subscriptionService && paymentService && rateLimitService) {
    app.route(
      '/api/v1/subscriptions',
      createSubscriptionRoutes(subscriptionService, paymentService as any, rateLimitService)
    );
  }

  // Mount analytics routes
  if (rateLimitService) {
    app.route('/api/v1/analytics', createAnalyticsRoutes(analyticsService, rateLimitService));
  } else {
    // Fallback to basic analytics
    app.route(
      '/api/v1/analytics',
      createAnalyticsRoutes(
        analyticsService,
        new RateLimitService(undefined, gameManager.getDatabase(), paymentService as any)
      )
    );
  }

  // Production-ready global error handler
  app.onError((err, c) => {
    // Convert to AppError if needed
    let appError;
    if (isAppError(err)) {
      appError = err;
    } else if (err instanceof GameError) {
      // Convert GameError to AppError
      appError = toAppError(err);
    } else {
      appError = toAppError(err);
    }

    // Log error with full context
    logger.error('API Error', {
      error: appError.message,
      code: appError.code,
      isOperational: appError.isOperational,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
      method: c.req.method,
      url: c.req.url,
      userAgent: c.req.header('User-Agent'),
      context: appError.context,
    });

    // Convert to production-safe API response
    const responseBody = {
      success: false,
      error: appError.message,
      code: appError.code,
      ...(appError.context && { details: appError.context }),
    };

    return c.json(responseBody, appError.statusCode as any);
  });

  // 404 handler
  app.notFound((c) => {
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

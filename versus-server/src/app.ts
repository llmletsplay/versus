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
import { WebSocketServer } from './core/websocket.js';
import { createGameRoutes } from './routes/game-routes.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { createRoomRoutes } from './routes/room-routes.js';
import { createRatingRoutes } from './routes/rating-routes.js';
import { createAgentRoutes } from './routes/agent-routes.js';
import { createEscrowRoutes } from './routes/escrow-routes.js';
import { createMarketRoutes } from './routes/market-routes.js';
import { createTournamentRoutes } from './routes/tournament-routes.js';
import { logger } from './utils/logger.js';
import { isAppError, toAppError } from './utils/errors.js';
import { GameError } from './utils/error-handler.js';
import { apiRateLimit, healthRateLimit } from './middleware/hono-rate-limit.js';
import { X402PaymentService, type X402PaymentConfig } from './services/x402-payment-service.js';
import { createX402PaymentRoutes } from './routes/x402-payment-routes.js';
import { RoomService } from './services/room-service.js';
import { RatingService } from './services/rating-service.js';
import { OpenClawBridge } from './services/openclaw-bridge.js';
import { EscrowService } from './services/escrow-service.js';
import { PredictionMarketService } from './services/prediction-market-service.js';
import { TournamentService } from './services/tournament-service.js';
import { IntentService, type IntentServiceConfig } from './services/intent-service.js';
import { WagerService } from './services/wager-service.js';
import { SolverBridge, type SolverBridgeConfig } from './services/solver-bridge.js';
import { createWagerRoutes } from './routes/wager-routes.js';
import type { DatabaseConfig } from './core/database.js';
import type { OpenClawConfig } from './types/agent.js';

export interface AppConfig {
  databaseConfig: DatabaseConfig;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret?: string;
  monitoring?: MonitoringConfig;
  backup?: BackupConfig;
  x402?: X402PaymentConfig;
  getX402Config?: () => X402PaymentConfig;
  openClaw?: OpenClawConfig;
  intent?: IntentServiceConfig;
  solver?: SolverBridgeConfig;
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
        connectSrc: ["'self'", 'ws:', 'wss:'],
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

  // ── Initialize Core Services ─────────────────────────────────────
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService(config.databaseConfig);
  const healthService = new HealthService(gameManager.getDatabase());
  const wsServer = new WebSocketServer();

  // ── Initialize Platform Services ─────────────────────────────────
  const db = gameManager.getDatabase();
  const roomService = new RoomService(db, gameManager, wsServer);
  const ratingService = new RatingService(db);
  const escrowService = new EscrowService(db, wsServer);
  const marketService = new PredictionMarketService(db, wsServer);
  const tournamentService = new TournamentService(db, wsServer);

  // ── Initialize OpenClaw Bridge ───────────────────────────────────
  let openClawBridge: OpenClawBridge | undefined;
  if (config.openClaw?.enabled) {
    try {
      openClawBridge = new OpenClawBridge(db, gameManager, wsServer, config.openClaw);
      await openClawBridge.initialize();
      logger.info('🤖 OpenClaw bridge initialized');
    } catch (error) {
      logger.error('Failed to initialize OpenClaw bridge', { error });
    }
  }

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

  // Initialize x402 payment service if configured
  let x402PaymentService: X402PaymentService | undefined;
  const x402Config = config.getX402Config?.() ?? config.x402;
  if (x402Config?.enabled) {
    try {
      x402PaymentService = new X402PaymentService(gameManager.getDatabase(), x402Config);
      await x402PaymentService.initialize();
      logger.info('x402 payment service initialized');
    } catch (error) {
      logger.error('Failed to initialize x402 payment service', { error });
    }
  }

  // Initialize intent service
  const intentService = new IntentService(db, config.intent ?? { enabled: true });
  await intentService.initialize();

  // Initialize solver bridge
  const solverBridge = new SolverBridge(db, config.solver);
  await solverBridge.initialize();

  // Initialize wager service
  const wagerService = new WagerService(db, intentService);
  await wagerService.initialize();

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
      name: 'Versus Platform',
      version: '2.0.0',
      description: 'AI-native competitive gaming arena with crypto wagering and prediction markets',
      platforms: ['Node.js', 'Cloudflare Workers', 'Bun', 'Deno'],
      endpoints: {
        auth: '/api/v1/auth',
        games: '/api/v1/games',
        rooms: '/api/v1/rooms',
        ratings: '/api/v1/ratings',
        agents: '/api/v1/agents',
        escrow: '/api/v1/escrow',
        markets: '/api/v1/markets',
        tournaments: '/api/v1/tournaments',
        wagers: '/api/v1/wagers',
        health: '/api/v1/health',
      },
      features: [
        'Real-time WebSocket multiplayer',
        'AI agent integration (OpenClaw + MCP)',
        'Crypto escrow wagering',
        'Prediction markets',
        'ELO-based matchmaking',
        'Tournament system',
        'Non-custodial intent settlement',
        'Cross-chain wager support',
      ],
      documentation: 'https://github.com/lightnolimit/versus',
    });
  });

  // ── Mount Route Handlers ─────────────────────────────────────────
  app.route('/api/v1/auth', createAuthRoutes(authService));
  app.route('/api/v1/games', createGameRoutes(gameManager));
  app.route('/api/v1/rooms', createRoomRoutes(roomService));
  app.route('/api/v1/ratings', createRatingRoutes(ratingService));
  app.route('/api/v1/escrow', createEscrowRoutes(escrowService));
  app.route('/api/v1/markets', createMarketRoutes(marketService));
  app.route('/api/v1/tournaments', createTournamentRoutes(tournamentService));
  app.route(
    '/api/v1/wagers',
    createWagerRoutes(wagerService, intentService, x402PaymentService ?? null, {
      enabled: x402Config?.enabled ?? false,
      settlementAddress: x402Config?.settlementAddress,
    })
  );

  if (openClawBridge) {
    app.route('/api/v1/agents', createAgentRoutes(openClawBridge));
  }

  if (x402PaymentService) {
    app.route('/api/v1/payments/x402', createX402PaymentRoutes(x402PaymentService));
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

  return {
    app,
    gameManager,
    authService,
    wsServer,
    roomService,
    ratingService,
    escrowService,
    marketService,
    tournamentService,
    openClawBridge,
    monitoringService,
    backupService,
    x402PaymentService,
    intentService,
    wagerService,
    solverBridge,
  };
}

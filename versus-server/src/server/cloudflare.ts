import { createApp } from '../app.js';
import { registerGames } from '../games/index.js';
import type { DatabaseConfig } from '../core/database.js';

// Cloudflare Workers environment variables interface
interface CloudflareEnv {
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    // Database configuration for Cloudflare Workers
    // Note: For production, you'd use Cloudflare D1 or external database
    const databaseConfig: DatabaseConfig = env.DATABASE_URL
      ? {
          type: 'postgresql',
          connectionString: env.DATABASE_URL,
        }
      : {
          type: 'sqlite',
          sqlitePath: ':memory:', // In-memory SQLite for Workers (temporary sessions)
        };

    // Create Hono app with Cloudflare configuration
    const result = await createApp({
      databaseConfig,
      corsOrigin: env.CORS_ORIGIN || '*',
      nodeEnv: env.NODE_ENV || 'production',
      jwtSecret: env.JWT_SECRET,
    });

    const { app, gameManager, authService } = result;

    // Register all games
    registerGames(gameManager);

    // Initialize services (for in-memory DB, this happens on each request)
    try {
      await gameManager.initialize();
      await authService.initializeUserTable();
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      return new Response('Service initialization failed', { status: 500 });
    }

    // Handle the request
    return app.fetch(request, env);
  },
};

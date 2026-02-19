import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AuthService } from '../services/auth-service.js';
import { logger } from '../utils/logger.js';
import { authRateLimit } from '../middleware/hono-rate-limit.js';

// Validation schemas
const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function createAuthRoutes(injectedAuthService?: AuthService) {
  const app = new Hono<{ Variables: { user?: any } }>();
  const authService = injectedAuthService ?? new AuthService();

  // Middleware to attach user info
  app.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const payload = authService.verifyToken(token);
        const user = await authService.getUserById(payload.userId);

        if (user && user.isActive) {
          c.set('user', payload);
        }
      } catch (_error) {
        // Invalid token, continue without user
      }
    }

    await next();
  });

  /**
   * POST /register
   * Register a new user account
   */
  app.post('/register', authRateLimit, zValidator('json', registerSchema), async (c) => {
    try {
      const userData = c.req.valid('json');
      const result = await authService.createUser(userData);

      logger.info('User registered successfully', { username: userData.username });

      return c.json(
        {
          success: true,
          data: result,
          message: 'User registered successfully',
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';

      logger.warn('User registration failed', { error: message });

      // Return appropriate status codes
      if (message.includes('already exists') || message.includes('already registered')) {
        return c.json(
          {
            success: false,
            error: message,
            code: 'USER_EXISTS',
          },
          409
        );
      } else if (message.includes('must be at least') || message.includes('required')) {
        return c.json(
          {
            success: false,
            error: message,
            code: 'VALIDATION_ERROR',
          },
          400
        );
      } else {
        return c.json(
          {
            success: false,
            error: 'Registration failed',
            code: 'REGISTRATION_ERROR',
          },
          500
        );
      }
    }
  });

  /**
   * POST /login
   * Login with username and password
   */
  app.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
    try {
      const credentials = c.req.valid('json');
      const result = await authService.login(credentials);

      logger.info('User logged in successfully', { username: credentials.username });

      return c.json({
        success: true,
        data: result,
        message: 'Login successful',
      });
    } catch (error) {
      const userData = c.req.valid('json');
      const message = error instanceof Error ? error.message : 'Login failed';

      logger.warn('User login failed', { username: userData.username, error: message });

      if (message.includes('Invalid credentials') || message.includes('deactivated')) {
        return c.json(
          {
            success: false,
            error: message,
            code: 'INVALID_CREDENTIALS',
          },
          401
        );
      } else {
        return c.json(
          {
            success: false,
            error: 'Login failed',
            code: 'LOGIN_ERROR',
          },
          500
        );
      }
    }
  });

  /**
   * GET /me
   * Get current user information
   */
  app.get('/me', async (c) => {
    const user = c.get('user') as { userId: string; username: string; role: string } | undefined;

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const userData = await authService.getUserById(user.userId);
      if (!userData) {
        return c.json(
          {
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          },
          404
        );
      }

      const { passwordHash: _passwordHash, ...safeUserData } = userData;
      return c.json({
        success: true,
        data: safeUserData,
      });
    } catch (error) {
      logger.error('Error getting user info', { userId: user.userId, error });
      return c.json(
        {
          success: false,
          error: 'Failed to get user information',
          code: 'USER_INFO_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /refresh
   * Refresh authentication token
   */
  app.post('/refresh', async (c) => {
    const user = c.get('user') as { userId: string; username: string; role: string } | undefined;

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const userData = await authService.getUserById(user.userId);
      if (!userData || !userData.isActive) {
        return c.json(
          {
            success: false,
            error: 'User not found or inactive',
            code: 'USER_INACTIVE',
          },
          401
        );
      }

      const newToken = authService.generateToken(userData);

      return c.json({
        success: true,
        data: {
          token: newToken,
          user: {
            id: userData.id,
            username: userData.username,
            email: userData.email,
            role: userData.role,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
            isActive: userData.isActive,
          },
        },
        message: 'Token refreshed successfully',
      });
    } catch (error) {
      logger.error('Error refreshing token', { userId: user.userId, error });
      return c.json(
        {
          success: false,
          error: 'Failed to refresh token',
          code: 'TOKEN_REFRESH_ERROR',
        },
        500
      );
    }
  });

  return app;
}

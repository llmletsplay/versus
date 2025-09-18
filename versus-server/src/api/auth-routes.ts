import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth-service';
import { AuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();
const authService = new AuthService();
const authMiddleware = new AuthMiddleware();

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

/**
 * POST /api/v1/auth/register
 * Register a new user account
 */
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    const result = await authService.createUser(userData);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';

    // Return appropriate status codes
    if (message.includes('already exists') || message.includes('already registered')) {
      res.status(409).json({
        success: false,
        error: message,
        code: 'USER_EXISTS',
      });
    } else if (message.includes('must be at least') || message.includes('required')) {
      res.status(400).json({
        success: false,
        error: message,
        code: 'VALIDATION_ERROR',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR',
      });
    }
  }
});

/**
 * POST /api/v1/auth/login
 * Login with username and password
 */
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  try {
    const credentials = req.body;
    const result = await authService.login(credentials);

    res.json({
      success: true,
      data: result,
      message: 'Login successful',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';

    if (message.includes('Invalid credentials') || message.includes('deactivated')) {
      res.status(401).json({
        success: false,
        error: message,
        code: 'INVALID_CREDENTIALS',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Login failed',
        code: 'LOGIN_ERROR',
      });
    }
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user information
 */
router.get(
  '/me',
  authMiddleware.authenticateJWT,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const user = await authService.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      const { passwordHash: _passwordHash, ...userData } = user;
      res.json({
        success: true,
        data: userData,
      });
    } catch (_error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user information',
        code: 'USER_INFO_ERROR',
      });
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh authentication token
 */
router.post(
  '/refresh',
  authMiddleware.authenticateJWT,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      const user = await authService.getUserById(req.user.userId);
      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'User not found or inactive',
          code: 'USER_INACTIVE',
        });
        return;
      }

      const newToken = authService.generateToken(user);

      res.json({
        success: true,
        data: {
          token: newToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            isActive: user.isActive,
          },
        },
        message: 'Token refreshed successfully',
      });
    } catch (_error) {
      res.status(500).json({
        success: false,
        error: 'Failed to refresh token',
        code: 'TOKEN_REFRESH_ERROR',
      });
    }
  }
);

export default router;

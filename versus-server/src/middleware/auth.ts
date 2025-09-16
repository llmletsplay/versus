import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth-service';
import { JWTPayload } from '../types/auth';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  authenticateJWT = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.header('Authorization');

      if (!authHeader) {
        res.status(401).json({
          error: 'Access token required',
          code: 'NO_TOKEN',
        });
        return;
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token || token === authHeader) {
        res.status(401).json({
          error: 'Invalid authorization format. Use: Bearer <token>',
          code: 'INVALID_FORMAT',
        });
        return;
      }

      // Verify the token
      const payload = this.authService.verifyToken(token);

      // Verify user still exists and is active
      const user = await this.authService.getUserById(payload.userId);
      if (!user || !user.isActive) {
        res.status(401).json({
          error: 'User not found or inactive',
          code: 'USER_INACTIVE',
        });
        return;
      }

      // Attach user info to request
      req.user = payload;
      next();
    } catch (error) {
      res.status(403).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }
  };

  requireRole = (requiredRole: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      if (req.user.role !== requiredRole && req.user.role !== 'admin') {
        res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredRole,
          current: req.user.role,
        });
        return;
      }

      next();
    };
  };

  optionalAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.header('Authorization');

      if (!authHeader) {
        // No auth header, continue without user
        next();
        return;
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token || token === authHeader) {
        // Invalid format, continue without user
        next();
        return;
      }

      // Try to verify the token
      try {
        const payload = this.authService.verifyToken(token);
        const user = await this.authService.getUserById(payload.userId);

        if (user && user.isActive) {
          req.user = payload;
        }
      } catch (error) {
        // Invalid token, continue without user
      }

      next();
    } catch (error) {
      // Any error, continue without user
      next();
    }
  };
}

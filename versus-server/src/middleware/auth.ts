import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth-service';
import { JWTPayload } from '../types/auth';

// SECURITY: Extended request interface with authenticated user data
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

// CRITICAL: Authentication middleware - secures all protected endpoints
// SECURITY: Validates JWT tokens and user permissions
export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    // SECURITY: Initialize auth service for token validation
    this.authService = new AuthService();
  }

  // SECURITY: JWT authentication middleware - validates Bearer tokens
  // CRITICAL: Primary authentication gate for protected endpoints
  authenticateJWT = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // SECURITY: Extract Authorization header
      const authHeader = req.header('Authorization');

      // SECURITY: Reject requests without authorization header
      if (!authHeader) {
        res.status(401).json({
          error: 'Access token required',
          code: 'NO_TOKEN',
        });
        return;
      }

      // SECURITY: Extract token from Bearer format
      const token = authHeader.replace('Bearer ', '');

      // SECURITY: Validate Bearer token format
      if (!token || token === authHeader) {
        res.status(401).json({
          error: 'Invalid authorization format. Use: Bearer <token>',
          code: 'INVALID_FORMAT',
        });
        return;
      }

      // SECURITY: Verify token signature and expiration
      const payload = this.authService.verifyToken(token);

      // SECURITY: Verify user still exists and is active
      // Prevents deleted/deactivated users from accessing system
      const user = await this.authService.getUserById(payload.userId);
      if (!user || !user.isActive) {
        res.status(401).json({
          error: 'User not found or inactive',
          code: 'USER_INACTIVE',
        });
        return;
      }

      // SECURITY: Attach validated user info to request
      req.user = payload;
      next();
    } catch (_error) {
      // SECURITY: Generic error response prevents token analysis
      res.status(403).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }
  };

  // SECURITY: Role-based access control middleware
  // CRITICAL: Enforces permission boundaries based on user roles
  requireRole = (requiredRole: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      // SECURITY: Ensure user is authenticated first
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }

      // SECURITY: Role hierarchy - admin can access everything
      // Other roles must match exactly or be escalated to admin
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

  // SECURITY: Optional authentication - for public endpoints with user context
  // Allows endpoints to work without auth but provides user data if available
  optionalAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // SECURITY: Check for authorization header
      const authHeader = req.header('Authorization');

      if (!authHeader) {
        // SECURITY: No auth header, continue without user context
        next();
        return;
      }

      // SECURITY: Extract token from Bearer format
      const token = authHeader.replace('Bearer ', '');

      if (!token || token === authHeader) {
        // SECURITY: Invalid format, continue without user context
        next();
        return;
      }

      // SECURITY: Attempt token verification without failing request
      try {
        const payload = this.authService.verifyToken(token);
        const user = await this.authService.getUserById(payload.userId);

        // SECURITY: Only attach user if token is valid and user is active
        if (user && user.isActive) {
          req.user = payload;
        }
      } catch (_error) {
        // SECURITY: Invalid token, continue without user context
        // This is expected behavior for optional auth
      }

      next();
    } catch (_error) {
      // SECURITY: Any error, continue without user context
      // Optional auth should never block requests
      next();
    }
  };
}

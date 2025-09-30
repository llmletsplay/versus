import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validateRequest<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errorMessages,
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          code: 'INVALID_REQUEST',
        });
      }
    }
  };
}

export function validateQuery<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate query parameters
      const validated = schema.parse(req.query);
      (req as any).query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: 'Query parameter validation failed',
          code: 'QUERY_VALIDATION_ERROR',
          details: errorMessages,
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          code: 'INVALID_QUERY',
        });
      }
    }
  };
}

export function validateParams<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate path parameters
      const validated = schema.parse(req.params);
      (req as any).params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: 'Path parameter validation failed',
          code: 'PARAMS_VALIDATION_ERROR',
          details: errorMessages,
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid path parameters',
          code: 'INVALID_PARAMS',
        });
      }
    }
  };
}

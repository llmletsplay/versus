import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { httpIntegration, consoleIntegration, onUncaughtExceptionIntegration } from '@sentry/node';
import { logger } from '../utils/logger.js';

export interface MonitoringConfig {
  sentryDsn?: string;
  environment: string;
  release?: string;
  enableProfiling: boolean;
  enableTracing: boolean;
  sampleRate: number;
  profilesSampleRate: number;
}

export class MonitoringService {
  private config: MonitoringConfig;
  private initialized = false;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  initialize(): void {
    if (!this.config.sentryDsn) {
      logger.info('Sentry DSN not provided, monitoring disabled');
      return;
    }

    try {
      Sentry.init({
        dsn: this.config.sentryDsn,
        environment: this.config.environment,
        release: this.config.release || '2.0.0',

        // Performance monitoring
        tracesSampleRate: this.config.enableTracing ? this.config.sampleRate : 0,
        profilesSampleRate: this.config.enableProfiling ? this.config.profilesSampleRate : 0,

        // Integrations
        integrations: [
          // Enable profiling
          ...(this.config.enableProfiling ? [nodeProfilingIntegration()] : []),

          // HTTP integration for request tracking
          httpIntegration({
            breadcrumbs: true,
          }),

          // Console integration for log correlation
          consoleIntegration(),

          // OnUncaughtException integration
          onUncaughtExceptionIntegration({
            exitEvenIfOtherHandlersAreRegistered: false,
          }),
        ],

        // Enhanced error filtering
        beforeSend(event) {
          // Filter out non-critical errors in production
          if (event.environment === 'production') {
            // Don't send validation errors to Sentry (they're user errors)
            if (
              event.tags?.errorCode === 'VALIDATION_ERROR' ||
              event.tags?.errorCode === 'INVALID_MOVE_FORMAT'
            ) {
              return null;
            }
          }

          return event;
        },

        // Add custom tags
        initialScope: {
          tags: {
            component: 'versus-game-server',
            architecture: 'hono-multiplatform',
          },
        },
      });

      this.initialized = true;
      logger.info('Sentry monitoring initialized', {
        environment: this.config.environment,
        profiling: this.config.enableProfiling,
        tracing: this.config.enableTracing,
      });
    } catch (error) {
      logger.error('Failed to initialize Sentry monitoring', { error });
    }
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.initialized) {return;}

    Sentry.withScope(scope => {
      if (context) {
        // Add game-specific context
        if (context.gameId) {scope.setTag('gameId', context.gameId);}
        if (context.gameType) {scope.setTag('gameType', context.gameType);}
        if (context.player) {scope.setUser({ id: context.player });}

        // Add additional context
        scope.setContext('gameContext', context);
      }

      Sentry.captureException(error);
    });
  }

  /**
   * Capture a message with severity level
   */
  captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: Record<string, any>
  ): void {
    if (!this.initialized) {return;}

    Sentry.withScope(scope => {
      scope.setLevel(level);

      if (context) {
        scope.setContext('messageContext', context);
      }

      Sentry.captureMessage(message);
    });
  }

  /**
   * Start a performance transaction
   */
  startTransaction(name: string, operation: string): any {
    if (!this.initialized || !this.config.enableTracing) {return undefined;}

    return Sentry.startSpan(
      {
        name,
        op: operation,
      },
      span => span
    );
  }

  /**
   * Track game-specific metrics
   */
  trackGameEvent(
    eventName: string,
    gameId: string,
    gameType: string,
    properties?: Record<string, any>
  ): void {
    if (!this.initialized) {return;}

    Sentry.addBreadcrumb({
      category: 'game',
      message: eventName,
      level: 'info',
      data: {
        gameId,
        gameType,
        ...properties,
      },
    });
  }

  /**
   * Track authentication events
   */
  trackAuthEvent(eventName: string, userId?: string, properties?: Record<string, any>): void {
    if (!this.initialized) {return;}

    Sentry.addBreadcrumb({
      category: 'auth',
      message: eventName,
      level: 'info',
      data: {
        userId,
        ...properties,
      },
    });
  }

  /**
   * Set user context for error tracking
   */
  setUserContext(userId: string, username?: string, email?: string): void {
    if (!this.initialized) {return;}

    Sentry.setUser({
      id: userId,
      username,
      email,
    });
  }

  /**
   * Capture performance metrics manually
   */
  capturePerformanceMetric(name: string, value: number, unit: string = 'ms'): void {
    if (!this.initialized) {return;}

    // Add as breadcrumb for now - in production integrate with custom metrics
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `${name}: ${value}${unit}`,
      level: 'info',
      data: { name, value, unit },
    });
  }

  /**
   * Flush pending events (useful for serverless)
   */
  async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) {return true;}

    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      logger.warn('Failed to flush Sentry events', { error });
      return false;
    }
  }

  /**
   * Close monitoring service
   */
  async close(): Promise<void> {
    if (!this.initialized) {return;}

    try {
      await this.flush();
      await Sentry.close();
      logger.info('Monitoring service closed');
    } catch (error) {
      logger.error('Failed to close monitoring service', { error });
    }
  }
}

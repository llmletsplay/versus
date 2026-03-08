import { logger } from '../utils/logger.js';

type SentryModule = any;

export interface MonitoringConfig {
  sentryDsn?: string;
  environment: string;
  release?: string;
  enableTracing?: boolean;
  traceSampleRate?: number;
}

export class MonitoringService {
  private config: MonitoringConfig;
  private initialized = false;
  private sentry: SentryModule | null = null;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.sentryDsn) {
      logger.info('Sentry DSN not provided, monitoring disabled');
      return;
    }

    try {
      const sentry = await import('@sentry/node').catch((error: unknown) => {
        logger.warn('Sentry module not installed; monitoring disabled', {
          error: error instanceof Error ? error.message : error,
        });
        return null;
      });

      if (!sentry) {
        return;
      }

      const { init, httpIntegration, consoleIntegration, onUncaughtExceptionIntegration } = sentry;

      init({
        dsn: this.config.sentryDsn,
        environment: this.config.environment,
        release: this.config.release || '2.0.0',
        tracesSampleRate: this.config.enableTracing ? (this.config.traceSampleRate ?? 0.1) : 0,
        integrations: [
          httpIntegration({ breadcrumbs: true }),
          consoleIntegration(),
          onUncaughtExceptionIntegration({
            exitEvenIfOtherHandlersAreRegistered: false,
          }),
        ],
        beforeSend(event: any) {
          if (event.environment === 'production') {
            if (
              event.tags?.errorCode === 'VALIDATION_ERROR' ||
              event.tags?.errorCode === 'INVALID_MOVE_FORMAT'
            ) {
              return null;
            }
          }
          return event;
        },
        initialScope: {
          tags: {
            component: 'versus-game-server',
            architecture: 'hono-multiplatform',
          },
        },
      });

      this.sentry = sentry;
      this.initialized = true;
      logger.info('Sentry monitoring initialized', {
        environment: this.config.environment,
        tracing: this.config.enableTracing ?? false,
      });
    } catch (error) {
      logger.error('Failed to initialize Sentry monitoring', { error });
    }
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.withScope((scope: any) => {
      if (context) {
        // Add game-specific context
        if (context.gameId) {
          scope.setTag('gameId', context.gameId);
        }
        if (context.gameType) {
          scope.setTag('gameType', context.gameType);
        }
        if (context.player) {
          scope.setUser({ id: context.player });
        }

        // Add additional context
        scope.setContext('gameContext', context);
      }

      this.sentry!.captureException(error);
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
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.withScope((scope: any) => {
      scope.setLevel(level);

      if (context) {
        scope.setContext('messageContext', context);
      }

      this.sentry!.captureMessage(message);
    });
  }

  /**
   * Start a performance transaction
   */
  startTransaction(name: string, operation: string): any {
    if (!this.initialized || !this.config.enableTracing || !this.sentry) {
      return undefined;
    }

    return this.sentry.startSpan(
      {
        name,
        op: operation,
      },
      (span: any) => span
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
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.addBreadcrumb({
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
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.addBreadcrumb({
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
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.setUser({
      id: userId,
      username,
      email,
    });
  }

  /**
   * Capture performance metrics manually
   */
  capturePerformanceMetric(name: string, value: number, unit: string = 'ms'): void {
    if (!this.initialized || !this.sentry) {
      return;
    }

    this.sentry.addBreadcrumb({
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
    if (!this.initialized || !this.sentry) {
      return true;
    }

    try {
      return await this.sentry.flush(timeout);
    } catch (error) {
      logger.warn('Failed to flush Sentry events', { error });
      return false;
    }
  }

  /**
   * Close monitoring service
   */
  async close(): Promise<void> {
    if (!this.initialized || !this.sentry) {
      return;
    }

    try {
      await this.flush();
      await this.sentry.close();
      logger.info('Monitoring service closed');
    } catch (error) {
      logger.error('Failed to close monitoring service', { error });
    }
  }
}

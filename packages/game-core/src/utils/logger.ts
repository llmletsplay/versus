/* eslint-disable no-unused-vars */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}
/* eslint-enable no-unused-vars */

export interface LogContext {
  gameId?: string;
  gameType?: string;
  player?: string;
  action?: string;
  timestamp?: number;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  private constructor() {
    this.logLevel = this.getLogLevelFromEnv();
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase();
    switch (level) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level}: ${message}${contextStr}`;
  }

  public debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  public warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  public error(message: string, contextOrError?: LogContext | Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      let finalContext: LogContext = {};

      // Handle overloaded parameters
      if (contextOrError instanceof Error) {
        finalContext = {
          ...context,
          error: contextOrError.message,
          stack: this.isDevelopment ? contextOrError.stack : undefined,
        };
      } else if (contextOrError) {
        finalContext = contextOrError;
      }

      console.error(this.formatMessage('ERROR', message, finalContext));
    }
  }

  public gameAction(
    action: string,
    gameId: string,
    gameType: string,
    player?: string,
    details?: any
  ): void {
    this.info(`Game action: ${action}`, {
      gameId,
      gameType,
      player,
      action,
      details,
      timestamp: Date.now(),
    });
  }

  public gameError(
    message: string,
    error: Error,
    gameId: string,
    gameType: string,
    context?: LogContext
  ): void {
    this.error(message, error, {
      ...context,
      gameId,
      gameType,
      timestamp: Date.now(),
    });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

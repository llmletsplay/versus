import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    database: HealthStatus;
    memory: HealthStatus;
    uptime: HealthStatus;
    environment: HealthStatus;
  };
  timestamp: string;
  version: string;
  uptime: number;
}

export interface HealthStatus {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  responseTime?: number;
  details?: any;
}

export class HealthService {
  private database: DatabaseProvider;
  private startTime: number;

  constructor(database: DatabaseProvider) {
    this.database = database;
    this.startTime = Date.now();
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = {
      database: await this.checkDatabase(),
      memory: this.checkMemory(),
      uptime: this.checkUptime(),
      environment: this.checkEnvironment(),
    };

    // Determine overall status
    const hasFailures = Object.values(checks).some((check) => check.status === 'fail');
    const hasWarnings = Object.values(checks).some((check) => check.status === 'warn');

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (hasFailures) {
      status = 'unhealthy';
    } else if (hasWarnings) {
      status = 'degraded';
    }

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  private async checkDatabase(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Test database connectivity with a simple query
      await this.database.query('SELECT 1');

      const responseTime = Date.now() - startTime;

      if (responseTime > 1000) {
        return {
          status: 'warn',
          message: 'Database responding slowly',
          responseTime,
          details: { threshold: '1000ms', actual: `${responseTime}ms` },
        };
      }

      return {
        status: 'pass',
        message: 'Database connection healthy',
        responseTime,
      };
    } catch (error) {
      logger.error('Database health check failed', { error });

      return {
        status: 'fail',
        message: 'Database connection failed',
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private checkMemory(): HealthStatus {
    const memUsage = process.memoryUsage();
    const totalMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    // Memory thresholds
    const memoryWarningThreshold = 512; // MB
    const memoryCriticalThreshold = 1024; // MB

    if (totalMB > memoryCriticalThreshold) {
      return {
        status: 'fail',
        message: 'Memory usage critical',
        details: { totalMB, heapMB, threshold: memoryCriticalThreshold },
      };
    }

    if (totalMB > memoryWarningThreshold) {
      return {
        status: 'warn',
        message: 'Memory usage high',
        details: { totalMB, heapMB, threshold: memoryWarningThreshold },
      };
    }

    return {
      status: 'pass',
      message: 'Memory usage normal',
      details: { totalMB, heapMB },
    };
  }

  private checkUptime(): HealthStatus {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const uptimeHours = Math.floor(uptimeSeconds / 3600);

    if (uptimeSeconds < 60) {
      return {
        status: 'warn',
        message: 'Service recently started',
        details: { uptimeSeconds, status: 'warming-up' },
      };
    }

    return {
      status: 'pass',
      message: `Service running for ${uptimeHours}h`,
      details: { uptimeSeconds, uptimeHours },
    };
  }

  private checkEnvironment(): HealthStatus {
    const requiredEnvVars = ['NODE_ENV'];
    const productionRequiredVars = ['JWT_SECRET'];

    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required environment variables
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    // Check production-specific variables
    if (process.env.NODE_ENV === 'production') {
      for (const envVar of productionRequiredVars) {
        if (!process.env[envVar]) {
          missing.push(envVar);
        }
      }

      // Check for insecure defaults in production
      if (process.env.JWT_SECRET && process.env.JWT_SECRET.includes('change-this')) {
        warnings.push('JWT_SECRET appears to be using default value');
      }
    }

    if (missing.length > 0) {
      return {
        status: 'fail',
        message: 'Missing required environment variables',
        details: { missing, warnings },
      };
    }

    if (warnings.length > 0) {
      return {
        status: 'warn',
        message: 'Environment configuration warnings',
        details: { warnings },
      };
    }

    return {
      status: 'pass',
      message: 'Environment configuration valid',
      details: {
        nodeEnv: process.env.NODE_ENV,
        hasJwtSecret: !!process.env.JWT_SECRET,
      },
    };
  }

  /**
   * Get performance metrics for monitoring
   */
  getMetrics() {
    const memUsage = process.memoryUsage();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
      },
      uptime: {
        seconds: uptime,
        formatted: this.formatUptime(uptime),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

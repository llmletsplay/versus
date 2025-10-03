/**
 * Database Query Optimization Guidelines
 *
 * This file contains best practices and utility functions for database optimization
 */

import { DatabaseProvider } from '../core/database.js';
import { logger } from './logger.js';

/**
 * Batch insert utility for bulk operations
 * Reduces round trips to database
 */
export async function batchInsert<T>(
  db: DatabaseProvider,
  tableName: string,
  records: T[],
  batchSize = 1000
): Promise<void> {
  if (!records.length) return;

  try {
    // Extract column names from first record
    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(',');

    // Build batch insert query
    const query = `
      INSERT INTO ${tableName} (${columns.join(',')})
      VALUES ${records.map(() => `(${placeholders})`).join(',')}
    `;

    // Flatten values
    const values = records.flatMap((record) => columns.map((col) => record[col as keyof T]));

    await db.query(query, values);

    logger.info('Batch insert completed', {
      table: tableName,
      records: records.length,
      batches: Math.ceil(records.length / batchSize),
    });
  } catch (error) {
    logger.error('Batch insert failed', { error, tableName, records: records.length });
    throw error;
  }
}

/**
 * Optimized pagination with cursor-based support
 * Better performance than OFFSET for large datasets
 */
export interface CursorPaginationOptions {
  cursor?: string | number;
  limit: number;
  direction?: 'forward' | 'backward';
}

export async function queryWithCursorPagination<T>(
  db: DatabaseProvider,
  baseQuery: string,
  options: CursorPaginationOptions,
  orderBy: string,
  cursorColumn = 'id'
): Promise<{ data: T[]; hasMore: boolean; nextCursor?: string | number }> {
  const { cursor, limit, direction = 'forward' } = options;

  try {
    let query = baseQuery;
    const params: any[] = [];

    // Add cursor condition
    if (cursor) {
      const operator = direction === 'forward' ? '>' : '<';
      query += ` WHERE ${cursorColumn} ${operator} ?`;
      params.push(cursor);
    }

    // Add ordering
    const orderDirection = direction === 'forward' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${orderBy} ${orderDirection}`;

    // Add limit with +1 to check for more data
    query += ` LIMIT ${limit + 1}`;

    const results = await db.query(query, params);
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, -1) : results;

    // Determine next cursor
    let nextCursor: string | number | undefined;
    if (data.length > 0) {
      const lastRecord = data[data.length - 1];
      nextCursor = lastRecord[cursorColumn];
    }

    return { data, hasMore, nextCursor };
  } catch (error) {
    logger.error('Cursor pagination query failed', { error, query: baseQuery });
    throw error;
  }
}

/**
 * Query builder for complex queries with proper escaping
 * Prevents SQL injection while building dynamic queries
 */
export class QueryBuilder {
  private query: string = '';
  private params: any[] = [];
  private whereCount = 0;

  constructor(baseQuery: string) {
    this.query = baseQuery;
  }

  where(condition: string, value?: any): QueryBuilder {
    if (value !== undefined) {
      this.query += this.whereCount === 0 ? ' WHERE ' : ' AND ';
      this.query += condition;
      this.params.push(value);
      this.whereCount++;
    }
    return this;
  }

  whereIn(condition: string, values: any[]): QueryBuilder {
    if (values.length > 0) {
      this.query += this.whereCount === 0 ? ' WHERE ' : ' AND ';
      this.query += `${condition} IN (${values.map(() => '?').join(',')})`;
      this.params.push(...values);
      this.whereCount++;
    }
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.query += ` ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.query += ` LIMIT ${count}`;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.query += ` OFFSET ${count}`;
    return this;
  }

  build(): { query: string; params: any[] } {
    return { query: this.query, params: [...this.params] };
  }
}

/**
 * Connection pool monitoring
 * Tracks pool health and usage
 */
export class PoolMonitor {
  constructor(private db: DatabaseProvider) {}

  async getPoolStats(): Promise<{
    totalConnections: number;
    idleConnections: number;
    activeConnections: number;
    waitingClients: number;
  }> {
    try {
      // This would need to be implemented based on the database provider
      // Example for PostgreSQL:
      const result = await this.db.query(`
        SELECT
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND wait_event = 'ClientRead') as waiting_clients
        FROM pg_stat_activity
      `);

      return (
        result[0] || {
          totalConnections: 0,
          idleConnections: 0,
          activeConnections: 0,
          waitingClients: 0,
        }
      );
    } catch (error) {
      logger.error('Failed to get pool stats', { error });
      throw error;
    }
  }

  async monitorPool(interval = 30000): Promise<void> {
    setInterval(async () => {
      try {
        const stats = await this.getPoolStats();

        // Log warnings if pool usage is high
        if (stats.activeConnections / stats.totalConnections > 0.8) {
          logger.warn('High database connection pool usage', stats);
        }

        if (stats.waitingClients > 0) {
          logger.warn('Clients waiting for database connections', stats);
        }
      } catch (error) {
        logger.error('Pool monitoring error', { error });
      }
    }, interval);
  }
}

/**
 * Index optimization suggestions
 * Run this periodically to identify missing indexes
 */
export async function analyzeMissingIndexes(
  db: DatabaseProvider
): Promise<Array<{ table: string; column: string; query: string; usage: number }>> {
  try {
    // This is a simplified example for PostgreSQL
    const result = await db.query(`
      SELECT
        schemaname,
        tablename,
        attname,
        n_tup_ins,
        n_tup_upd,
        n_tup_del
      FROM pg_stat_user_tables t
      JOIN pg_stats s ON s.tablename = t.tablename
      WHERE n_tup_ins + n_tup_upd + n_tup_del > 1000
      AND schemaname NOT IN ('pg_catalog', 'information_schema')
    `);

    // This would need more sophisticated analysis in production
    return result.map((row) => ({
      table: row.tablename,
      column: row.attname,
      query: `CREATE INDEX idx_${row.tablename}_${row.attname} ON ${row.tablename}(${row.attname})`,
      usage: row.n_tup_ins + row.n_tup_upd + row.n_tup_del,
    }));
  } catch (error) {
    logger.error('Failed to analyze missing indexes', { error });
    return [];
  }
}

/**
 * Cache query results with TTL
 * Reduces database load for frequently accessed data
 */
export class QueryCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  private defaultTTL = 300000; // 5 minutes

  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttl = this.defaultTTL): Promise<T> {
    const cached = this.cache.get(key);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const data = await fetchFn();
      this.cache.set(key, { data, expiry: Date.now() + ttl });
      return data;
    } catch (error) {
      // Return stale data if available on error
      if (cached) {
        logger.warn('Returning stale cache data due to error', { key, error });
        return cached.data;
      }
      throw error;
    }
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiry <= now) {
        this.cache.delete(key);
      }
    }
  }
}

// Global query cache instance
export const queryCache = new QueryCache();

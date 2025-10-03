/**
 * Subscription repository - Data access layer for subscriptions
 * Follows repository pattern for clean separation of concerns
 */

import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type {
  UserSubscription,
  SubscriptionUsage,
  BillingInvoice,
  Result,
} from '../types/subscription.js';

export class SubscriptionRepository {
  constructor(private readonly db: DatabaseProvider) {}

  /**
   * Get user's current subscription
   */
  async getCurrentSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const result = await this.db.query(
        `SELECT * FROM user_subscriptions
         WHERE user_id = ? AND status = 'active'`,
        [userId]
      );

      const row = result[0];
      if (!row) return null;

      return this.mapRowToSubscription(row);
    } catch (error) {
      logger.error('Failed to get current subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Create or update subscription
   */
  async upsertSubscription(
    subscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>
  ): Promise<UserSubscription> {
    try {
      const now = new Date().toISOString();

      await this.db.query(
        `INSERT OR REPLACE INTO user_subscriptions (
          user_id, tier_id, status, stripe_subscription_id,
          stripe_customer_id, current_period_start, current_period_end,
          cancel_at_period_end, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subscription.userId,
          subscription.tierId,
          subscription.status,
          subscription.stripeSubscriptionId || null,
          subscription.stripeCustomerId || null,
          subscription.currentPeriodStart.toISOString(),
          subscription.currentPeriodEnd.toISOString(),
          subscription.cancelAtPeriodEnd ? 1 : 0,
          now,
          now,
        ]
      );

      const updated = await this.getCurrentSubscription(subscription.userId);
      if (!updated) {
        throw new Error('Failed to retrieve subscription after upsert');
      }

      return updated;
    } catch (error) {
      logger.error('Failed to upsert subscription', { error, subscription });
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(userId: string, status: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE user_subscriptions
         SET status = ?, updated_at = datetime('now')
         WHERE user_id = ?`,
        [status, userId]
      );
    } catch (error) {
      logger.error('Failed to update subscription status', { error, userId, status });
      throw error;
    }
  }

  /**
   * Set cancel at period end flag
   */
  async setCancelAtPeriodEnd(userId: string, cancelAtPeriodEnd: boolean): Promise<void> {
    try {
      await this.db.query(
        `UPDATE user_subscriptions
         SET cancel_at_period_end = ?, updated_at = datetime('now')
         WHERE user_id = ?`,
        [cancelAtPeriodEnd ? 1 : 0, userId]
      );
    } catch (error) {
      logger.error('Failed to set cancel at period end', { error, userId, cancelAtPeriodEnd });
      throw error;
    }
  }

  /**
   * Get user by Stripe customer ID
   */
  async getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
    try {
      const result = await this.db.query(
        `SELECT user_id FROM user_subscriptions
         WHERE stripe_customer_id = ?`,
        [stripeCustomerId]
      );

      return result[0]?.user_id || null;
    } catch (error) {
      logger.error('Failed to get user by Stripe customer ID', { error, stripeCustomerId });
      throw error;
    }
  }

  /**
   * Get user ID by Stripe subscription ID
   */
  async getUserIdByStripeSubscriptionId(stripeSubscriptionId: string): Promise<string | null> {
    try {
      const result = await this.db.query(
        `SELECT user_id FROM user_subscriptions
         WHERE stripe_subscription_id = ?`,
        [stripeSubscriptionId]
      );

      return result[0]?.user_id || null;
    } catch (error) {
      logger.error('Failed to get user by Stripe subscription ID', { error, stripeSubscriptionId });
      throw error;
    }
  }

  /**
   * Get usage metrics for a user
   */
  async getUsageMetrics(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SubscriptionUsage> {
    try {
      const [apiCallsResult, gamesResult] = await Promise.all([
        this.db.query(
          `SELECT COUNT(*) as count FROM api_usage_logs
           WHERE user_id = ? AND created_at BETWEEN ? AND ?`,
          [userId, periodStart.toISOString(), periodEnd.toISOString()]
        ),
        this.db.query(
          `SELECT COUNT(*) as count FROM game_analytics
           WHERE user_id = ? AND created_at BETWEEN ? AND ?`,
          [userId, periodStart.toISOString(), periodEnd.toISOString()]
        ),
      ]);

      return {
        userId,
        periodStart,
        periodEnd,
        apiCalls: apiCallsResult[0]?.count || 0,
        gamesPlayed: gamesResult[0]?.count || 0,
        storageUsed: 0, // TODO: Implement storage tracking
        bandwidthUsed: 0, // TODO: Implement bandwidth tracking
      };
    } catch (error) {
      logger.error('Failed to get usage metrics', { error, userId });
      throw error;
    }
  }

  /**
   * Initialize subscription tables
   */
  async initializeTables(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          user_id TEXT PRIMARY KEY,
          tier_id TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'active',
          stripe_subscription_id TEXT UNIQUE,
          stripe_customer_id TEXT UNIQUE,
          current_period_start DATETIME NOT NULL,
          current_period_end DATETIME NOT NULL,
          cancel_at_period_end BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status
        ON user_subscriptions(status)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
        ON user_subscriptions(stripe_customer_id)
      `);

      logger.info('Subscription tables initialized');
    } catch (error) {
      logger.error('Failed to initialize subscription tables', { error });
      throw error;
    }
  }

  /**
   * Map database row to UserSubscription object
   */
  private mapRowToSubscription(row: any): UserSubscription {
    return {
      userId: row.user_id,
      tierId: row.tier_id,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      stripeSubscriptionId: row.stripe_subscription_id || undefined,
      stripeCustomerId: row.stripe_customer_id || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

import { PaymentService, SUBSCRIPTION_TIERS } from './payment-service.js';
import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export interface UserSubscription {
  userId: string;
  tierId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionUsage {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  apiCalls: number;
  gamesPlayed: number;
  storageUsed: number;
  bandwidthUsed: number;
}

export class SubscriptionService {
  private db: DatabaseProvider;
  private paymentService: PaymentService;

  constructor(db: DatabaseProvider, paymentService: PaymentService) {
    this.db = db;
    this.paymentService = paymentService;
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const result = await this.db.query(
        `SELECT * FROM user_subscriptions WHERE user_id = ? AND status = 'active'`,
        [userId]
      );
      const subscription = result[0];

      if (!subscription) {
        // Return free tier if no paid subscription found
        return {
          userId,
          tierId: 'free',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return {
        userId: subscription.user_id,
        tierId: subscription.tier_id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start),
        currentPeriodEnd: new Date(subscription.current_period_end),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        stripeSubscriptionId: subscription.stripe_subscription_id,
        stripeCustomerId: subscription.stripe_customer_id,
        createdAt: new Date(subscription.created_at),
        updatedAt: new Date(subscription.updated_at),
      };
    } catch (error) {
      logger.error('Failed to get user subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Create or update subscription
   */
  async upsertSubscription(
    userId: string,
    tierId: string,
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    status: string,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: boolean = false
  ): Promise<UserSubscription> {
    try {
      await this.db.query(
        `
        INSERT OR REPLACE INTO user_subscriptions (
          user_id, tier_id, status, stripe_subscription_id,
          stripe_customer_id, current_period_start, current_period_end,
          cancel_at_period_end, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
        [
          userId,
          tierId,
          status,
          stripeSubscriptionId,
          stripeCustomerId,
          currentPeriodStart.toISOString(),
          currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd ? 1 : 0,
        ]
      );

      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      // Log subscription change
      logger.info('Subscription updated', {
        userId,
        tierId,
        status,
        currentPeriodEnd,
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to upsert subscription', { error, userId, tierId });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, immediate: boolean = false): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription || subscription.tierId === 'free') {
        throw new Error('No active subscription to cancel');
      }

      if (subscription.stripeSubscriptionId) {
        // Cancel in Stripe
        if (immediate) {
          await this.paymentService.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          await this.updateSubscriptionStatus(userId, 'canceled');
        } else {
          await this.paymentService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
          });
          await this.setCancelAtPeriodEnd(userId, true);
        }
      }

      logger.info('Subscription canceled', { userId, immediate });
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(userId: string): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new Error('No subscription to resume');
      }

      await this.paymentService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await this.setCancelAtPeriodEnd(userId, false);

      logger.info('Subscription resumed', { userId });
    } catch (error) {
      logger.error('Failed to resume subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(userId: string, status: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE user_subscriptions SET status = ?, updated_at = datetime('now') WHERE user_id = ?`,
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
        `UPDATE user_subscriptions SET cancel_at_period_end = ?, updated_at = datetime('now') WHERE user_id = ?`,
        [cancelAtPeriodEnd ? 1 : 0, userId]
      );
    } catch (error) {
      logger.error('Failed to set cancel at period end', { error, userId, cancelAtPeriodEnd });
      throw error;
    }
  }

  /**
   * Change subscription tier
   */
  async changeTier(
    userId: string,
    newTierId: string,
    paymentMethodId?: string
  ): Promise<{ subscriptionId: string; clientSecret: string }> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription || !subscription.stripeCustomerId) {
        throw new Error('No existing subscription found');
      }

      // Get or create Stripe subscription
      let stripeSubscription;
      if (subscription.stripeSubscriptionId) {
        // Update existing subscription
        stripeSubscription = await this.paymentService.stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );

        // Get price ID for new tier
        const priceId = await this.paymentService.getOrCreatePrice(newTierId);

        stripeSubscription = await this.paymentService.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          {
            items: [
              {
                id: stripeSubscription.items.data[0].id,
                price: priceId,
              },
            ],
            proration_behavior: 'create_prorations',
          }
        );
      } else {
        // Create new subscription
        const priceId = await this.paymentService.getOrCreatePrice(newTierId);

        stripeSubscription = await this.paymentService.stripe.subscriptions.create({
          customer: subscription.stripeCustomerId,
          items: [{ price: priceId }],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent'],
        });
      }

      // Update local record
      await this.upsertSubscription(
        userId,
        newTierId,
        stripeSubscription.id,
        subscription.stripeCustomerId!,
        stripeSubscription.status as string,
        new Date((stripeSubscription as any).current_period_start * 1000),
        new Date((stripeSubscription as any).current_period_end * 1000),
        Boolean(stripeSubscription.cancel_at_period_end)
      );

      // Return client secret for payment confirmation if needed
      const invoice = stripeSubscription.latest_invoice as any;
      const clientSecret = invoice.payment_intent?.client_secret || '';

      logger.info('Subscription tier changed', { userId, newTierId });

      return {
        subscriptionId: stripeSubscription.id,
        clientSecret,
      };
    } catch (error) {
      logger.error('Failed to change subscription tier', { error, userId, newTierId });
      throw error;
    }
  }

  /**
   * Get subscription usage metrics
   */
  async getSubscriptionUsage(
    userId: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<SubscriptionUsage> {
    try {
      const start = periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = periodEnd || new Date();

      // Get API calls usage from rate limit service or analytics
      const apiCallsResult = await this.db.query(
        `SELECT COUNT(*) as count FROM api_usage_logs
         WHERE user_id = ? AND created_at BETWEEN ? AND ?`,
        [userId, start.toISOString(), end.toISOString()]
      );
      const apiCalls = apiCallsResult[0];

      // Get games played
      const gamesResult = await this.db.query(
        `SELECT COUNT(*) as count FROM game_analytics
         WHERE user_id = ? AND created_at BETWEEN ? AND ?`,
        [userId, start.toISOString(), end.toISOString()]
      );
      const games = gamesResult[0];

      // TODO: Implement storage and bandwidth tracking
      const storageUsed = 0;
      const bandwidthUsed = 0;

      return {
        userId,
        periodStart: start,
        periodEnd: end,
        apiCalls: apiCalls?.count || 0,
        gamesPlayed: games?.count || 0,
        storageUsed,
        bandwidthUsed,
      };
    } catch (error) {
      logger.error('Failed to get subscription usage', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user can perform action based on tier limits
   */
  async checkTierLimit(
    userId: string,
    action: 'api_calls' | 'games' | 'storage' | 'bandwidth',
    increment: number = 1
  ): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const tier = SUBSCRIPTION_TIERS[subscription.tierId];

      if (!tier) {
        throw new Error(`Invalid tier: ${subscription.tierId}`);
      }

      // Get current usage
      const usage = await this.getSubscriptionUsage(userId);

      let current = 0;
      let limit = 0;

      switch (action) {
        case 'api_calls':
          current = usage.apiCalls;
          limit = tier.features.maxApiCalls;
          break;
        case 'games':
          current = usage.gamesPlayed;
          limit = tier.features.maxGames;
          break;
        case 'storage':
          current = usage.storageUsed;
          limit = tier.features.maxStorageGB * 1024 * 1024 * 1024; // Convert GB to bytes
          break;
        case 'bandwidth':
          current = usage.bandwidthUsed;
          limit = tier.features.maxBandwidthGB * 1024 * 1024 * 1024; // Convert GB to bytes
          break;
      }

      const allowed = limit === -1 || current + increment <= limit;
      const remaining = Math.max(0, limit - current);

      return { allowed, current, limit, remaining };
    } catch (error) {
      logger.error('Failed to check tier limit', { error, userId, action });
      // Default to allowing on error
      return { allowed: true, current: 0, limit: -1, remaining: -1 };
    }
  }

  /**
   * Get billing history
   */
  async getBillingHistory(userId: string, limit: number = 10, offset: number = 0): Promise<any[]> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription?.stripeCustomerId) {
        return [];
      }

      // Note: Stripe doesn't support offset in list API, so we'll fetch more and paginate manually
      const invoices = await this.paymentService.stripe.invoices.list({
        customer: subscription.stripeCustomerId,
        limit: limit + (offset || 0), // Fetch extra to account for offset
        expand: ['data.payment_intent'],
      });

      // Apply offset manually
      const startIndex = offset || 0;
      const paginatedInvoices = invoices.data.slice(startIndex, startIndex + limit);

      return paginatedInvoices.map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        total: invoice.total,
        currency: invoice.currency,
        created: new Date(invoice.created * 1000),
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        paid: invoice.paid,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        lines: invoice.lines.data.map((line) => ({
          description: line.description,
          amount: line.amount,
          currency: line.currency,
          period: {
            start: new Date(line.period.start * 1000),
            end: new Date(line.period.end * 1000),
          },
        })),
      }));
    } catch (error) {
      logger.error('Failed to get billing history', { error, userId });
      return [];
    }
  }

  /**
   * Get upcoming invoice
   */
  async getUpcomingInvoice(userId: string): Promise<any | null> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription?.stripeSubscriptionId || subscription.cancelAtPeriodEnd) {
        return null;
      }

      const invoice = await this.paymentService.stripe.invoices.retrieveUpcoming({
        subscription: subscription.stripeSubscriptionId,
      });

      return {
        id: invoice.id,
        amount: invoice.amount_due,
        currency: invoice.currency,
        date: new Date(invoice.period_end * 1000),
        lines: invoice.lines.data.map((line) => ({
          description: line.description,
          amount: line.amount,
          currency: line.currency,
        })),
      };
    } catch (error) {
      logger.error('Failed to get upcoming invoice', { error, userId });
      return null;
    }
  }

  /**
   * Sync subscription from Stripe webhook
   */
  async syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<void> {
    try {
      const stripeSubscription =
        await this.paymentService.stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Find user by Stripe customer ID
      const userResult = await this.db.query(
        `SELECT user_id FROM user_subscriptions WHERE stripe_customer_id = ?`,
        [stripeSubscription.customer as string]
      );
      const user = userResult[0];

      if (!user) {
        logger.warn('No user found for Stripe subscription', { stripeSubscriptionId });
        return;
      }

      // Determine tier based on price
      const priceId = stripeSubscription.items.data[0]?.price?.id;
      const tierId = this.getTierIdFromPrice(priceId);

      // Update local subscription
      await this.upsertSubscription(
        user.user_id,
        tierId || 'free',
        stripeSubscription.id,
        stripeSubscription.customer as string,
        stripeSubscription.status,
        new Date(stripeSubscription.current_period_start * 1000),
        new Date(stripeSubscription.current_period_end * 1000),
        stripeSubscription.cancel_at_period_end
      );

      logger.info('Subscription synced from Stripe', {
        userId: user.user_id,
        stripeSubscriptionId,
        status: stripeSubscription.status,
      });
    } catch (error) {
      logger.error('Failed to sync subscription from Stripe', { error, stripeSubscriptionId });
    }
  }

  /**
   * Get tier ID from Stripe price ID
   */
  private getTierIdFromPrice(priceId?: string): string {
    // This should be implemented based on how you store price-to-tier mappings
    // For now, return a default
    return 'basic';
  }

  /**
   * Process subscription expired webhooks
   */
  async handleSubscriptionExpired(stripeSubscriptionId: string): Promise<void> {
    try {
      await this.updateSubscriptionStatus(
        await this.getUserIdFromSubscription(stripeSubscriptionId),
        'canceled'
      );
    } catch (error) {
      logger.error('Failed to handle subscription expired', { error, stripeSubscriptionId });
    }
  }

  /**
   * Get user ID from subscription
   */
  private async getUserIdFromSubscription(stripeSubscriptionId: string): Promise<string> {
    const result = await this.db.query(
      `SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = ?`,
      [stripeSubscriptionId]
    );
    const subscription = result[0];

    if (!subscription) {
      throw new Error('User not found for subscription');
    }

    return subscription.user_id;
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
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON user_subscriptions(stripe_customer_id)
      `);

      logger.info('Subscription tables initialized');
    } catch (error) {
      logger.error('Failed to initialize subscription tables', { error });
      throw error;
    }
  }
}

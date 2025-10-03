/**
 * Subscription service - Business logic for subscription management
 * Clean architecture with separated concerns
 */

import type { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import type {
  UserSubscription,
  SubscriptionUsage,
  UsageMetrics,
  BillingInvoice,
  UpcomingInvoice,
  SubscriptionStatus,
  Result,
  SubscriptionError,
} from '../types/subscription.js';
import {
  TierConfig,
  SUBSCRIPTION_TIERS,
  type SubscriptionFeatures,
} from '../config/subscription-tiers.js';
import { SubscriptionRepository } from '../repositories/subscription.repository.js';
import { StripeService } from './stripe.service.js';

export class SubscriptionService {
  private readonly repository: SubscriptionRepository;
  private readonly stripeService: StripeService;

  constructor(db: DatabaseProvider, stripeService: StripeService) {
    this.repository = new SubscriptionRepository(db);
    this.stripeService = stripeService;
  }

  /**
   * Get user's current subscription with fallback to free tier
   */
  async getUserSubscription(userId: string): Promise<UserSubscription> {
    try {
      const subscription = await this.repository.getCurrentSubscription(userId);

      if (!subscription) {
        // Return default free tier subscription
        return this.createDefaultFreeSubscription(userId);
      }

      return subscription;
    } catch (error) {
      logger.error('Failed to get user subscription', { error, userId });
      throw new SubscriptionError(
        'Failed to retrieve subscription',
        'GET_SUBSCRIPTION_FAILED',
        userId
      );
    }
  }

  /**
   * Create or update subscription from Stripe data
   */
  async upsertSubscription(
    userId: string,
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    tierId?: string
  ): Promise<UserSubscription> {
    try {
      // Get subscription from Stripe
      const stripeSubscription = await this.stripeService.getSubscription(stripeSubscriptionId);

      // Determine tier from price or metadata
      const finalTierId = tierId || this.extractTierIdFromSubscription(stripeSubscription);

      if (!TierConfig.isValidTier(finalTierId)) {
        throw new SubscriptionError(
          'Invalid subscription tier',
          'INVALID_TIER',
          userId,
          finalTierId
        );
      }

      const subscriptionData: Omit<UserSubscription, 'createdAt' | 'updatedAt'> = {
        userId,
        tierId: finalTierId,
        status: stripeSubscription.status as SubscriptionStatus,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        stripeSubscriptionId,
        stripeCustomerId,
      };

      const subscription = await this.repository.upsertSubscription(subscriptionData);

      logger.info('Subscription upserted', {
        userId,
        tierId: finalTierId,
        status: stripeSubscription.status,
      });

      return subscription;
    } catch (error) {
      if (error instanceof SubscriptionError) {
        throw error;
      }

      logger.error('Failed to upsert subscription', { error, userId });
      throw new SubscriptionError(
        'Failed to update subscription',
        'UPSERT_SUBSCRIPTION_FAILED',
        userId
      );
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, immediate: boolean = false): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription.stripeSubscriptionId || subscription.tierId === 'free') {
        throw new SubscriptionError(
          'No active subscription to cancel',
          'NO_SUBSCRIPTION_TO_CANCEL',
          userId
        );
      }

      if (immediate) {
        await this.stripeService.cancelSubscription(subscription.stripeSubscriptionId);
        await this.repository.updateSubscriptionStatus(userId, 'canceled');
      } else {
        await this.stripeService.updateSubscription(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        await this.repository.setCancelAtPeriodEnd(userId, true);
      }

      logger.info('Subscription canceled', { userId, immediate });
    } catch (error) {
      if (error instanceof SubscriptionError) {
        throw error;
      }

      logger.error('Failed to cancel subscription', { error, userId });
      throw new SubscriptionError(
        'Failed to cancel subscription',
        'CANCEL_SUBSCRIPTION_FAILED',
        userId
      );
    }
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(userId: string): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription.stripeSubscriptionId) {
        throw new SubscriptionError(
          'No subscription to resume',
          'NO_SUBSCRIPTION_TO_RESUME',
          userId
        );
      }

      await this.stripeService.updateSubscription(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await this.repository.setCancelAtPeriodEnd(userId, false);

      logger.info('Subscription resumed', { userId });
    } catch (error) {
      if (error instanceof SubscriptionError) {
        throw error;
      }

      logger.error('Failed to resume subscription', { error, userId });
      throw new SubscriptionError(
        'Failed to resume subscription',
        'RESUME_SUBSCRIPTION_FAILED',
        userId
      );
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
      if (!TierConfig.isValidTier(newTierId)) {
        throw new SubscriptionError('Invalid tier selected', 'INVALID_TIER', userId, newTierId);
      }

      const subscription = await this.getUserSubscription(userId);
      const newTier = TierConfig.getTier(newTierId)!;

      if (newTier.price === 0) {
        throw new SubscriptionError(
          'Cannot downgrade to free tier',
          'CANNOT_DOWNGRADE_TO_FREE',
          userId
        );
      }

      let stripeSubscription;
      let clientSecret = '';

      if (subscription.stripeSubscriptionId) {
        // Update existing subscription
        stripeSubscription = await this.stripeService.updateSubscription(
          subscription.stripeSubscriptionId,
          {
            items: [
              {
                id: (await this.stripeService.getSubscription(subscription.stripeSubscriptionId))
                  .items.data[0]?.id,
                price: await this.getOrCreatePrice(newTierId),
              },
            ],
            proration_behavior: 'create_prorations',
            default_payment_method: paymentMethodId,
          }
        );
      } else {
        // Create new subscription
        if (!subscription.stripeCustomerId) {
          throw new SubscriptionError('No payment method on file', 'NO_PAYMENT_METHOD', userId);
        }

        stripeSubscription = await this.stripeService.createSubscription(
          subscription.stripeCustomerId,
          await this.getOrCreatePrice(newTierId),
          {
            default_payment_method: paymentMethodId,
          }
        );
      }

      // Extract client secret if available
      const invoice = stripeSubscription.latest_invoice as any;
      clientSecret = invoice?.payment_intent?.client_secret || '';

      // Update local record
      await this.upsertSubscription(
        userId,
        stripeSubscription.id,
        subscription.stripeCustomerId!,
        newTierId
      );

      logger.info('Subscription tier changed', { userId, newTierId });

      return {
        subscriptionId: stripeSubscription.id,
        clientSecret,
      };
    } catch (error) {
      if (error instanceof SubscriptionError) {
        throw error;
      }

      logger.error('Failed to change subscription tier', { error, userId, newTierId });
      throw new SubscriptionError('Failed to change tier', 'CHANGE_TIER_FAILED', userId, newTierId);
    }
  }

  /**
   * Get usage metrics for a user
   */
  async getUsageMetrics(
    userId: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<SubscriptionUsage> {
    try {
      const start = periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = periodEnd || new Date();

      return await this.repository.getUsageMetrics(userId, start, end);
    } catch (error) {
      logger.error('Failed to get usage metrics', { error, userId });
      throw new SubscriptionError('Failed to get usage metrics', 'GET_USAGE_FAILED', userId);
    }
  }

  /**
   * Check if user can perform action based on tier limits
   */
  async checkTierLimit(
    userId: string,
    action: keyof SubscriptionFeatures,
    increment: number = 1
  ): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const tier = TierConfig.getTier(subscription.tierId);

      if (!tier) {
        throw new SubscriptionError(
          'Invalid subscription tier',
          'INVALID_TIER',
          userId,
          subscription.tierId
        );
      }

      const limit = tier.features[action];

      // Unlimited access
      if (limit === -1) {
        return { allowed: true, current: 0, limit: -1, remaining: -1 };
      }

      // Get current usage
      const usage = await this.getUsageMetrics(userId);
      let current = 0;

      switch (action) {
        case 'maxApiCalls':
          current = usage.apiCalls;
          break;
        case 'maxGames':
          current = usage.gamesPlayed;
          break;
        case 'maxStorageGB':
          current = usage.storageUsed;
          break;
        case 'maxBandwidthGB':
          current = usage.bandwidthUsed;
          break;
        default:
          current = 0;
      }

      const allowed = current + increment <= limit;
      const remaining = Math.max(0, limit - current);

      return { allowed, current, limit, remaining };
    } catch (error) {
      logger.error('Failed to check tier limit', { error, userId, action });
      // Default to allowing on error for better UX
      return { allowed: true, current: 0, limit: -1, remaining: -1 };
    }
  }

  /**
   * Get billing history
   */
  async getBillingHistory(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<BillingInvoice[]> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription.stripeCustomerId) {
        return [];
      }

      // Fetch more to account for offset
      const invoices = await this.stripeService.listInvoices(subscription.stripeCustomerId, {
        limit: limit + (offset || 0),
        expand: ['data.payment_intent'],
      });

      // Apply offset manually
      const startIndex = offset || 0;
      const paginatedInvoices = invoices.data.slice(startIndex, startIndex + limit);

      return paginatedInvoices.map((invoice) => ({
        id: invoice.id,
        status: invoice.status || 'unknown',
        total: invoice.total || 0,
        currency: invoice.currency || 'usd',
        created: new Date(invoice.created * 1000),
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
        paid: invoice.paid || false,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        lines: invoice.lines.data.map((line) => ({
          description: line.description || 'No description',
          amount: line.amount || 0,
          currency: line.currency || 'usd',
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
  async getUpcomingInvoice(userId: string): Promise<UpcomingInvoice | null> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription.stripeSubscriptionId || subscription.cancelAtPeriodEnd) {
        return null;
      }

      const invoice = await this.stripeService.retrieveUpcomingInvoice({
        subscription: subscription.stripeSubscriptionId,
      });

      return {
        id: invoice.id,
        amount: invoice.amount_due || 0,
        currency: invoice.currency || 'usd',
        date: new Date(invoice.period_end * 1000),
        lines: invoice.lines.data.map((line) => ({
          description: line.description || 'No description',
          amount: line.amount || 0,
          currency: line.currency || 'usd',
        })),
      };
    } catch (error) {
      logger.error('Failed to get upcoming invoice', { error, userId });
      return null;
    }
  }

  /**
   * Initialize subscription tables
   */
  async initializeTables(): Promise<void> {
    await this.repository.initializeTables();
  }

  /**
   * Create default free tier subscription
   */
  private createDefaultFreeSubscription(userId: string): UserSubscription {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      userId,
      tierId: 'free',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Extract tier ID from Stripe subscription
   */
  private extractTierIdFromSubscription(stripeSubscription: Stripe.Subscription): string {
    // Try to get from metadata first
    if (stripeSubscription.metadata?.tierId) {
      return stripeSubscription.metadata.tierId;
    }

    // Fall back to price lookup (implement price-to-tier mapping as needed)
    const priceId = stripeSubscription.items.data[0]?.price?.id;
    // This would need a mapping of price IDs to tiers
    return 'basic'; // Default fallback
  }

  /**
   * Get or create price for tier
   */
  private async getOrCreatePrice(tierId: string): Promise<string> {
    const tier = TierConfig.getTier(tierId);
    if (!tier) {
      throw new SubscriptionError('Invalid tier', 'INVALID_TIER', undefined, tierId);
    }

    // Check if we already have a price ID
    if (tier.stripePriceId) {
      return tier.stripePriceId;
    }

    // Create new price
    const price = await this.stripeService.createPrice({
      currency: tier.currency,
      unit_amount: Math.round(tier.price * 100),
      recurring: { interval: tier.interval },
      product_data: {
        name: tier.name,
        description: `${tier.name} subscription`,
      },
    });

    // Cache the price ID (in production, this should be persisted)
    tier.stripePriceId = price.id;

    return price.id;
  }
}

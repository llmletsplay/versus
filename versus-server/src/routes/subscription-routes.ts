/**
 * Subscription API routes
 * Clean, modular route handlers with proper error handling
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { SubscriptionService } from '../services/subscription-service.js';
import { StripeService } from '../services/stripe.service.js';
import { RateLimitService } from '../services/rate-limit-service.js';
import { TierConfig, SUBSCRIPTION_TIERS } from '../config/subscription-tiers.js';
import { requireAuth, validate, schemas } from '../middleware/validation.js';
import { errorHandler, errors } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import type { Variables } from '../types.js';

export function createSubscriptionRoutes(
  subscriptionService: SubscriptionService,
  stripeService: StripeService,
  rateLimitService: RateLimitService
) {
  const app = new Hono<{ Variables: Variables }>();

  // Apply error handling to all routes
  app.onError((err, c) => {
    // Convert to AppError and handle
    const appError = err instanceof Error ? err : new Error(String(err));
    console.error('Subscription route error:', appError);

    return c.json(
      {
        success: false,
        error: appError.message || 'Internal server error',
        code: 'SUBSCRIPTION_ERROR',
      },
      500
    );
  });

  /**
   * GET /current
   * Get user's current subscription and usage
   */
  app.get('/current', requireAuth(), async (c) => {
    const user = c.get('user')!;

    const [subscription, usage, upcomingInvoice] = await Promise.all([
      subscriptionService.getUserSubscription(user.userId),
      subscriptionService.getUsageMetrics(user.userId),
      subscriptionService.getUpcomingInvoice(user.userId),
    ]);

    return c.json({
      success: true,
      data: {
        subscription,
        usage,
        upcomingInvoice,
        availableTiers: Object.values(SUBSCRIPTION_TIERS).map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          currency: tier.currency,
          interval: tier.interval,
          features: tier.features,
          formattedPrice: TierConfig.formatPrice(tier),
          current: tier.id === subscription.tierId,
        })),
      },
    });
  });

  /**
   * POST /change-tier
   * Change subscription tier
   */
  app.post('/change-tier', requireAuth(), validate('json', schemas.changeTier), async (c) => {
    const user = c.get('user')!;
    const { tierId, paymentMethodId } = c.req.valid('json');

    // Check if changing to same tier
    const current = await subscriptionService.getUserSubscription(user.userId);
    if (current.tierId === tierId) {
      throw errors.badRequest('Already subscribed to this tier');
    }

    // Check if trying to downgrade to free
    const newTier = TierConfig.getTier(tierId);
    if (!newTier) {
      throw errors.badRequest('Invalid tier selected');
    }

    if (newTier.price === 0) {
      throw errors.badRequest('Cannot downgrade to free tier through API');
    }

    const result = await subscriptionService.changeTier(user.userId, tierId, paymentMethodId);

    logger.info('Subscription tier changed', {
      userId: user.userId,
      oldTier: current.tierId,
      newTier: tierId,
    });

    return c.json({
      success: true,
      data: {
        subscriptionId: result.subscriptionId,
        clientSecret: result.clientSecret,
        message: 'Payment required to complete tier change',
      },
    });
  });

  /**
   * POST /cancel
   * Cancel subscription
   */
  app.post('/cancel', requireAuth(), validate('json', schemas.cancelSubscription), async (c) => {
    const user = c.get('user')!;
    const { immediate, reason } = c.req.valid('json');

    await subscriptionService.cancelSubscription(user.userId, immediate);

    logger.info('Subscription canceled', {
      userId: user.userId,
      immediate,
      reason,
    });

    return c.json({
      success: true,
      data: {
        message: immediate
          ? 'Subscription canceled immediately'
          : 'Subscription will be canceled at period end',
      },
    });
  });

  /**
   * POST /resume
   * Resume canceled subscription
   */
  app.post('/resume', requireAuth(), async (c) => {
    const user = c.get('user')!;

    await subscriptionService.resumeSubscription(user.userId);

    logger.info('Subscription resumed', { userId: user.userId });

    return c.json({
      success: true,
      data: {
        message: 'Subscription resumed',
      },
    });
  });

  /**
   * GET /billing/history
   * Get billing history
   */
  app.get('/billing/history', requireAuth(), validate('query', schemas.pagination), async (c) => {
    const user = c.get('user')!;
    const { limit, offset } = c.req.valid('query');

    const invoices = await subscriptionService.getBillingHistory(user.userId, limit, offset);

    return c.json({
      success: true,
      data: {
        invoices,
        pagination: {
          limit,
          offset,
          hasMore: invoices.length === limit,
        },
      },
    });
  });

  /**
   * GET /billing/upcoming
   * Get upcoming invoice
   */
  app.get('/billing/upcoming', requireAuth(), async (c) => {
    const user = c.get('user')!;

    const invoice = await subscriptionService.getUpcomingInvoice(user.userId);

    if (!invoice) {
      throw errors.notFound('No upcoming invoice');
    }

    return c.json({
      success: true,
      data: { invoice },
    });
  });

  /**
   * GET /usage
   * Get detailed usage metrics
   */
  app.get('/usage', requireAuth(), validate('query', schemas.dateRange), async (c) => {
    const user = c.get('user')!;
    const { startDate, endDate } = c.req.valid('query');

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const [usage, subscription] = await Promise.all([
      subscriptionService.getUsageMetrics(user.userId, start, end),
      subscriptionService.getUserSubscription(user.userId),
    ]);

    const tier = TierConfig.getTier(subscription.tierId);
    if (!tier) {
      throw errors.internal('Invalid subscription tier');
    }

    // Calculate formatted metrics
    const metrics = {
      period: {
        start: usage.periodStart,
        end: usage.periodEnd,
      },
      apiCalls: {
        used: usage.apiCalls,
        limit: tier.features.maxApiCalls,
        remaining: Math.max(0, tier.features.maxApiCalls - usage.apiCalls),
        percentage:
          tier.features.maxApiCalls === -1 ? 0 : (usage.apiCalls / tier.features.maxApiCalls) * 100,
      },
      games: {
        used: usage.gamesPlayed,
        limit: tier.features.maxGames,
        remaining: Math.max(0, tier.features.maxGames - usage.gamesPlayed),
        percentage:
          tier.features.maxGames === -1 ? 0 : (usage.gamesPlayed / tier.features.maxGames) * 100,
      },
      storage: {
        used: usage.storageUsed,
        limit: tier.features.maxStorageGB * 1024 * 1024 * 1024, // Convert GB to bytes
        usedFormatted: formatBytes(usage.storageUsed),
        limitFormatted:
          tier.features.maxStorageGB === -1 ? 'Unlimited' : `${tier.features.maxStorageGB} GB`,
        remaining: Math.max(0, tier.features.maxStorageGB * 1024 * 1024 * 1024 - usage.storageUsed),
        percentage:
          tier.features.maxStorageGB === -1
            ? 0
            : (usage.storageUsed / (tier.features.maxStorageGB * 1024 * 1024 * 1024)) * 100,
      },
      bandwidth: {
        used: usage.bandwidthUsed,
        limit: tier.features.maxBandwidthGB * 1024 * 1024 * 1024, // Convert GB to bytes
        usedFormatted: formatBytes(usage.bandwidthUsed),
        limitFormatted:
          tier.features.maxBandwidthGB === -1 ? 'Unlimited' : `${tier.features.maxBandwidthGB} GB`,
        remaining: Math.max(
          0,
          tier.features.maxBandwidthGB * 1024 * 1024 * 1024 - usage.bandwidthUsed
        ),
        percentage:
          tier.features.maxBandwidthGB === -1
            ? 0
            : (usage.bandwidthUsed / (tier.features.maxBandwidthGB * 1024 * 1024 * 1024)) * 100,
      },
    };

    return c.json({
      success: true,
      data: {
        subscription,
        metrics,
      },
    });
  });

  /**
   * POST /checkout
   * Create checkout session for new subscription
   */
  app.post(
    '/checkout',
    requireAuth(),
    validate(
      'json',
      z.object({
        tierId: schemas.tierId,
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    ),
    async (c) => {
      const user = c.get('user')!;
      const { tierId, successUrl, cancelUrl } = c.req.valid('json');

      const tier = TierConfig.getTier(tierId);
      if (!tier || tier.price === 0) {
        throw errors.badRequest('Invalid tier for checkout');
      }

      // Get or create Stripe customer
      let customerId = await stripeService.getCustomerId(user.userId);
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.email, user.email.split('@')[0], {
          userId: user.userId,
        });
        customerId = customer.id;
      }

      // Create checkout session
      const session = await stripeService.createSubscriptionCheckoutSession(
        customerId,
        await getOrCreatePriceId(tierId, stripeService),
        successUrl,
        cancelUrl,
        { userId: user.userId, tierId }
      );

      return c.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    }
  );

  return app;
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get or create price ID for tier
 * In production, this should be cached in the database
 */
async function getOrCreatePriceId(tierId: string, stripeService: StripeService): Promise<string> {
  const tier = TierConfig.getTier(tierId);
  if (!tier) {
    throw errors.badRequest('Invalid tier');
  }

  if (tier.stripePriceId) {
    return tier.stripePriceId;
  }

  const price = await stripeService.createPrice({
    currency: tier.currency,
    unit_amount: Math.round(tier.price * 100),
    recurring: { interval: tier.interval },
    product_data: {
      name: tier.name,
      description: `${tier.name} subscription`,
    },
  });

  // In production, persist this to database
  tier.stripePriceId = price.id;

  return price.id;
}

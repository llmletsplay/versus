import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { PaymentService, SUBSCRIPTION_TIERS } from '../services/payment-service.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import type { Variables } from '../types.js';

const checkoutSessionSchema = z.object({
  tierId: z.enum(['basic', 'pro', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const oneTimePaymentSchema = z.object({
  amount: z.number().min(0.5),
  description: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export function createPaymentRoutes(paymentService: PaymentService) {
  const app = new Hono<{ Variables: Variables }>();

  /**
   * GET /tiers
   * Get all available subscription tiers
   */
  app.get('/tiers', async (c) => {
    try {
      const tiers = Object.values(SUBSCRIPTION_TIERS).map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        currency: tier.currency,
        interval: tier.interval,
        features: tier.features,
      }));

      return c.json({
        success: true,
        data: tiers,
      });
    } catch (error) {
      logger.error('Failed to get subscription tiers', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get subscription tiers',
          code: 'TIERS_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /subscription
   * Get current user's subscription
   */
  app.get('/subscription', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const subscription = await paymentService.getUserSubscription(user.userId);
      const tier = await paymentService.getUserTier(user.userId);

      return c.json({
        success: true,
        data: {
          subscription,
          tier,
          features: tier.features,
        },
      });
    } catch (error) {
      logger.error('Failed to get user subscription', { error, userId: user.userId });
      return c.json(
        {
          success: false,
          error: 'Failed to get subscription',
          code: 'SUBSCRIPTION_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /checkout/subscription
   * Create checkout session for subscription
   */
  app.post('/checkout/subscription', zValidator('json', checkoutSessionSchema), async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const { tierId, successUrl, cancelUrl } = c.req.valid('json');

      // Check if user already has active subscription
      const currentSubscription = await paymentService.getUserSubscription(user.userId);
      if (currentSubscription && currentSubscription.status === 'active') {
        return c.json(
          {
            success: false,
            error: 'You already have an active subscription',
            code: 'ALREADY_SUBSCRIBED',
          },
          400
        );
      }

      // Get user info
      const userInfo = await c
        .get('db')
        .get('SELECT email, username FROM users WHERE id = $1', [user.userId]);

      if (!userInfo) {
        return c.json(
          {
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          },
          404
        );
      }

      // Create Stripe customer if needed
      await paymentService.createCustomer(user.userId, userInfo.email, userInfo.username);

      // Create checkout session
      const checkoutUrl = await paymentService.createSubscriptionCheckoutSession(
        user.userId,
        tierId,
        successUrl,
        cancelUrl
      );

      logger.info('Created subscription checkout', {
        userId: user.userId,
        tierId,
      });

      return c.json({
        success: true,
        data: {
          checkoutUrl,
        },
      });
    } catch (error) {
      logger.error('Failed to create subscription checkout', {
        error,
        userId: user.userId,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to create checkout session',
          code: 'CHECKOUT_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /checkout/payment
   * Create checkout session for one-time payment
   */
  app.post('/checkout/payment', zValidator('json', oneTimePaymentSchema), async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const { amount, description, successUrl, cancelUrl } = c.req.valid('json');

      // Get user info
      const userInfo = await c
        .get('db')
        .get('SELECT email, username FROM users WHERE id = $1', [user.userId]);

      if (!userInfo) {
        return c.json(
          {
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          },
          404
        );
      }

      // Create Stripe customer if needed
      await paymentService.createCustomer(user.userId, userInfo.email, userInfo.username);

      // Create checkout session
      const checkoutUrl = await paymentService.createOneTimePaymentCheckoutSession(
        user.userId,
        amount,
        description,
        successUrl,
        cancelUrl
      );

      logger.info('Created one-time payment checkout', {
        userId: user.userId,
        amount,
        description,
      });

      return c.json({
        success: true,
        data: {
          checkoutUrl,
        },
      });
    } catch (error) {
      logger.error('Failed to create payment checkout', {
        error,
        userId: user.userId,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to create checkout session',
          code: 'CHECKOUT_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /cancel
   * Cancel subscription
   */
  app.post(
    '/cancel',
    zValidator(
      'json',
      z.object({
        atPeriodEnd: z.boolean().default(true),
      })
    ),
    async (c) => {
      const user = c.get('user');
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'NO_AUTH',
          },
          401
        );
      }

      try {
        const { atPeriodEnd } = c.req.valid('json');
        await paymentService.cancelSubscription(user.userId, atPeriodEnd);

        logger.info('Subscription canceled', { userId: user.userId, atPeriodEnd });

        return c.json({
          success: true,
          message: atPeriodEnd
            ? 'Subscription will be canceled at the end of the billing period'
            : 'Subscription canceled immediately',
        });
      } catch (error) {
        logger.error('Failed to cancel subscription', {
          error,
          userId: user.userId,
        });
        return c.json(
          {
            success: false,
            error: 'Failed to cancel subscription',
            code: 'CANCEL_ERROR',
          },
          500
        );
      }
    }
  );

  /**
   * GET /payment-methods
   * Get customer's payment methods
   */
  app.get('/payment-methods', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const paymentMethods = await paymentService.getPaymentMethods(user.userId);

      return c.json({
        success: true,
        data: paymentMethods,
      });
    } catch (error) {
      logger.error('Failed to get payment methods', {
        error,
        userId: user.userId,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to get payment methods',
          code: 'PAYMENT_METHODS_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /billing-history
   * Get billing history
   */
  app.get('/billing-history', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const limit = parseInt(c.req.query('limit') || '20');
      const billingHistory = await paymentService.getBillingHistory(user.userId, limit);

      return c.json({
        success: true,
        data: billingHistory,
      });
    } catch (error) {
      logger.error('Failed to get billing history', {
        error,
        userId: user.userId,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to get billing history',
          code: 'BILLING_HISTORY_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /webhook
   * Handle Stripe webhooks
   */
  app.post('/webhook/stripe', async (c) => {
    try {
      const body = await c.req.text();
      const signature = c.req.header('stripe-signature');
      const webhookSecret = config.get('stripeWebhookSecret');

      if (!signature || !webhookSecret) {
        return c.json(
          {
            success: false,
            error: 'Webhook signature missing',
          },
          400
        );
      }

      await paymentService.processWebhook(body, signature, webhookSecret);

      return c.json({ received: true });
    } catch (error) {
      logger.error('Webhook processing failed', { error });
      return c.json(
        {
          success: false,
          error: 'Webhook processing failed',
        },
        400
      );
    }
  });

  /**
   * GET /usage
   * Get current usage statistics for the user
   */
  app.get('/usage', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const tier = await paymentService.getUserTier(user.userId);
      const db = c.get('db');

      // Get current usage
      const currentGames = await db.get(
        'SELECT COUNT(*) as count FROM games WHERE creator_id = $1 AND status != $2',
        [user.userId, 'finished']
      );

      const apiCallsThisMonth = await db.get(
        'SELECT COUNT(*) as count FROM api_usage WHERE user_id = $1 AND created_at > $2',
        [user.userId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).getTime()]
      );

      const usage = {
        games: {
          current: currentGames?.count || 0,
          max: tier.features.maxGames,
          percentage:
            tier.features.maxGames === -1
              ? 0
              : ((currentGames?.count || 0) / tier.features.maxGames) * 100,
        },
        apiCalls: {
          current: apiCallsThisMonth?.count || 0,
          max: tier.features.maxApiCalls,
          percentage:
            tier.features.maxApiCalls === -1
              ? 0
              : ((apiCallsThisMonth?.count || 0) / tier.features.maxApiCalls) * 100,
        },
        features: tier.features,
      };

      return c.json({
        success: true,
        data: usage,
      });
    } catch (error) {
      logger.error('Failed to get usage statistics', {
        error,
        userId: user.userId,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to get usage statistics',
          code: 'USAGE_ERROR',
        },
        500
      );
    }
  });

  return app;
}

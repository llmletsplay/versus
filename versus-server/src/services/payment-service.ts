import Stripe from 'stripe';
import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: {
    maxGames: number;
    maxApiCalls: number;
    maxStorageGB: number;
    maxBandwidthGB: number;
    customRooms: boolean;
    analytics: boolean;
    tournaments: boolean;
    prioritySupport: boolean;
    adFree: boolean;
  };
  stripePriceId?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  tierId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

// Subscription tiers configuration
export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: {
      maxGames: 5,
      maxApiCalls: 1000,
      maxStorageGB: 1,
      maxBandwidthGB: 10,
      customRooms: false,
      analytics: false,
      tournaments: false,
      prioritySupport: false,
      adFree: false,
    },
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    features: {
      maxGames: 50,
      maxApiCalls: 10000,
      maxStorageGB: 10,
      maxBandwidthGB: 100,
      customRooms: true,
      analytics: true,
      tournaments: false,
      prioritySupport: false,
      adFree: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    currency: 'USD',
    interval: 'month',
    features: {
      maxGames: 500,
      maxApiCalls: 100000,
      maxStorageGB: 100,
      maxBandwidthGB: 1000,
      customRooms: true,
      analytics: true,
      tournaments: true,
      prioritySupport: true,
      adFree: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    currency: 'USD',
    interval: 'month',
    features: {
      maxGames: -1, // Unlimited
      maxApiCalls: -1, // Unlimited
      maxStorageGB: -1, // Unlimited
      maxBandwidthGB: -1, // Unlimited
      customRooms: true,
      analytics: true,
      tournaments: true,
      prioritySupport: true,
      adFree: true,
    },
  },
};

export class PaymentService {
  public stripe: Stripe;
  private db: DatabaseProvider;
  public SUBSCRIPTION_TIERS = SUBSCRIPTION_TIERS;

  constructor(stripeSecretKey: string, db: DatabaseProvider) {
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    });
    this.db = db;
  }

  /**
   * Create a Stripe customer for a user
   */
  async createCustomer(userId: string, email: string, name?: string): Promise<string> {
    try {
      // Check if customer already exists
      const existingCustomer = await this.getCustomerByUserId(userId);
      if (existingCustomer) {
        return existingCustomer;
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });

      // Save customer ID to database
      await this.db.execute('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
        customer.id,
        userId,
      ]);

      logger.info('Created Stripe customer', { userId, customerId: customer.id });
      return customer.id;
    } catch (error) {
      logger.error('Failed to create Stripe customer', { error, userId });
      throw error;
    }
  }

  /**
   * Get Stripe customer ID by user ID
   */
  async getCustomerByUserId(userId: string): Promise<string | null> {
    try {
      const result = await this.db.get('SELECT stripe_customer_id FROM users WHERE id = $1', [
        userId,
      ]);
      return result?.stripe_customer_id || null;
    } catch (error) {
      logger.error('Failed to get customer ID', { error, userId });
      return null;
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createSubscriptionCheckoutSession(
    userId: string,
    tierId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    try {
      const tier = SUBSCRIPTION_TIERS[tierId];
      if (!tier || tier.price === 0) {
        throw new Error('Invalid tier selected');
      }

      // Get or create customer
      const customerId = await this.getCustomerByUserId(userId);
      if (!customerId) {
        throw new Error('Customer not found');
      }

      // Create or retrieve price
      let priceId = tier.stripePriceId;
      if (!priceId) {
        const price = await this.stripe.prices.create({
          currency: tier.currency,
          unit_amount: Math.round(tier.price * 100),
          recurring: { interval: tier.interval },
          product_data: {
            name: tier.name,
            description: `${tier.name} subscription - ${tier.features}`,
          },
        });
        priceId = price.id;
        tier.stripePriceId = priceId;
      }

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          tierId,
        },
        subscription_data: {
          metadata: {
            tierId,
          },
        },
      });

      logger.info('Created checkout session', { userId, sessionId: session.id });
      return session.url!;
    } catch (error) {
      logger.error('Failed to create checkout session', { error, userId, tierId });
      throw error;
    }
  }

  /**
   * Create a one-time payment session (for tournaments, etc.)
   */
  async createOneTimePaymentCheckoutSession(
    userId: string,
    amount: number,
    description: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    try {
      const customerId = await this.getCustomerByUserId(userId);
      if (!customerId) {
        throw new Error('Customer not found');
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'USD',
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: description,
                description,
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          type: 'one_time',
        },
      });

      logger.info('Created one-time payment session', { userId, amount });
      return session.url!;
    } catch (error) {
      logger.error('Failed to create one-time payment session', { error, userId });
      throw error;
    }
  }

  /**
   * Process webhook from Stripe
   */
  async processWebhook(body: string, signature: string, webhookSecret: string): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);

      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          await this.handleCheckoutCompleted(session);
          break;

        case 'invoice.payment_succeeded':
          const invoice = event.data.object as Stripe.Invoice;
          await this.handlePaymentSucceeded(invoice);
          break;

        case 'invoice.payment_failed':
          const failedInvoice = event.data.object as Stripe.Invoice;
          await this.handlePaymentFailed(failedInvoice);
          break;

        case 'customer.subscription.deleted':
          const subscription = event.data.object as Stripe.Subscription;
          await this.handleSubscriptionDeleted(subscription);
          break;

        default:
          logger.warn('Unhandled webhook event', { type: event.type });
      }
    } catch (error) {
      logger.error('Webhook processing failed', { error });
      throw error;
    }
  }

  /**
   * Handle successful checkout
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await this.stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await this.createOrUpdateSubscription(session.metadata?.userId!, subscription);

        logger.info('Subscription activated', {
          userId: session.metadata?.userId,
          subscriptionId: subscription.id,
        });
      }
    } catch (error) {
      logger.error('Failed to handle checkout completion', { error, session });
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (invoice.subscription) {
        const subscription = await this.stripe.subscriptions.retrieve(
          invoice.subscription as string
        );

        await this.updateSubscriptionStatus(
          subscription.id,
          'active',
          subscription.current_period_start * 1000,
          subscription.current_period_end * 1000
        );
      }
    } catch (error) {
      logger.error('Failed to handle payment success', { error, invoice });
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (invoice.subscription) {
        await this.updateSubscriptionStatus(
          invoice.subscription as string,
          'past_due',
          new Date().getTime(),
          new Date().getTime()
        );
      }
    } catch (error) {
      logger.error('Failed to handle payment failure', { error, invoice });
    }
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      await this.db.execute(
        'UPDATE subscriptions SET status = $1, cancel_at_period_end = true WHERE stripe_subscription_id = $2',
        ['canceled', subscription.id]
      );

      logger.info('Subscription canceled', { subscriptionId: subscription.id });
    } catch (error) {
      logger.error('Failed to handle subscription deletion', { error, subscription });
    }
  }

  /**
   * Create or update subscription in database
   */
  private async createOrUpdateSubscription(
    userId: string,
    stripeSubscription: Stripe.Subscription
  ): Promise<void> {
    const tierId = stripeSubscription.metadata?.tierId || 'free';

    await this.db.execute(
      `
      INSERT INTO subscriptions (
        id, user_id, tier_id, status, current_period_start,
        current_period_end, stripe_subscription_id, cancel_at_period_end,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = EXCLUDED.updated_at
    `,
      [
        stripeSubscription.id,
        userId,
        tierId,
        stripeSubscription.status,
        stripeSubscription.current_period_start * 1000,
        stripeSubscription.current_period_end * 1000,
        stripeSubscription.id,
        stripeSubscription.cancel_at_period_end,
        new Date().getTime(),
        new Date().getTime(),
      ]
    );
  }

  /**
   * Update subscription status
   */
  private async updateSubscriptionStatus(
    stripeSubscriptionId: string,
    status: string,
    currentPeriodStart: number,
    currentPeriodEnd: number
  ): Promise<void> {
    await this.db.execute(
      'UPDATE subscriptions SET status = $1, current_period_start = $2, current_period_end = $3, updated_at = $4 WHERE stripe_subscription_id = $5',
      [status, currentPeriodStart, currentPeriodEnd, new Date().getTime(), stripeSubscriptionId]
    );
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, atPeriodEnd: boolean = true): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      if (atPeriodEnd) {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

        await this.db.execute(
          'UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1',
          [subscription.id]
        );
      } else {
        await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        await this.db.execute('UPDATE subscriptions SET status = $1 WHERE id = $2', [
          'canceled',
          subscription.id,
        ]);
      }

      logger.info('Subscription canceled', { userId, atPeriodEnd });
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Get user's subscription
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    try {
      const result = await this.db.get(
        `
        SELECT * FROM subscriptions
        WHERE user_id = $1 AND status IN ('active', 'past_due', 'unpaid')
        ORDER BY created_at DESC LIMIT 1
      `,
        [userId]
      );

      return result || null;
    } catch (error) {
      logger.error('Failed to get user subscription', { error, userId });
      return null;
    }
  }

  /**
   * Get user's current tier
   */
  async getUserTier(userId: string): Promise<SubscriptionTier> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription || subscription.status !== 'active') {
        return SUBSCRIPTION_TIERS.free;
      }

      return SUBSCRIPTION_TIERS[subscription.tierId] || SUBSCRIPTION_TIERS.free;
    } catch (error) {
      logger.error('Failed to get user tier', { error, userId });
      return SUBSCRIPTION_TIERS.free;
    }
  }

  /**
   * Check if user has feature access
   */
  async hasFeatureAccess(
    userId: string,
    feature: keyof SubscriptionTier['features']
  ): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    return tier.features[feature];
  }

  /**
   * Get customer's payment methods
   */
  async getPaymentMethods(userId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const customerId = await this.getCustomerByUserId(userId);
      if (!customerId) {
        throw new Error('Customer not found');
      }

      const paymentMethods = await this.stripe.customers.listPaymentMethods(customerId);
      return paymentMethods.data;
    } catch (error) {
      logger.error('Failed to get payment methods', { error, userId });
      throw error;
    }
  }

  /**
   * Get billing history
   */
  async getBillingHistory(userId: string, limit: number = 20): Promise<Stripe.Invoice[]> {
    try {
      const customerId = await this.getCustomerByUserId(userId);
      if (!customerId) {
        throw new Error('Customer not found');
      }

      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      logger.error('Failed to get billing history', { error, userId });
      throw error;
    }
  }

  /**
   * Create checkout session
   */
  async createCheckoutSession(
    userId: string,
    tierId: string,
    paymentMethodId?: string
  ): Promise<Stripe.Checkout.Session> {
    try {
      const tier = SUBSCRIPTION_TIERS[tierId];
      if (!tier) {
        throw new Error('Invalid tier');
      }

      const customerId = await this.getCustomerByUserId(userId);
      if (!customerId) {
        throw new Error('Customer not found');
      }

      const priceId = await this.getOrCreatePrice(tierId);

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.CLIENT_URL}/billing?success=true`,
        cancel_url: `${process.env.CLIENT_URL}/billing?canceled=true`,
        metadata: {
          userId,
          tierId,
        },
      });

      return session;
    } catch (error) {
      logger.error('Failed to create checkout session', { error, userId });
      throw error;
    }
  }

  /**
   * Get or create price for tier
   */
  async getOrCreatePrice(tierId: string): Promise<string> {
    try {
      const tier = SUBSCRIPTION_TIERS[tierId];
      if (!tier) {
        throw new Error('Invalid tier');
      }

      // For now, return a mock price ID - in production, you'd create/retrieve from Stripe
      return `price_${tierId}_${tier.price}_${tier.currency}`;
    } catch (error) {
      logger.error('Failed to get or create price', { error, tierId });
      throw error;
    }
  }
}

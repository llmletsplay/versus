/**
 * Stripe service - Handles all Stripe API operations
 * Separates Stripe concerns from business logic
 */

import Stripe from 'stripe';
import { logger } from '../utils/logger.js';
import type { Result, PaymentError } from '../types/subscription.js';

export class StripeService {
  public readonly stripe: Stripe;

  constructor(stripeSecretKey: string) {
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    });
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(
    email: string,
    name?: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata,
      });

      logger.info('Created Stripe customer', { customerId: customer.id, email });
      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', { error, email });
      throw new PaymentError('Failed to create customer', 'CREATE_CUSTOMER_FAILED', error);
    }
  }

  /**
   * Get a customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return customer.deleted ? null : customer;
    } catch (error) {
      logger.error('Failed to retrieve Stripe customer', { error, customerId });
      throw new PaymentError('Failed to retrieve customer', 'GET_CUSTOMER_FAILED', error);
    }
  }

  /**
   * Create a price
   */
  async createPrice(params: Stripe.PriceCreateParams): Promise<Stripe.Price> {
    try {
      const price = await this.stripe.prices.create(params);
      logger.info('Created Stripe price', { priceId: price.id });
      return price;
    } catch (error) {
      logger.error('Failed to create Stripe price', { error, params });
      throw new PaymentError('Failed to create price', 'CREATE_PRICE_FAILED', error);
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createSubscriptionCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: {
          metadata,
        },
      });

      logger.info('Created subscription checkout session', { sessionId: session.id });
      return session;
    } catch (error) {
      logger.error('Failed to create checkout session', { error, customerId, priceId });
      throw new PaymentError(
        'Failed to create checkout session',
        'CREATE_CHECKOUT_SESSION_FAILED',
        error
      );
    }
  }

  /**
   * Create a one-time payment session
   */
  async createPaymentSession(
    customerId: string,
    amount: number,
    currency: string,
    description: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: Math.round(amount * 100),
              product_data: { name: description, description },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      });

      logger.info('Created payment session', { sessionId: session.id, amount });
      return session;
    } catch (error) {
      logger.error('Failed to create payment session', { error, amount });
      throw new PaymentError(
        'Failed to create payment session',
        'CREATE_PAYMENT_SESSION_FAILED',
        error
      );
    }
  }

  /**
   * Retrieve a subscription
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Failed to retrieve subscription', { error, subscriptionId });
      throw new PaymentError('Failed to retrieve subscription', 'GET_SUBSCRIPTION_FAILED', error);
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, params);
      logger.info('Updated Stripe subscription', { subscriptionId });
      return subscription;
    } catch (error) {
      logger.error('Failed to update subscription', { error, subscriptionId, params });
      throw new PaymentError('Failed to update subscription', 'UPDATE_SUBSCRIPTION_FAILED', error);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionCancelParams = {}
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.cancel(subscriptionId, params);
      logger.info('Cancelled Stripe subscription', { subscriptionId });
      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, subscriptionId });
      throw new PaymentError('Failed to cancel subscription', 'CANCEL_SUBSCRIPTION_FAILED', error);
    }
  }

  /**
   * Create a subscription directly
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    params: Stripe.SubscriptionCreateParams = {}
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        ...params,
      });

      logger.info('Created Stripe subscription', { subscriptionId: subscription.id });
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { error, customerId, priceId });
      throw new PaymentError(
        'Failed to create subscription',
        'CREATE_SUBSCRIPTION_DIRECT_FAILED',
        error
      );
    }
  }

  /**
   * List invoices for a customer
   */
  async listInvoices(
    customerId: string,
    params: Stripe.InvoiceListParams = {}
  ): Promise<Stripe.ApiList<Stripe.Invoice>> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        ...params,
      });
      return invoices;
    } catch (error) {
      logger.error('Failed to list invoices', { error, customerId });
      throw new PaymentError('Failed to list invoices', 'LIST_INVOICES_FAILED', error);
    }
  }

  /**
   * Retrieve upcoming invoice
   */
  async retrieveUpcomingInvoice(
    params: Stripe.InvoiceRetrieveUpcomingParams
  ): Promise<Stripe.Invoice> {
    try {
      const invoice = await this.stripe.invoices.retrieveUpcoming(params);
      return invoice;
    } catch (error) {
      logger.error('Failed to retrieve upcoming invoice', { error, params });
      throw new PaymentError(
        'Failed to retrieve upcoming invoice',
        'RETRIEVE_UPCOMING_INVOICE_FAILED',
        error
      );
    }
  }

  /**
   * List payment methods for a customer
   */
  async listPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethod.Type = 'card'
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    try {
      const paymentMethods = await this.stripe.customers.listPaymentMethods(customerId, {
        type,
      });
      return paymentMethods;
    } catch (error) {
      logger.error('Failed to list payment methods', { error, customerId });
      throw new PaymentError(
        'Failed to list payment methods',
        'LIST_PAYMENT_METHODS_FAILED',
        error
      );
    }
  }

  /**
   * Construct webhook event
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      logger.error('Failed to construct webhook event', { error });
      throw new PaymentError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID', error);
    }
  }
}

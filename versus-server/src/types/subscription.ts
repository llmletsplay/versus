/**
 * Subscription-related type definitions
 */

import type { SubscriptionTier } from '../config/subscription-tiers.js';

export interface UserSubscription {
  userId: string;
  tierId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'unrecognized';

export interface SubscriptionUsage {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  apiCalls: number;
  gamesPlayed: number;
  storageUsed: number;
  bandwidthUsed: number;
}

export interface UsageMetrics {
  apiCalls: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  games: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  storage: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
    usedFormatted: string;
    limitFormatted: string;
  };
  bandwidth: {
    used: number;
    limit: number;
    remaining: number;
    percentage: number;
    usedFormatted: string;
    limitFormatted: string;
  };
}

export interface BillingInvoice {
  id: string;
  status: string;
  total: number;
  currency: string;
  created: Date;
  dueDate?: Date;
  paid: boolean;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  lines: BillingInvoiceLine[];
}

export interface BillingInvoiceLine {
  description: string;
  amount: number;
  currency: string;
  period: {
    start: Date;
    end: Date;
  };
}

export interface UpcomingInvoice {
  id: string;
  amount: number;
  currency: string;
  date: Date;
  lines: BillingInvoiceLine[];
}

// Error types for better error handling
export class SubscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userId?: string,
    public readonly tierId?: string
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stripeError?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// Result type for better error handling
export type Result<T, E = Error> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: E;
    };

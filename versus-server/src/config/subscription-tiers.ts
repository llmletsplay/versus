/**
 * Subscription tier configuration
 * Centralized configuration for all subscription plans
 */

export interface SubscriptionFeatures {
  maxGames: number;
  maxApiCalls: number;
  maxStorageGB: number;
  maxBandwidthGB: number;
  customRooms: boolean;
  analytics: boolean;
  tournaments: boolean;
  prioritySupport: boolean;
  adFree: boolean;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: SubscriptionFeatures;
  stripePriceId?: string;
}

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

// Helper functions for tier validation and operations
export class TierConfig {
  static getTier(tierId: string): SubscriptionTier | null {
    return SUBSCRIPTION_TIERS[tierId] || null;
  }

  static isValidTier(tierId: string): boolean {
    return tierId in SUBSCRIPTION_TIERS;
  }

  static getTierLimit(tierId: string, feature: keyof SubscriptionFeatures): number | boolean {
    const tier = this.getTier(tierId);
    return tier?.features[feature] ?? false;
  }

  static isUnlimited(value: number): boolean {
    return value === -1;
  }

  static formatPrice(tier: SubscriptionTier): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: tier.currency,
    }).format(tier.price);
  }
}

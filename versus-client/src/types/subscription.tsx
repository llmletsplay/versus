/**
 * Shared subscription type definitions
 * Centralized to avoid duplication across components
 */

export interface Subscription {
  userId: string;
  tierId: string;
  status: "active" | "canceled" | "past_due" | "unpaid";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
}

export interface UsageMetrics {
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
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
  };
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: "month" | "year";
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
  current: boolean;
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

// Helper functions for subscription data
export const subscriptionHelpers = {
  formatPrice: (price: number, currency: string = "USD"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(price);
  },

  formatDate: (date: Date): string => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  },

  getTierName: (tierId: string): string => {
    const names: Record<string, string> = {
      free: "Free",
      basic: "Basic",
      pro: "Pro",
      enterprise: "Enterprise",
    };
    return names[tierId] || tierId;
  },

  getStatusColor: (status: string): string => {
    const colors: Record<string, string> = {
      active: "text-green-600",
      canceled: "text-red-600",
      past_due: "text-yellow-600",
      unpaid: "text-red-600",
    };
    return colors[status] || "text-gray-600";
  },

  getStatusText: (status: string, cancelAtPeriodEnd: boolean): string => {
    if (cancelAtPeriodEnd && status === "active") {
      return "Active (cancels at period end)";
    }
    return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  },

  formatBytes: (bytes: number): string => {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  },

  isUnlimited: (value: number): boolean => {
    return value === -1;
  },

  getPercentage: (used: number, limit: number): number => {
    if (limit === -1) return 0;
    return Math.min(100, Math.max(0, (used / limit) * 100));
  },
};

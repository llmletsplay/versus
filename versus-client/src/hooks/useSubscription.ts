import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface Subscription {
  userId: string;
  tierId: string;
  status: "active" | "canceled" | "past_due" | "unpaid";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
}

interface UsageMetrics {
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

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSubscription();
    } else {
      setSubscription(null);
      setUsage(null);
      setLoading(false);
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/subscriptions/current");

      if (response.ok) {
        const data = await response.json();
        setSubscription(data.data.subscription);
        setUsage(data.data.usage);
      } else {
        setSubscription(null);
        setUsage(null);
      }
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
      toast.error("Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  };

  const canPerformAction = async (
    action: "api_calls" | "games" | "storage" | "bandwidth",
  ) => {
    if (!usage) return true;

    const metrics = usage.metrics[action as keyof typeof usage.metrics] as any;
    return metrics.limit === -1 || metrics.remaining > 0;
  };

  const getRemainingCount = (
    action: "api_calls" | "games" | "storage" | "bandwidth",
  ) => {
    if (!usage) return 0;

    const metrics = usage.metrics[action as keyof typeof usage.metrics] as any;
    return metrics.remaining;
  };

  const isOnTier = (tierId: string) => {
    return subscription?.tierId === tierId;
  };

  const isPaidTier = () => {
    return subscription?.tierId !== "free";
  };

  const isCancelled = () => {
    return subscription?.cancelAtPeriodEnd || false;
  };

  return {
    subscription,
    usage,
    loading,
    fetchSubscription,
    canPerformAction,
    getRemainingCount,
    isOnTier,
    isPaidTier,
    isCancelled,
  };
}

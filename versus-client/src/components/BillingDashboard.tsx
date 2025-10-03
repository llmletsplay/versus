import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CreditCard, TrendingUp, Users, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMultiFetch, useMutation } from "@/hooks/useFetch";
import { API_ENDPOINTS } from "@/config/api";
import type {
  Subscription,
  UsageMetrics,
  SubscriptionTier,
  BillingInvoice as Invoice,
  subscriptionHelpers,
} from "@/types/subscription";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

export function BillingDashboard() {
  const { user } = useAuth();
  const [selectedTier, setSelectedTier] = useState<string>("");

  // Fetch all billing data in parallel
  const {
    data,
    loading,
    refetch: fetchBillingData,
  } = useMultiFetch(
    {
      subscription: () =>
        fetch(API_ENDPOINTS.SUBSCRIPTIONS.CURRENT).then((res) =>
          res.ok ? res.json().then((d) => d.data) : null,
        ),
      tiers: () =>
        fetch(API_ENDPOINTS.SUBSCRIPTIONS.TIERS).then((res) =>
          res.ok ? res.json().then((d) => d.data.tiers) : [],
        ),
      invoices: () =>
        fetch(`${API_ENDPOINTS.SUBSCRIPTIONS.BILLING_HISTORY}?limit=12`).then(
          (res) => (res.ok ? res.json().then((d) => d.data.invoices) : []),
        ),
    },
    [user],
    {
      showToast: false, // We'll handle errors manually for better UX
    },
  );

  // Mutations
  const upgradeMutation = useMutation(
    async (tierId: string) => {
      const response = await fetch(API_ENDPOINTS.SUBSCRIPTIONS.UPGRADE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ tierId }),
      });

      const data = await response.json();

      if (data.success && data.data.sessionId) {
        const stripe = await stripePromise;
        if (stripe) {
          const { error } = await stripe.redirectToCheckout({
            sessionId: data.data.sessionId,
          });
          if (error) throw new Error(error.message);
        }
      } else {
        throw new Error(data.error || "Failed to process upgrade");
      }
    },
    {
      showToast: true,
      successMessage: "Redirecting to checkout...",
      errorMessage: "Failed to upgrade subscription",
    },
  );

  const cancelMutation = useMutation(
    async ({ immediate }: { immediate: boolean }) => {
      const response = await fetch(API_ENDPOINTS.SUBSCRIPTIONS.CANCEL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ immediate }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        fetchBillingData();
      } else {
        throw new Error(data.error || "Failed to cancel subscription");
      }
    },
    {
      showToast: false, // Manual toast for custom message
      invalidateQueries: [fetchBillingData],
    },
  );

  const resumeMutation = useMutation(
    async () => {
      const response = await fetch(API_ENDPOINTS.SUBSCRIPTIONS.RESUME, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        fetchBillingData();
      } else {
        throw new Error(data.error || "Failed to resume subscription");
      }
    },
    {
      showToast: false,
      invalidateQueries: [fetchBillingData],
    },
  );

  // Extract data from the useMultiFetch result
  const subscription = data?.subscription?.subscription;
  const usage = data?.subscription?.usage;
  const tiers = data?.tiers || [];
  const invoices = data?.invoices || [];

  const handleUpgrade = (tierId: string) => {
    upgradeMutation.mutate(tierId);
  };

  const handleCancel = (immediate = false) => {
    cancelMutation.mutate({ immediate });
  };

  const handleResume = () => {
    resumeMutation.mutate();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        Loading billing information...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Billing Dashboard</h1>
        {subscription && (
          <Badge
            variant={
              subscription.status === "active" ? "default" : "destructive"
            }
            className="text-sm"
          >
            {subscription.status === "active" && !subscription.cancelAtPeriodEnd
              ? "Active"
              : subscription.cancelAtPeriodEnd
                ? "Cancels on " +
                  subscriptionHelpers.formatDate(subscription.currentPeriodEnd)
                : subscription.status}
          </Badge>
        )}
      </div>

      {subscription?.cancelAtPeriodEnd && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Subscription Canceled</AlertTitle>
          <AlertDescription>
            Your subscription will be canceled on{" "}
            {subscriptionHelpers.formatDate(subscription.currentPeriodEnd)}.{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={handleResume}
            >
              Resume subscription
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="billing">Billing History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Current Plan
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">
                  {subscription?.tierId}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tiers.find((t) => t.id === subscription?.tierId)?.name}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usage?.metrics.apiCalls.used.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  {usage?.metrics.apiCalls.limit === -1
                    ? "Unlimited"
                    : usage?.metrics.apiCalls.limit.toLocaleString()}{" "}
                  this period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Games Played
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usage?.metrics.games.used}
                </div>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  {usage?.metrics.games.limit === -1
                    ? "Unlimited"
                    : usage?.metrics.games.limit}{" "}
                  this period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Next Billing
                </CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {subscription?.tierId === "free"
                    ? "Free"
                    : subscriptionHelpers.formatDate(
                        subscription?.currentPeriodEnd || "",
                      )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {subscription?.tierId === "free"
                    ? "No charges"
                    : subscription?.cancelAtPeriodEnd
                      ? "Final charge"
                      : "Next renewal"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Manage your subscription and payment methods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Change Plan</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Change Subscription Plan</DialogTitle>
                      <DialogDescription>
                        Select a new plan to upgrade or downgrade your
                        subscription
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select
                        value={selectedTier}
                        onValueChange={setSelectedTier}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {tiers.map((tier) => (
                            <SelectItem
                              key={tier.id}
                              value={tier.id}
                              disabled={tier.current}
                            >
                              {tier.name} -{" "}
                              {subscriptionHelpers.formatPrice(tier.price)}
                              /month
                              {tier.current && " (Current)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="w-full"
                        onClick={() =>
                          selectedTier && handleUpgrade(selectedTier)
                        }
                        disabled={
                          !selectedTier ||
                          selectedTier === subscription?.tierId ||
                          upgradeMutation.loading
                        }
                      >
                        {upgradeMutation.loading
                          ? "Processing..."
                          : "Change Plan"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {subscription?.tierId !== "free" &&
                  !subscription.cancelAtPeriodEnd && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={cancelMutation.loading}
                        >
                          Cancel Subscription
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Cancel Subscription</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to cancel your subscription?
                            You'll continue to have access until the end of your
                            current billing period.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            onClick={() => handleCancel(false)}
                            disabled={cancelMutation.loading}
                          >
                            Cancel at Period End
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleCancel(true)}
                            disabled={cancelMutation.loading}
                          >
                            Cancel Immediately
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage Metrics</CardTitle>
              <CardDescription>
                Track your resource usage for the current billing period (
                {subscriptionHelpers.formatDate(usage?.period.start || "")} -{" "}
                {subscriptionHelpers.formatDate(usage?.period.end || "")})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>API Calls</span>
                  <span>
                    {usage?.metrics.apiCalls.used.toLocaleString()} /{" "}
                    {usage?.metrics.apiCalls.limit === -1
                      ? "Unlimited"
                      : usage?.metrics.apiCalls.limit.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={usage?.metrics.apiCalls.percentage || 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Games Played</span>
                  <span>
                    {usage?.metrics.games.used} /{" "}
                    {usage?.metrics.games.limit === -1
                      ? "Unlimited"
                      : usage?.metrics.games.limit}
                  </span>
                </div>
                <Progress
                  value={usage?.metrics.games.percentage || 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Storage Used</span>
                  <span>
                    {usage?.metrics.storage.usedFormatted} /{" "}
                    {usage?.metrics.storage.limitFormatted}
                  </span>
                </div>
                <Progress
                  value={usage?.metrics.storage.percentage || 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Bandwidth Used</span>
                  <span>
                    {usage?.metrics.bandwidth.usedFormatted} /{" "}
                    {usage?.metrics.bandwidth.limitFormatted}
                  </span>
                </div>
                <Progress
                  value={usage?.metrics.bandwidth.percentage || 0}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => (
              <Card
                key={tier.id}
                className={tier.current ? "ring-2 ring-primary" : ""}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {tier.name}
                    {tier.current && <Badge>Current</Badge>}
                  </CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-4">
                    {subscriptionHelpers.formatPrice(tier.price)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /month
                    </span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li>
                      {tier.features.maxGames === -1
                        ? "Unlimited"
                        : tier.features.maxGames}{" "}
                      games
                    </li>
                    <li>
                      {tier.features.maxApiCalls === -1
                        ? "Unlimited"
                        : tier.features.maxApiCalls.toLocaleString()}{" "}
                      API calls
                    </li>
                    <li>
                      {tier.features.maxStorageGB === -1
                        ? "Unlimited"
                        : tier.features.maxStorageGB}{" "}
                      GB storage
                    </li>
                    <li>
                      {tier.features.maxBandwidthGB === -1
                        ? "Unlimited"
                        : tier.features.maxBandwidthGB}{" "}
                      GB bandwidth
                    </li>
                  </ul>
                  <Button
                    className="w-full mt-4"
                    variant={tier.current ? "outline" : "default"}
                    onClick={() => handleUpgrade(tier.id)}
                    disabled={tier.current || upgradeMutation.loading}
                  >
                    {tier.current
                      ? "Current Plan"
                      : tier.id === "free"
                        ? "Downgrade"
                        : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                View and download your past invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {subscriptionHelpers.formatDate(invoice.created)} -{" "}
                          {subscriptionHelpers.formatPrice(
                            invoice.total / 100,
                            invoice.currency,
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Status:{" "}
                          <Badge
                            variant={invoice.paid ? "default" : "destructive"}
                          >
                            {invoice.status}
                          </Badge>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {invoice.hostedInvoiceUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Invoice
                            </a>
                          </Button>
                        )}
                        {invoice.invoicePdf && (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={invoice.invoicePdf}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Download PDF
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No billing history available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

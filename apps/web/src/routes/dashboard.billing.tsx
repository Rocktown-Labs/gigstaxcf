import { createFileRoute } from "@tanstack/react-router";
import { Coins, CreditCard, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  dashboardPageMainReadableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import {
  billingOfferKindLabel,
  deriveBillingOffers,
} from "@/lib/billing-offers";
import type { BillingOfferKind } from "@/lib/billing-offers";
import {
  getDefaultPricingPlans,
  isPaidTier,
  planPriceLabel,
} from "@/lib/pricing-plans";
import type { PricingPlanDefinition } from "@/lib/pricing-plans";

const billingSearchSchema = z.object({
  checkoutError: z.string().optional(),
});

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
  validateSearch: (search) => billingSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Billing" }],
  }),
});

interface ActiveSubscriptionLike {
  status?: string;
  product?: { name?: string } | null;
  currentPeriodEnd?: string | null;
  amount?: number | null;
  currency?: string | null;
}

interface CustomerStateLike {
  activeSubscriptions?: ActiveSubscriptionLike[];
}

function BillingPage() {
  const search = Route.useSearch();
  const checkoutErrorCode = String(search.checkoutError || "").trim();
  const hasCheckoutError = checkoutErrorCode.length > 0;

  const [customerState, setCustomerState] = useState<CustomerStateLike | null>(
    null
  );
  const [portalPending, setPortalPending] = useState(false);
  const [checkoutPendingSlug, setCheckoutPendingSlug] = useState<string | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    authClient.customer
      .state()
      .then((result) => {
        if (!cancelled) {
          setCustomerState(
            (result.data as CustomerStateLike | null | undefined) ?? null
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[GigStax] Failed to load customer state:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The legacy page read the pricing catalog and subscription rows from the
  // server. There is no public pricing/subscription API endpoint, so the
  // ported page uses the default active catalog plus the Polar customer state
  // exposed by the better-auth polar plugin.
  const pricingPlans = useMemo(
    () => getDefaultPricingPlans().filter((plan) => plan.isActive),
    []
  );

  const activeSubscription = customerState?.activeSubscriptions?.[0] ?? null;
  const isActive = Boolean(
    activeSubscription &&
    String(activeSubscription.status ?? "active").toLowerCase() !==
      "canceled" &&
    String(activeSubscription.status ?? "active").toLowerCase() !== "revoked"
  );

  const currentPlan = useMemo(() => {
    if (activeSubscription?.product?.name) {
      const match = pricingPlans.find(
        (plan) => plan.displayName === activeSubscription.product?.name
      );
      if (match) {
        return match;
      }
    }

    if (isActive) {
      return null;
    }

    return pricingPlans.find((plan) => plan.planTier === "free") ?? null;
  }, [activeSubscription, isActive, pricingPlans]);

  // Without a subscription-tier API we cannot always map the Polar
  // subscription to a plan slug, so offers fall back to "upgrade" labels.
  const currentPlanSlug = isActive ? (currentPlan?.slug ?? "free") : "free";
  const billingOffers = deriveBillingOffers({
    currentPlanSlug,
    plans: pricingPlans,
  });

  const openCustomerPortal = async () => {
    setPortalPending(true);
    try {
      const result = await authClient.customer.portal({ redirect: false });
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      setPortalPending(false);
    } catch (error) {
      console.error("[GigStax] Portal error:", error);
      setPortalPending(false);
    }
  };

  const startCheckoutBySlug = async (slug: string) => {
    setCheckoutPendingSlug(slug);
    try {
      const result = await authClient.checkout({
        returnUrl: "/dashboard/billing",
        slug,
        successUrl: "/dashboard/billing",
      });
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      setCheckoutPendingSlug(null);
    } catch (error) {
      console.error("[GigStax] Checkout error:", error);
      setCheckoutPendingSlug(null);
    }
  };

  // Plan-level credit info (no usage API endpoint exists; consumed credits
  // are enforced server-side).
  const currentCreditLimit =
    currentPlan?.aiCreditLimit ?? (isActive ? null : 0);

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainReadableClass} space-y-6`}>
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-2">
            Manage your GigStax plan, credit packs, and AI usage for the current
            period.
          </p>
        </header>

        {hasCheckoutError ? (
          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/10">
            <CardContent className="pt-6 text-sm text-amber-100">
              Checkout is not configured for this item yet. Set the matching
              Polar product UUID env var, or sync your catalog from admin
              pricing.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="text-primary h-4 w-4" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {currentPlan?.displayName ||
                  activeSubscription?.product?.name ||
                  "Legacy Free"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {currentPlan ? planPriceLabel(currentPlan) : ""}
              </p>
              <p className="text-muted-foreground mt-1 text-sm capitalize">
                Status: {activeSubscription?.status ?? "free"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="text-primary h-4 w-4" />
                Monthly AI Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {currentCreditLimit === null
                  ? "Unlimited"
                  : (currentCreditLimit ?? 0).toLocaleString()}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {currentCreditLimit === null
                  ? "Unlimited credits"
                  : "Included credits per month"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
                <Coins className="text-primary h-4 w-4" />
                Pack Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">--</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Pack balance requires the AI usage endpoint.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 rounded-2xl">
          <CardHeader>
            <CardTitle>Subscription Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Update your payment method, review invoices, and manage your
              subscription in the customer portal.
            </p>
            <Button
              type="button"
              className="rounded-xl"
              disabled={portalPending}
              onClick={() => {
                openCustomerPortal().catch((error: unknown) => {
                  console.error("[GigStax] Portal error:", error);
                });
              }}
            >
              {portalPending ? "Opening..." : "Open Billing Portal"}
            </Button>

            {billingOffers.length > 0 ? (
              <div className="-mx-1 overflow-x-auto pb-2">
                <div className="flex snap-x snap-mandatory gap-3 px-1">
                  {billingOffers.map((offer) => (
                    <PlanCheckoutCard
                      key={offer.plan.slug}
                      isPending={checkoutPendingSlug === offer.plan.slug}
                      kind={offer.kind}
                      plan={offer.plan}
                      startCheckoutBySlug={startCheckoutBySlug}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-2xl">
          <CardHeader>
            <CardTitle>Credit Packs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Buy one-time credits for extra AI usage. Pack credits are used
              after monthly included credits.
            </p>
            {/* NOTE(billing-api): the legacy page listed credit packs from the
                server (`listActiveCreditPacks`). There is no public
                credit-pack endpoint yet, so none are rendered here. */}
            <p className="text-muted-foreground text-sm">
              No active credit packs are configured yet.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function PlanCheckoutCard({
  isPending,
  kind,
  plan,
  startCheckoutBySlug,
}: {
  isPending: boolean;
  kind: BillingOfferKind;
  plan: PricingPlanDefinition;
  startCheckoutBySlug: (slug: string) => Promise<void>;
}) {
  const checkoutConfigured = isPaidTier(plan.planTier);
  const actionLabel = billingOfferKindLabel(kind);
  const badgeVariant =
    kind === "upgrade"
      ? "default"
      : kind === "switch_billing"
        ? "secondary"
        : "outline";

  return (
    <article className="border-border/50 bg-card/40 w-[280px] shrink-0 snap-start rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base leading-tight font-semibold">
            {plan.displayName}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {planPriceLabel(plan)}
          </p>
        </div>
        <Badge
          variant={badgeVariant}
          className="text-[10px] tracking-wide uppercase"
        >
          {actionLabel}
        </Badge>
      </div>

      <p className="text-muted-foreground mt-3 line-clamp-2 text-xs">
        {plan.description}
      </p>

      <div className="mt-4 space-y-2">
        <Button
          type="button"
          className="w-full rounded-xl"
          disabled={!checkoutConfigured || isPending}
          onClick={() => {
            startCheckoutBySlug(plan.slug).catch((error: unknown) => {
              console.error("[GigStax] Checkout error:", error);
            });
          }}
        >
          {isPending ? "Starting checkout..." : actionLabel}
        </Button>
        {checkoutConfigured ? null : (
          <p className="text-muted-foreground text-xs">
            Checkout not configured for this plan.
          </p>
        )}
      </div>
    </article>
  );
}

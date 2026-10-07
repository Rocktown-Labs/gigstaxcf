import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, CreditCard, Sparkles } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import {
  dashboardPageMainReadableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  billingOfferKindLabel,
  deriveBillingOffers,
} from "@/lib/billing-offers";
import type { BillingOfferKind } from "@/lib/billing-offers";
import { planPriceLabel } from "@/lib/pricing-plans";
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

interface BillingPricingPlan extends PricingPlanDefinition {
  polarPriceId?: string | null;
  polarProductId?: string | null;
}

interface BillingEntitlementMeter {
  limit: number | null;
  remaining: number | null;
  used: number;
}

interface BillingEntitlement {
  ai: BillingEntitlementMeter & {
    canAnalyze: boolean;
    effectiveRemaining: number | null;
    monthlyRemaining: number | null;
    packBalance: number;
  };
  billingInterval: string | null;
  bulk: BillingEntitlementMeter & {
    canUse: boolean;
    maxImagesPerBatch: number | null;
  };
  effectivePlan: BillingPricingPlan;
  isPaid: boolean;
  isPro: boolean;
  periodEnd: string;
  periodStart: string;
  planTier: string;
  status: string;
}

interface BillingCreditPack {
  credits: number;
  currencyCode: string;
  description: string;
  displayName: string;
  id: number;
  polarPriceId: string | null;
  polarProductId: string | null;
  priceCents: number;
  slug: string;
}

interface BillingResponse {
  creditPacks: BillingCreditPack[];
  entitlement: BillingEntitlement;
  pricingPlans: BillingPricingPlan[];
  subscription: {
    billingInterval: string | null;
    currentPeriodEnd: string | null;
    currentPeriodStart: string | null;
    planTier: string;
    status: string;
  } | null;
}

function BillingPage() {
  const search = Route.useSearch();
  const checkoutErrorCode = String(search.checkoutError || "").trim();
  const hasCheckoutError = checkoutErrorCode.length > 0;

  const [portalPending, setPortalPending] = useState(false);
  const [checkoutPendingSlug, setCheckoutPendingSlug] = useState<string | null>(
    null
  );

  const billingQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/billing");
      if (!response.ok) {
        throw new Error("Failed to load billing data");
      }
      return (await response.json()) as BillingResponse;
    },
    queryKey: ["billing"],
  });

  const { data } = billingQuery;
  const entitlement = data?.entitlement;
  const pricingPlans = data?.pricingPlans ?? [];
  const creditPacks = data?.creditPacks ?? [];
  const currentPlan = entitlement?.effectivePlan;

  const currentPlanSlug = currentPlan?.slug ?? "free";
  const billingOffers = deriveBillingOffers({
    currentPlanSlug,
    plans: pricingPlans,
  });

  const packPurchasesDisabled = Boolean(
    entitlement?.isPro && entitlement.ai.limit === null
  );

  const openCustomerPortal = async () => {
    setPortalPending(true);
    try {
      const result = await authClient.customer.portal({ redirect: false });
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      setPortalPending(false);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("[GigStax] Checkout error:", error);
      setCheckoutPendingSlug(null);
    }
  };

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
                {currentPlan?.displayName || (data ? "Legacy Free" : "--")}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {currentPlan ? planPriceLabel(currentPlan) : ""}
              </p>
              <p className="text-muted-foreground mt-1 text-sm capitalize">
                Status: {entitlement?.status ?? "--"}
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
                {entitlement ? entitlement.ai.used : "--"}
                {entitlement && entitlement.ai.limit === null
                  ? ""
                  : ` / ${entitlement?.ai.limit ?? "--"}`}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {entitlement
                  ? entitlement.ai.limit === null
                    ? "Unlimited credits"
                    : `${entitlement.ai.monthlyRemaining} monthly credits remaining`
                  : "Loading credits…"}
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
              <p className="text-2xl font-bold">
                {entitlement?.ai.packBalance ?? "--"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {entitlement
                  ? entitlement.ai.limit === null
                    ? "Unused while on unlimited plan"
                    : "Consumed after monthly credits"
                  : "Loading credits…"}
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
            {packPurchasesDisabled ? (
              <p className="text-muted-foreground text-sm">
                Credit packs are disabled while your Pro plan has unlimited AI.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Buy one-time credits for extra AI usage. Pack credits are used
                after monthly included credits.
              </p>
            )}

            {billingQuery.isLoading ? (
              <p className="text-muted-foreground text-sm">
                Loading credit packs…
              </p>
            ) : creditPacks.length > 0 ? (
              <div className="-mx-1 overflow-x-auto pb-2">
                <div className="flex snap-x snap-mandatory gap-3 px-1">
                  {creditPacks.map((pack) => (
                    <CreditPackCheckoutCard
                      key={pack.slug}
                      disabled={packPurchasesDisabled}
                      isPending={checkoutPendingSlug === pack.slug}
                      pack={pack}
                      startCheckoutBySlug={startCheckoutBySlug}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No active credit packs are configured yet.
              </p>
            )}
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
  plan: BillingPricingPlan;
  startCheckoutBySlug: (slug: string) => Promise<void>;
}) {
  const checkoutConfigured =
    plan.planTier !== "free" && Boolean(plan.polarProductId?.trim());
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

function CreditPackCheckoutCard({
  disabled,
  isPending,
  pack,
  startCheckoutBySlug,
}: {
  disabled: boolean;
  isPending: boolean;
  pack: BillingCreditPack;
  startCheckoutBySlug: (slug: string) => Promise<void>;
}) {
  const checkoutConfigured = Boolean(pack.polarProductId?.trim());

  return (
    <article className="border-border/50 bg-card/40 w-[280px] shrink-0 snap-start rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base leading-tight font-semibold">
            {pack.displayName}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {planPriceLabel({
              currencyCode: pack.currencyCode,
              priceCents: pack.priceCents,
            })}
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] tracking-wide uppercase"
        >
          {pack.credits} credits
        </Badge>
      </div>

      <p className="text-muted-foreground mt-3 line-clamp-2 text-xs">
        {pack.description}
      </p>

      <div className="mt-4 space-y-2">
        <Button
          type="button"
          className="w-full rounded-xl"
          disabled={disabled || !checkoutConfigured || isPending}
          onClick={() => {
            startCheckoutBySlug(pack.slug).catch((error: unknown) => {
              console.error("[GigStax] Checkout error:", error);
            });
          }}
        >
          {isPending ? "Starting checkout..." : "Buy Credits"}
        </Button>
        {disabled ? (
          <p className="text-muted-foreground text-xs">
            Included with unlimited Pro AI.
          </p>
        ) : checkoutConfigured ? null : (
          <p className="text-muted-foreground text-xs">
            Checkout not configured for this pack.
          </p>
        )}
      </div>
    </article>
  );
}

import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type BillingCycle = "monthly" | "yearly";
type PlanTier = "free" | "starter" | "driver" | "pro_driver";
type BillingInterval = "month" | "year" | null;

interface MarketingPlan {
  aiCreditLimit: number | null;
  billingInterval: BillingInterval;
  bulkBatchLimit: number | null;
  bulkMaxImagesPerBatch: number | null;
  description: string;
  displayName: string;
  planTier: PlanTier;
  priceCents: number;
}

interface PricingTableProps {
  plans: MarketingPlan[];
}

const MONTHLY = "monthly";
const YEARLY = "yearly";

const tierDisplay = [
  {
    ctaLabel: "Choose Starter",
    name: "Starter",
    planTier: "starter" as const,
    subtitle: "Affordable starter access with 10 monthly AI credits.",
  },
  {
    ctaLabel: "Choose Driver",
    isHighlighted: true,
    name: "Driver",
    planTier: "driver" as const,
    subtitle: "Best for active drivers using AI and bulk upload.",
  },
  {
    ctaLabel: "Go Pro Driver",
    name: "Pro Driver",
    planTier: "pro_driver" as const,
    subtitle: "Unlimited AI and bulk workflows for high volume.",
  },
];

const formatUsd = (priceCents: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(priceCents / 100);

const getInterval = (cycle: BillingCycle) =>
  cycle === YEARLY ? "year" : "month";

const resolvePlanForTier = (
  plans: MarketingPlan[],
  planTier: PlanTier,
  cycle: BillingCycle
) => {
  const interval = getInterval(cycle);
  const exact = plans.find(
    (plan) => plan.planTier === planTier && plan.billingInterval === interval
  );
  if (exact) {
    return exact;
  }

  return plans.find((plan) => plan.planTier === planTier) || null;
};

const getPriceSuffix = (billingInterval: BillingInterval) =>
  billingInterval === "year" ? "/year" : "/month";

const getSavingsLabel = (
  monthlyPriceCents?: number,
  yearlyPriceCents?: number
) => {
  if (
    monthlyPriceCents === undefined ||
    yearlyPriceCents === undefined ||
    monthlyPriceCents <= 0 ||
    yearlyPriceCents <= 0
  ) {
    return null;
  }

  const annualizedMonthly = monthlyPriceCents * 12;
  const discount = annualizedMonthly - yearlyPriceCents;
  if (discount <= 0) {
    return null;
  }

  return `Save ${formatUsd(discount)}/yr`;
};

const getPlanFeatures = (plan: MarketingPlan) => {
  const cycleLabel = plan.billingInterval === "year" ? "year" : "month";
  const aiCredits =
    plan.aiCreditLimit === null ? "Unlimited" : plan.aiCreditLimit;
  const bulkBatches =
    plan.bulkBatchLimit === null ? "Unlimited" : String(plan.bulkBatchLimit);
  const maxBatch =
    plan.bulkMaxImagesPerBatch === null
      ? "Unlimited"
      : String(plan.bulkMaxImagesPerBatch);

  return [
    `${aiCredits} AI credits per ${cycleLabel}`,
    `${bulkBatches} bulk upload batches`,
    `${maxBatch} images per batch`,
    "Manual + image logging included",
  ];
};

export function PricingTable({ plans }: PricingTableProps) {
  const [cycle, setCycle] = useState<BillingCycle>(MONTHLY);

  const displayPlans = useMemo(
    () =>
      tierDisplay
        .map((tier) => {
          const selected = resolvePlanForTier(plans, tier.planTier, cycle);
          if (!selected) {
            return null;
          }

          const monthlyPlan = resolvePlanForTier(plans, tier.planTier, MONTHLY);
          const yearlyPlan = resolvePlanForTier(plans, tier.planTier, YEARLY);

          return {
            billingInterval: selected.billingInterval,
            ctaLabel: tier.ctaLabel,
            description: selected.description || tier.subtitle,
            displayName: tier.name,
            features: getPlanFeatures(selected),
            isHighlighted: tier.isHighlighted,
            priceCents: selected.priceCents,
            savingsLabel: getSavingsLabel(
              monthlyPlan?.priceCents,
              yearlyPlan?.priceCents
            ),
          };
        })
        .filter((plan): plan is NonNullable<typeof plan> => plan !== null),
    [cycle, plans]
  );

  const setMonthly = () => {
    setCycle(MONTHLY);
  };

  const setYearly = () => {
    setCycle(YEARLY);
  };

  return (
    <section className="scroll-mt-24 space-y-5">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-primary text-sm font-semibold tracking-wide uppercase">
          Pricing
        </h2>
        <p className="text-foreground mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Pricing that grows with your routes
        </p>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-base sm:text-lg">
          Start with Starter, then upgrade when you need higher AI volume and
          bulk workflows.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="border-border/60 bg-card/60 inline-flex rounded-full border p-1">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              cycle === MONTHLY
                ? "bg-primary text-primary-foreground shadow-[0_0_20px_-8px_oklch(0.65_0.25_140)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={setMonthly}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              cycle === YEARLY
                ? "bg-primary text-primary-foreground shadow-[0_0_20px_-8px_oklch(0.65_0.25_140)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={setYearly}
          >
            Annual
          </button>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-md grid-cols-1 gap-6 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {displayPlans.map((plan) => (
          <article
            key={plan.displayName}
            className={`flex flex-col justify-between rounded-3xl border p-8 xl:p-10 ${
              plan.isHighlighted
                ? "border-primary bg-primary/5 shadow-[0_0_40px_-14px_oklch(0.65_0.25_140_/_0.45)]"
                : "border-border/60 bg-card/40"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-x-3">
                <h3 className="text-foreground text-lg font-semibold">
                  {plan.displayName}
                </h3>
                {plan.isHighlighted ? (
                  <span className="bg-primary/15 text-primary rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase">
                    Most Popular
                  </span>
                ) : null}
              </div>

              <p className="text-muted-foreground mt-4 text-sm leading-6">
                {plan.description}
              </p>

              <p className="mt-6 flex items-baseline gap-x-1">
                <span className="text-foreground text-4xl font-extrabold tracking-tight">
                  {formatUsd(plan.priceCents)}
                </span>
                <span className="text-muted-foreground text-sm font-semibold">
                  {getPriceSuffix(plan.billingInterval)}
                </span>
              </p>

              {cycle === YEARLY && plan.savingsLabel ? (
                <p className="text-primary mt-2 text-xs font-semibold tracking-wide uppercase">
                  {plan.savingsLabel}
                </p>
              ) : null}

              <ul className="text-muted-foreground mt-8 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check className="text-primary mt-0.5 h-5 w-5 flex-none" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              asChild
              className={`mt-8 w-full rounded-xl font-semibold ${
                plan.isHighlighted
                  ? ""
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              variant={plan.isHighlighted ? "default" : "secondary"}
            >
              <Link to="/signup">{plan.ctaLabel}</Link>
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

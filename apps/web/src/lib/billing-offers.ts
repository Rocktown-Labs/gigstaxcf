import type {
  AppBillingInterval,
  AppPlanTier,
  PricingPlanDefinition as PricingPlanDto,
  PricingPlanSlug,
} from "@/lib/pricing-plans";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "uncanceled",
]);

const tierRank: Record<AppPlanTier, number> = {
  driver: 2,
  free: 0,
  pro_driver: 3,
  starter: 1,
};

const offerKindSortOrder = {
  downgrade: 2,
  switch_billing: 1,
  upgrade: 0,
} as const;

export type BillingOfferKind = "upgrade" | "switch_billing" | "downgrade";

export interface BillingOffer {
  kind: BillingOfferKind;
  plan: PricingPlanDto;
}

export interface SubscriptionPlanSelection {
  billingInterval: AppBillingInterval | null;
  planTier: AppPlanTier;
  status: string | null | undefined;
}

function isPaidTier(
  planTier: AppPlanTier
): planTier is Exclude<AppPlanTier, "free"> {
  return (
    planTier === "starter" || planTier === "driver" || planTier === "pro_driver"
  );
}

function toCheckoutSlug(args: {
  billingInterval: AppBillingInterval;
  planTier: Exclude<AppPlanTier, "free">;
}): Exclude<PricingPlanSlug, "free"> {
  if (args.planTier === "starter") {
    return "starter-monthly";
  }

  if (args.planTier === "driver") {
    return args.billingInterval === "year" ? "driver-yearly" : "driver-monthly";
  }

  return args.billingInterval === "year"
    ? "pro-driver-yearly"
    : "pro-driver-monthly";
}

function checkoutSlugToSelection(slug: PricingPlanSlug): {
  billingInterval: AppBillingInterval;
  planTier: Exclude<AppPlanTier, "free">;
} | null {
  switch (slug) {
    case "starter-monthly": {
      return { billingInterval: "month", planTier: "starter" };
    }
    case "driver-monthly": {
      return { billingInterval: "month", planTier: "driver" };
    }
    case "driver-yearly": {
      return { billingInterval: "year", planTier: "driver" };
    }
    case "pro-driver-monthly": {
      return { billingInterval: "month", planTier: "pro_driver" };
    }
    case "pro-driver-yearly": {
      return { billingInterval: "year", planTier: "pro_driver" };
    }
    default: {
      return null;
    }
  }
}

export function normalizeSubscriptionStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function resolveCurrentPlanSlug(
  subscription: SubscriptionPlanSelection | null
): PricingPlanSlug {
  if (!subscription) {
    return "free";
  }

  const { billingInterval, planTier } = subscription;
  const normalizedStatus = normalizeSubscriptionStatus(subscription.status);
  if (
    !isPaidTier(planTier) ||
    billingInterval === null ||
    !ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)
  ) {
    return "free";
  }

  return toCheckoutSlug({
    billingInterval,
    planTier,
  });
}

function getBillingOfferKind(args: {
  currentPlanSlug: PricingPlanSlug;
  targetPlan: PricingPlanDto;
}): BillingOfferKind {
  if (args.currentPlanSlug === "free") {
    return "upgrade";
  }

  const currentSelection = checkoutSlugToSelection(args.currentPlanSlug);
  if (!currentSelection) {
    return "upgrade";
  }

  const currentTierRank = tierRank[currentSelection.planTier];
  const targetTierRank = tierRank[args.targetPlan.planTier];
  if (targetTierRank > currentTierRank) {
    return "upgrade";
  }

  if (targetTierRank < currentTierRank) {
    return "downgrade";
  }

  return "switch_billing";
}

export function deriveBillingOffers(args: {
  currentPlanSlug: PricingPlanSlug;
  plans: PricingPlanDto[];
}): BillingOffer[] {
  const paidOptions = args.plans
    .filter(
      (plan) => isPaidTier(plan.planTier) && plan.billingInterval !== null
    )
    .filter((plan) => plan.slug !== args.currentPlanSlug);

  return paidOptions
    .map((plan) => ({
      kind: getBillingOfferKind({
        currentPlanSlug: args.currentPlanSlug,
        targetPlan: plan,
      }),
      plan,
    }))
    .sort((left, right) => {
      const kindDelta =
        offerKindSortOrder[left.kind] - offerKindSortOrder[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }

      return left.plan.sortOrder - right.plan.sortOrder;
    });
}

export function billingOfferKindLabel(kind: BillingOfferKind) {
  if (kind === "switch_billing") {
    return "Switch Billing";
  }

  if (kind === "downgrade") {
    return "Downgrade";
  }

  return "Upgrade";
}

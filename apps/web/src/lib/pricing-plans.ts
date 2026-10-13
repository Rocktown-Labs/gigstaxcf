/**
 * Pure subset of the legacy `lib/services/pricing-plans.ts` (Next.js server
 * module). Only the client-safe catalog constants and helpers are kept here;
 * DB-sync logic stayed on the server.
 */

export type AppPlanTier = "free" | "starter" | "driver" | "pro_driver";
export type AppBillingInterval = "month" | "year";

export type PricingPlanSlug =
  | "free"
  | "starter-monthly"
  | "driver-monthly"
  | "driver-yearly"
  | "pro-driver-monthly"
  | "pro-driver-yearly";

export interface PricingPlanDefinition {
  aiCreditLimit: number | null;
  billingInterval: AppBillingInterval | null;
  bulkBatchLimit: number | null;
  bulkMaxImagesPerBatch: number | null;
  currencyCode: string;
  description: string;
  displayName: string;
  features: string[];
  isActive: boolean;
  planTier: AppPlanTier;
  priceCents: number;
  slug: PricingPlanSlug;
  sortOrder: number;
}

export interface PricingPlanDto extends PricingPlanDefinition {
  id: number;
  lastSyncedAt: string | null;
  polarPriceId: string | null;
  polarProductId: string | null;
  updatedAt: string;
}

const DEFAULT_PRICING_PLANS: PricingPlanDefinition[] = [
  {
    aiCreditLimit: 10,
    billingInterval: null,
    bulkBatchLimit: 0,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Grandfathered legacy free access with monthly AI credits.",
    displayName: "Legacy Free",
    features: [
      "manual_entry",
      "image_attachment",
      "basic_dashboard",
      "ai_analysis",
    ],
    isActive: false,
    planTier: "free",
    priceCents: 0,
    slug: "free",
    sortOrder: 5,
  },
  {
    aiCreditLimit: 10,
    billingInterval: "month",
    bulkBatchLimit: 0,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "10 AI credits monthly, manual entry, and receipt attachment.",
    displayName: "Starter Monthly",
    features: [
      "manual_entry",
      "image_attachment",
      "basic_dashboard",
      "ai_analysis",
    ],
    isActive: true,
    planTier: "starter",
    priceCents: 100,
    slug: "starter-monthly",
    sortOrder: 15,
  },
  {
    aiCreditLimit: 300,
    billingInterval: "month",
    bulkBatchLimit: 5,
    bulkMaxImagesPerBatch: 50,
    currencyCode: "USD",
    description:
      "300 AI credits monthly, bulk uploads, and mid-level analytics.",
    displayName: "Driver Monthly",
    features: [
      "manual_entry",
      "image_attachment",
      "ai_analysis",
      "bulk_upload",
      "mid_analytics",
    ],
    isActive: true,
    planTier: "driver",
    priceCents: 1499,
    slug: "driver-monthly",
    sortOrder: 20,
  },
  {
    aiCreditLimit: 300,
    billingInterval: "year",
    bulkBatchLimit: 5,
    bulkMaxImagesPerBatch: 50,
    currencyCode: "USD",
    description: "Driver plan billed yearly at a lower effective cost.",
    displayName: "Driver Yearly",
    features: [
      "manual_entry",
      "image_attachment",
      "ai_analysis",
      "bulk_upload",
      "mid_analytics",
    ],
    isActive: true,
    planTier: "driver",
    priceCents: 14_900,
    slug: "driver-yearly",
    sortOrder: 30,
  },
  {
    aiCreditLimit: null,
    billingInterval: "month",
    bulkBatchLimit: null,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description:
      "Unlimited AI and bulk uploads with full analytics and exports.",
    displayName: "Pro Driver Monthly",
    features: [
      "manual_entry",
      "image_attachment",
      "ai_analysis",
      "bulk_upload",
      "priority_queue",
      "full_analytics",
      "exports",
      "tax_tools",
    ],
    isActive: true,
    planTier: "pro_driver",
    priceCents: 2499,
    slug: "pro-driver-monthly",
    sortOrder: 40,
  },
  {
    aiCreditLimit: null,
    billingInterval: "year",
    bulkBatchLimit: null,
    bulkMaxImagesPerBatch: null,
    currencyCode: "USD",
    description: "Pro Driver yearly billing with full feature access.",
    displayName: "Pro Driver Yearly",
    features: [
      "manual_entry",
      "image_attachment",
      "ai_analysis",
      "bulk_upload",
      "priority_queue",
      "full_analytics",
      "exports",
      "tax_tools",
    ],
    isActive: true,
    planTier: "pro_driver",
    priceCents: 24_900,
    slug: "pro-driver-yearly",
    sortOrder: 50,
  },
];

export function getDefaultPricingPlans() {
  return DEFAULT_PRICING_PLANS;
}

export function planPriceLabel(
  plan: Pick<PricingPlanDto, "currencyCode" | "priceCents">
) {
  const formatter = new Intl.NumberFormat("en-US", {
    currency: plan.currencyCode || "USD",
    style: "currency",
  });

  return formatter.format(plan.priceCents / 100);
}

export function isPaidTier(planTier: AppPlanTier) {
  return (
    planTier === "starter" || planTier === "driver" || planTier === "pro_driver"
  );
}

export function toCheckoutSlug(args: {
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

export function checkoutSlugToSelection(slug: PricingPlanSlug) {
  switch (slug) {
    case "starter-monthly": {
      return {
        billingInterval: "month" as const,
        planTier: "starter" as const,
      };
    }
    case "driver-monthly": {
      return { billingInterval: "month" as const, planTier: "driver" as const };
    }
    case "driver-yearly": {
      return { billingInterval: "year" as const, planTier: "driver" as const };
    }
    case "pro-driver-monthly": {
      return {
        billingInterval: "month" as const,
        planTier: "pro_driver" as const,
      };
    }
    case "pro-driver-yearly": {
      return {
        billingInterval: "year" as const,
        planTier: "pro_driver" as const,
      };
    }
    default: {
      return null;
    }
  }
}

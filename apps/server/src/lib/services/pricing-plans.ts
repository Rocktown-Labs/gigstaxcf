import { billingIntervalEnum, pricingPlans } from "@gigstaxcf/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";

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

let ensurePricingCatalogPromise: Promise<void> | null = null;

function normalizeFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((feature) => String(feature).trim())
    .filter((feature) => feature.length > 0);
}

function toPlanDto(row: typeof pricingPlans.$inferSelect): PricingPlanDto {
  return {
    aiCreditLimit: row.aiCreditLimit,
    billingInterval: row.billingInterval,
    bulkBatchLimit: row.bulkBatchLimit,
    bulkMaxImagesPerBatch: row.bulkMaxImagesPerBatch,
    currencyCode: row.currencyCode,
    description: row.description || "",
    displayName: row.displayName,
    features: normalizeFeatures(row.features),
    id: row.id,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    planTier: row.planTier,
    polarPriceId: row.polarPriceId,
    polarProductId: row.polarProductId,
    priceCents: row.priceCents,
    slug: row.slug as PricingPlanSlug,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function getDefaultPricingPlans() {
  return DEFAULT_PRICING_PLANS;
}

export function ensurePricingCatalog() {
  if (ensurePricingCatalogPromise) {
    return ensurePricingCatalogPromise;
  }

  ensurePricingCatalogPromise = (async () => {
    for (const plan of DEFAULT_PRICING_PLANS) {
      await db
        .insert(pricingPlans)
        .values({
          aiCreditLimit: plan.aiCreditLimit,
          billingInterval: plan.billingInterval,
          bulkBatchLimit: plan.bulkBatchLimit,
          bulkMaxImagesPerBatch: plan.bulkMaxImagesPerBatch,
          currencyCode: plan.currencyCode,
          description: plan.description,
          displayName: plan.displayName,
          features: plan.features,
          isActive: plan.isActive,
          planTier: plan.planTier,
          priceCents: plan.priceCents,
          slug: plan.slug,
          sortOrder: plan.sortOrder,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: {
            aiCreditLimit: plan.aiCreditLimit,
            billingInterval: plan.billingInterval,
            bulkBatchLimit: plan.bulkBatchLimit,
            bulkMaxImagesPerBatch: plan.bulkMaxImagesPerBatch,
            currencyCode: plan.currencyCode,
            description: plan.description,
            displayName: plan.displayName,
            features: plan.features,
            isActive: plan.isActive,
            planTier: plan.planTier,
            priceCents: plan.priceCents,
            sortOrder: plan.sortOrder,
            updatedAt: new Date(),
          },
          target: pricingPlans.slug,
        });
    }
  })().catch((error) => {
    ensurePricingCatalogPromise = null;
    throw error;
  });

  return ensurePricingCatalogPromise;
}

export async function listPricingPlans(args?: {
  activeOnly?: boolean;
}): Promise<PricingPlanDto[]> {
  await ensurePricingCatalog();

  const where = args?.activeOnly ? eq(pricingPlans.isActive, true) : undefined;

  const rows = await db
    .select()
    .from(pricingPlans)
    .where(where)
    .orderBy(asc(pricingPlans.sortOrder), asc(pricingPlans.id));

  return rows.map(toPlanDto);
}

export async function getPricingPlanBySlug(slug: string) {
  await ensurePricingCatalog();

  const [row] = await db
    .select()
    .from(pricingPlans)
    .where(eq(pricingPlans.slug, slug))
    .limit(1);

  return row ? toPlanDto(row) : null;
}

export async function getPricingPlanBySelection(args: {
  billingInterval: AppBillingInterval | null;
  planTier: AppPlanTier;
}) {
  await ensurePricingCatalog();

  const where =
    args.billingInterval === null
      ? and(
          eq(pricingPlans.planTier, args.planTier),
          isNull(pricingPlans.billingInterval)
        )
      : and(
          eq(pricingPlans.planTier, args.planTier),
          eq(pricingPlans.billingInterval, args.billingInterval)
        );

  const [row] = await db.select().from(pricingPlans).where(where).limit(1);

  return row ? toPlanDto(row) : null;
}

export async function updatePricingPlanById(args: {
  id: number;
  patch: Partial<
    Pick<
      PricingPlanDefinition,
      | "aiCreditLimit"
      | "bulkBatchLimit"
      | "bulkMaxImagesPerBatch"
      | "currencyCode"
      | "description"
      | "displayName"
      | "features"
      | "isActive"
      | "priceCents"
      | "sortOrder"
    >
  >;
}) {
  const [row] = await db
    .update(pricingPlans)
    .set({
      aiCreditLimit: args.patch.aiCreditLimit,
      bulkBatchLimit: args.patch.bulkBatchLimit,
      bulkMaxImagesPerBatch: args.patch.bulkMaxImagesPerBatch,
      currencyCode: args.patch.currencyCode,
      description: args.patch.description,
      displayName: args.patch.displayName,
      features: args.patch.features,
      isActive: args.patch.isActive,
      priceCents: args.patch.priceCents,
      sortOrder: args.patch.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(pricingPlans.id, args.id))
    .returning();

  return row ? toPlanDto(row) : null;
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

export const BILLING_INTERVAL_VALUES = billingIntervalEnum.enumValues;

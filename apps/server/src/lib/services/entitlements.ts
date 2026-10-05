import { aiUsageEvents, subscriptions } from "@gigstaxcf/db/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getPackBalance } from "@/lib/services/credit-balances";
import { getPricingPlanBySelection } from "@/lib/services/pricing-plans";
import type {
  AppBillingInterval,
  AppPlanTier,
  PricingPlanDto,
} from "@/lib/services/pricing-plans";

interface MeterUsageResult {
  meterKey: "ai_extract_credits" | "bulk_upload_batches";
  totalUnits: number;
}

export interface EntitlementMeter {
  limit: number | null;
  remaining: number | null;
  used: number;
}

export interface EntitlementResult {
  ai: EntitlementMeter & {
    canAnalyze: boolean;
    effectiveRemaining: number | null;
    monthlyRemaining: number | null;
    packBalance: number;
  };
  billingInterval: AppBillingInterval | null;
  bulk: EntitlementMeter & {
    canUse: boolean;
    maxImagesPerBatch: number | null;
  };
  effectivePlan: PricingPlanDto;
  isPaid: boolean;
  isPro: boolean;
  periodEnd: Date;
  periodStart: Date;
  planTier: AppPlanTier;
  status: string;
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "uncanceled",
]);

const FREE_PLAN_FALLBACK: PricingPlanDto = {
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
  id: 0,
  isActive: true,
  lastSyncedAt: null,
  planTier: "free",
  polarPriceId: null,
  polarProductId: null,
  priceCents: 0,
  slug: "free",
  sortOrder: 10,
  updatedAt: new Date(0).toISOString(),
};

export function startOfCurrentUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function resolveActivePlanSelection(args: {
  subscription: {
    billingInterval: AppBillingInterval | null;
    currentPeriodEnd: Date | null;
    currentPeriodStart: Date | null;
    planTier: AppPlanTier;
    status: string;
  } | null;
}): {
  billingInterval: AppBillingInterval | null;
  isActivePaid: boolean;
  periodEnd: Date;
  periodStart: Date;
  planTier: AppPlanTier;
  status: string;
} {
  const { subscription } = args;
  if (!subscription) {
    return {
      billingInterval: null,
      isActivePaid: false,
      periodEnd: new Date(),
      periodStart: startOfCurrentUtcMonth(),
      planTier: "free",
      status: "free",
    };
  }

  const normalizedStatus = (subscription.status || "").toLowerCase();
  const isActivePaid =
    subscription.planTier !== "free" &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus);

  if (!isActivePaid) {
    return {
      billingInterval: null,
      isActivePaid: false,
      periodEnd: new Date(),
      periodStart: startOfCurrentUtcMonth(),
      planTier: "free",
      status: subscription.status,
    };
  }

  const periodStart =
    subscription.currentPeriodStart || startOfCurrentUtcMonth();
  const periodEnd = subscription.currentPeriodEnd || new Date();

  return {
    billingInterval: subscription.billingInterval || "month",
    isActivePaid,
    periodEnd,
    periodStart,
    planTier: subscription.planTier,
    status: subscription.status,
  };
}

async function loadUsageByMeter(args: {
  periodEnd: Date;
  periodStart: Date;
  userId: number;
}) {
  const rows = await db
    .select({
      meterKey: aiUsageEvents.meterKey,
      totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.userId, args.userId),
        gte(aiUsageEvents.createdAt, args.periodStart),
        lte(aiUsageEvents.createdAt, args.periodEnd),
        inArray(aiUsageEvents.status, ["success", "failed"])
      )
    )
    .groupBy(aiUsageEvents.meterKey);

  const result = new Map<MeterUsageResult["meterKey"], number>();
  for (const row of rows) {
    result.set(row.meterKey, Number(row.totalUnits || 0));
  }

  return result;
}

export function buildMeter(args: {
  limit: number | null;
  used: number;
}): EntitlementMeter {
  if (args.limit === null) {
    return {
      limit: null,
      remaining: null,
      used: Math.max(0, args.used),
    };
  }

  const used = Math.max(0, args.used);
  return {
    limit: Math.max(0, args.limit),
    remaining: Math.max(0, args.limit - used),
    used,
  };
}

export function hasBulkUploadAccess(limit: number | null) {
  return limit === null || limit > 0;
}

export async function getUserEntitlement(
  userId: number
): Promise<EntitlementResult> {
  const [subscription, packBalance] = await Promise.all([
    db
      .select({
        billingInterval: subscriptions.billingInterval,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        currentPeriodStart: subscriptions.currentPeriodStart,
        planTier: subscriptions.planTier,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getPackBalance(userId),
  ]);

  const selected = resolveActivePlanSelection({
    subscription,
  });

  const plan =
    (await getPricingPlanBySelection({
      billingInterval: selected.billingInterval,
      planTier: selected.planTier,
    })) || FREE_PLAN_FALLBACK;

  const usageByMeter = await loadUsageByMeter({
    periodEnd: selected.periodEnd,
    periodStart: selected.periodStart,
    userId,
  });

  const aiUsed = usageByMeter.get("ai_extract_credits") || 0;
  const bulkUsed = usageByMeter.get("bulk_upload_batches") || 0;

  const ai = buildMeter({
    limit: plan.aiCreditLimit,
    used: aiUsed,
  });
  const bulk = buildMeter({
    limit: plan.bulkBatchLimit,
    used: bulkUsed,
  });

  return {
    ai: {
      ...ai,
      canAnalyze: ai.remaining === null || ai.remaining > 0 || packBalance > 0,
      effectiveRemaining:
        ai.remaining === null ? null : Math.max(0, ai.remaining + packBalance),
      monthlyRemaining: ai.remaining,
      packBalance,
    },
    billingInterval: selected.billingInterval,
    bulk: {
      ...bulk,
      canUse: hasBulkUploadAccess(plan.bulkBatchLimit),
      maxImagesPerBatch: plan.bulkMaxImagesPerBatch,
    },
    effectivePlan: plan,
    isPaid: plan.planTier !== "free",
    isPro: plan.planTier === "pro_driver",
    periodEnd: selected.periodEnd,
    periodStart: selected.periodStart,
    planTier: plan.planTier,
    status: selected.status,
  };
}

export async function requireProEntitlement(userId: number) {
  const entitlement = await getUserEntitlement(userId);
  return entitlement.isPro;
}

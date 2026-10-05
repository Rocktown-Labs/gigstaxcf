import { billingMeters, pricingPlans } from "@gigstaxcf/db/schema";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/server-env";
import { syncCreditPacksToPolar } from "@/lib/services/credit-packs";
import type { SyncCreditPackResult } from "@/lib/services/credit-packs";
import { getPolarServer, syncPolarProduct } from "@/lib/services/polar-catalog";
import { getPolarCheckoutDiagnostics } from "@/lib/services/polar-checkout-config";
import {
  ensurePricingCatalog,
  listPricingPlans,
} from "@/lib/services/pricing-plans";
import type { AppPlanTier, PricingPlanDto } from "@/lib/services/pricing-plans";

interface SyncPlanResult {
  billingInterval: "month" | "year";
  displayName: string;
  planTier: AppPlanTier;
  polarPriceId: string | null;
  polarProductId: string;
  priceCents: number;
  slug: string;
  syncAction: "created" | "recreated" | "updated";
}

interface SyncMeterResult {
  key: "ai_extract_credits" | "bulk_upload_batches";
  name: string;
  polarMeterId: string;
}

export interface PolarCatalogSyncResult {
  checkoutDiagnostics: Awaited<ReturnType<typeof getPolarCheckoutDiagnostics>>;
  errors: string[];
  packResults: SyncCreditPackResult[];
  planResults: SyncPlanResult[];
  polarEnabled: boolean;
  polarServer: "production" | "sandbox";
  skippedPlans: string[];
  syncTimestamp: string;
  syncedMeterResults: SyncMeterResult[];
}

const polarAccessToken = serverEnv.POLAR_ACCESS_TOKEN || "";
const polarServer = getPolarServer();
const polarOrganizationId = serverEnv.POLAR_ORGANIZATION_ID || "";
const POLAR_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isOrganizationAccessToken = polarAccessToken.startsWith("polar_oat_");

const polarClient = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarServer,
    })
  : null;

function getPolarConfigError() {
  if (!polarAccessToken) {
    return "Polar integration is not configured. Set POLAR_ACCESS_TOKEN.";
  }

  // Organization-scoped access tokens must not send organization_id.
  if (isOrganizationAccessToken) {
    return null;
  }

  const normalizedOrgId = polarOrganizationId.trim();
  if (!normalizedOrgId) {
    return "Polar integration is not configured. Set POLAR_ORGANIZATION_ID.";
  }

  if (!POLAR_UUID_REGEX.test(normalizedOrgId)) {
    if (normalizedOrgId.startsWith("polar_oat_")) {
      return "POLAR_ORGANIZATION_ID is invalid: it appears to be a Polar access token. Use your Polar Organization UUID instead.";
    }

    return "POLAR_ORGANIZATION_ID is invalid: expected a UUID from Polar organization settings.";
  }

  return null;
}

function withOrganizationId<T extends Record<string, unknown>>(payload: T): T {
  if (isOrganizationAccessToken) {
    return payload;
  }

  return {
    ...payload,
    organizationId: polarOrganizationId,
  };
}

const METER_EVENT_NAMES = {
  ai_extract_credits: "gigstax.ai_extract_credit",
  bulk_upload_batches: "gigstax.bulk_upload_batch",
} as const;

const METER_LABELS = {
  ai_extract_credits: "AI Extract Credits",
  bulk_upload_batches: "Bulk Upload Batches",
} as const;

function isPaidRecurringPlan(plan: PricingPlanDto) {
  return (
    plan.planTier !== "free" &&
    plan.billingInterval !== null &&
    plan.isActive === true
  );
}

async function ensureMeterRows() {
  const now = new Date();

  for (const [key, displayName] of Object.entries(METER_LABELS) as [
    "ai_extract_credits" | "bulk_upload_batches",
    string,
  ][]) {
    const [existing] = await db
      .select({ id: billingMeters.id })
      .from(billingMeters)
      .where(eq(billingMeters.key, key))
      .limit(1);

    if (existing) {
      await db
        .update(billingMeters)
        .set({
          displayName,
          updatedAt: now,
        })
        .where(eq(billingMeters.id, existing.id));
      continue;
    }

    await db.insert(billingMeters).values({
      displayName,
      key,
      updatedAt: now,
    });
  }
}

async function syncMeters(): Promise<{
  errors: string[];
  results: SyncMeterResult[];
}> {
  const errors: string[] = [];
  const results: SyncMeterResult[] = [];

  const rows = await db
    .select({
      displayName: billingMeters.displayName,
      id: billingMeters.id,
      key: billingMeters.key,
      polarMeterId: billingMeters.polarMeterId,
    })
    .from(billingMeters);

  if (!polarClient || (!isOrganizationAccessToken && !polarOrganizationId)) {
    return { errors, results };
  }

  for (const meter of rows) {
    try {
      const meterName = meter.displayName || METER_LABELS[meter.key];

      // Polar doesn't allow changing filter/aggregation once a meter has
      // started aggregating events, so only create new meters here.
      if (meter.polarMeterId) {
        results.push({
          key: meter.key,
          name: meterName,
          polarMeterId: meter.polarMeterId,
        });
        continue;
      }

      const payload = {
        aggregation: { func: "count" as const },
        filter: {
          clauses: [
            {
              operator: "eq" as const,
              property: "name",
              value: METER_EVENT_NAMES[meter.key],
            },
          ],
          conjunction: "and" as const,
        },
        name: meterName,
      };
      const meterPayload = withOrganizationId(payload);

      const syncedMeter = await polarClient.meters.create(meterPayload);

      await db
        .update(billingMeters)
        .set({
          polarMeterId: syncedMeter.id,
          updatedAt: new Date(),
        })
        .where(eq(billingMeters.id, meter.id));

      results.push({
        key: meter.key,
        name: syncedMeter.name,
        polarMeterId: syncedMeter.id,
      });
    } catch (error) {
      errors.push(
        `[meter:${meter.key}] ${
          error instanceof Error ? error.message : "Failed to sync meter"
        }`
      );
    }
  }

  return { errors, results };
}

async function syncPlan(plan: PricingPlanDto): Promise<SyncPlanResult> {
  if (!polarClient || (!isOrganizationAccessToken && !polarOrganizationId)) {
    throw new Error("Polar integration is not configured");
  }

  const baseProduct = withOrganizationId({
    description: plan.description || null,
    name: plan.displayName,
    prices: [
      {
        amountType: "fixed" as const,
        priceAmount: plan.priceCents,
        priceCurrency: "usd" as const,
      },
    ],
    recurringInterval: plan.billingInterval,
  });

  const { product: syncedProduct, syncAction } = await syncPolarProduct({
    baseProduct,
    client: polarClient.products,
    currentProductId: plan.polarProductId,
  });

  const firstPriceId =
    syncedProduct.prices.find((price) => "id" in price)?.id || null;

  await db
    .update(pricingPlans)
    .set({
      lastSyncedAt: new Date(),
      polarPriceId: firstPriceId,
      polarProductId: syncedProduct.id,
      updatedAt: new Date(),
    })
    .where(eq(pricingPlans.id, plan.id));

  return {
    billingInterval: plan.billingInterval || "month",
    displayName: plan.displayName,
    planTier: plan.planTier,
    polarPriceId: firstPriceId,
    polarProductId: syncedProduct.id,
    priceCents: plan.priceCents,
    slug: plan.slug,
    syncAction,
  };
}

export async function syncPricingCatalogToPolar(): Promise<PolarCatalogSyncResult> {
  await ensurePricingCatalog();
  await ensureMeterRows();

  const plans = await listPricingPlans({ activeOnly: false });
  const paidPlans = plans.filter(isPaidRecurringPlan);

  const errors: string[] = [];
  const packResults: SyncCreditPackResult[] = [];
  const planResults: SyncPlanResult[] = [];
  const skippedPlans: string[] = [];

  const polarConfigError = getPolarConfigError();
  if (!polarClient || polarConfigError) {
    return {
      checkoutDiagnostics: await getPolarCheckoutDiagnostics(),
      errors: [
        polarConfigError ||
          "Polar integration is not configured. Set POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID.",
      ],
      packResults,
      planResults,
      polarEnabled: false,
      polarServer,
      skippedPlans: paidPlans.map((plan) => plan.slug),
      syncTimestamp: new Date().toISOString(),
      syncedMeterResults: [],
    };
  }

  for (const plan of paidPlans) {
    try {
      const synced = await syncPlan(plan);
      planResults.push(synced);
    } catch (error) {
      errors.push(
        `[plan:${plan.slug}] ${
          error instanceof Error ? error.message : "Failed to sync plan"
        }`
      );
      skippedPlans.push(plan.slug);
    }
  }

  const meterSync = await syncMeters();
  errors.push(...meterSync.errors);

  const packSync = await syncCreditPacksToPolar();
  errors.push(...packSync.errors);
  packResults.push(...packSync.packResults);

  const checkoutDiagnostics = await getPolarCheckoutDiagnostics();

  return {
    checkoutDiagnostics,
    errors,
    packResults,
    planResults,
    polarEnabled: true,
    polarServer,
    skippedPlans,
    syncTimestamp: new Date().toISOString(),
    syncedMeterResults: meterSync.results,
  };
}

export async function getAdminPricingPlans() {
  await ensurePricingCatalog();

  return db
    .select({
      aiCreditLimit: pricingPlans.aiCreditLimit,
      billingInterval: pricingPlans.billingInterval,
      bulkBatchLimit: pricingPlans.bulkBatchLimit,
      bulkMaxImagesPerBatch: pricingPlans.bulkMaxImagesPerBatch,
      currencyCode: pricingPlans.currencyCode,
      description: pricingPlans.description,
      displayName: pricingPlans.displayName,
      features: pricingPlans.features,
      id: pricingPlans.id,
      isActive: pricingPlans.isActive,
      lastSyncedAt: pricingPlans.lastSyncedAt,
      planTier: pricingPlans.planTier,
      polarPriceId: pricingPlans.polarPriceId,
      polarProductId: pricingPlans.polarProductId,
      priceCents: pricingPlans.priceCents,
      slug: pricingPlans.slug,
      sortOrder: pricingPlans.sortOrder,
      updatedAt: pricingPlans.updatedAt,
    })
    .from(pricingPlans);
}

export async function updateAdminPricingPlan(args: {
  id: number;
  patch: {
    aiCreditLimit?: number | null;
    bulkBatchLimit?: number | null;
    bulkMaxImagesPerBatch?: number | null;
    currencyCode?: string;
    description?: string;
    displayName?: string;
    features?: string[];
    isActive?: boolean;
    priceCents?: number;
    sortOrder?: number;
  };
}) {
  const [updated] = await db
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

  return updated || null;
}

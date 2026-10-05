import { onboardingOfferConfigs } from "@gigstaxcf/db/schema";
import { Polar } from "@polar-sh/sdk";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/server-env";
import { getPolarServer } from "@/lib/services/polar-catalog";
import { getPolarCheckoutDiagnostics } from "@/lib/services/polar-checkout-config";

const polarAccessToken = serverEnv.POLAR_ACCESS_TOKEN || "";
const polarOrganizationId = serverEnv.POLAR_ORGANIZATION_ID || "";
const polarServer = getPolarServer();
const isOrganizationAccessToken = polarAccessToken.startsWith("polar_oat_");

const polarClient = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarServer,
    })
  : null;

export interface OnboardingOfferRecord {
  active: boolean;
  code: string;
  createdAt: string;
  discountId: string;
  id: number;
  lastSyncedAt: string | null;
  productId: string;
  updatedAt: string;
}

function toOfferRecord(
  value: typeof onboardingOfferConfigs.$inferSelect
): OnboardingOfferRecord {
  return {
    active: value.active,
    code: value.code,
    createdAt: value.createdAt.toISOString(),
    discountId: value.discountId,
    id: value.id,
    lastSyncedAt: value.lastSyncedAt?.toISOString() || null,
    productId: value.productId,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function withOrganizationId<T extends Record<string, unknown>>(payload: T): T {
  if (isOrganizationAccessToken) {
    return payload;
  }

  if (!polarOrganizationId.trim()) {
    throw new Error("POLAR_ORGANIZATION_ID is not configured");
  }

  return {
    ...payload,
    organizationId: polarOrganizationId.trim(),
  };
}

function generateOfferCode() {
  return `GSTAXFREE${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function expireDiscountBestEffort(discountId: string) {
  await polarClient?.discounts
    .update({
      discountUpdate: {
        endsAt: new Date(),
      },
      id: discountId,
    })
    .catch(() => null);
}

async function resolveStarterProductId() {
  const diagnostics = await getPolarCheckoutDiagnostics();
  const mapping = diagnostics.planMappings.find(
    (plan) => plan.slug === "starter-monthly"
  );

  if (!mapping?.productId) {
    throw new Error(
      "Starter Monthly does not have a synced Polar product ID yet. Sync pricing to Polar first."
    );
  }

  return {
    checkoutDiagnostics: diagnostics,
    productId: mapping.productId,
  };
}

export async function getLatestOnboardingOfferConfig() {
  const [record] = await db
    .select()
    .from(onboardingOfferConfigs)
    .orderBy(desc(onboardingOfferConfigs.updatedAt))
    .limit(1);

  return record ? toOfferRecord(record) : null;
}

export async function getActiveOnboardingOfferConfig() {
  const [record] = await db
    .select()
    .from(onboardingOfferConfigs)
    .where(eq(onboardingOfferConfigs.active, true))
    .orderBy(desc(onboardingOfferConfigs.updatedAt))
    .limit(1);

  return record ? toOfferRecord(record) : null;
}

export async function getOnboardingOfferAdminState() {
  const [offer, checkoutDiagnostics] = await Promise.all([
    getLatestOnboardingOfferConfig(),
    getPolarCheckoutDiagnostics(),
  ]);

  return {
    checkoutDiagnostics,
    offer,
    polarConfigured: Boolean(polarClient),
    polarServer,
  };
}

export async function syncStarterOnboardingOffer(args?: {
  regenerate?: boolean;
}) {
  if (!polarClient) {
    throw new Error("POLAR_ACCESS_TOKEN is not configured");
  }

  const regenerate = args?.regenerate === true;
  const [existing, starter] = await Promise.all([
    getActiveOnboardingOfferConfig(),
    resolveStarterProductId(),
  ]);

  if (
    existing &&
    !regenerate &&
    existing.productId === starter.productId &&
    existing.active
  ) {
    return {
      checkoutDiagnostics: starter.checkoutDiagnostics,
      offer: existing,
      reused: true,
    };
  }

  const code = generateOfferCode();
  const syncedDiscount = await polarClient.discounts.create(
    withOrganizationId({
      amount: 100,
      code,
      duration: "once" as const,
      name: "Starter first month free",
      products: [starter.productId],
      type: "fixed" as const,
    })
  );

  const now = new Date();
  try {
    await db.execute(sql`
      WITH deactivated AS (
        UPDATE "onboarding_offer_configs"
        SET
          "active" = false,
          "updated_at" = ${now}
        WHERE "active" = true
      )
      INSERT INTO "onboarding_offer_configs" (
        "active",
        "code",
        "discount_id",
        "last_synced_at",
        "product_id",
        "updated_at"
      )
      VALUES (
        true,
        ${code},
        ${syncedDiscount.id},
        ${now},
        ${starter.productId},
        ${now}
      )
    `);
  } catch (error) {
    await expireDiscountBestEffort(syncedDiscount.id);
    throw error;
  }

  const created = await getActiveOnboardingOfferConfig();
  if (!created || created.discountId !== syncedDiscount.id) {
    await expireDiscountBestEffort(syncedDiscount.id);
    throw new Error("Failed to persist onboarding offer");
  }

  if (existing?.discountId) {
    await expireDiscountBestEffort(existing.discountId);
  }

  return {
    checkoutDiagnostics: starter.checkoutDiagnostics,
    offer: created,
    reused: false,
  };
}

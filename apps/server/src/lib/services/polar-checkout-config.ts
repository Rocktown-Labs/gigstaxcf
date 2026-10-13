import { creditPacks, pricingPlans } from "@gigstaxcf/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { serverEnv } from "@/lib/server-env";
import { getPolarServer } from "@/lib/services/polar-catalog";

export type PolarCheckoutPlanSlug =
  | "starter-monthly"
  | "driver-monthly"
  | "driver-yearly"
  | "pro-driver-monthly"
  | "pro-driver-yearly";

export type PolarCheckoutSlug = PolarCheckoutPlanSlug | string;

export interface PolarCheckoutProductMapping {
  dbProductId: string | null;
  envProductId: string | null;
  envVar?: string;
  productId: string | null;
  slug: string;
  source: "db" | "env" | "missing";
}

export interface PolarCheckoutDiagnostics {
  packMappings: PolarCheckoutProductMapping[];
  planMappings: PolarCheckoutProductMapping[];
  polarServer: ReturnType<typeof getPolarServer>;
  warnings: string[];
}

const POLAR_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const POLAR_CHECKOUT_PLAN_SLUGS = [
  "starter-monthly",
  "driver-monthly",
  "driver-yearly",
  "pro-driver-monthly",
  "pro-driver-yearly",
] as const satisfies PolarCheckoutPlanSlug[];

function isPolarCheckoutPlanSlug(
  value: string
): value is PolarCheckoutPlanSlug {
  return POLAR_CHECKOUT_PLAN_SLUGS.includes(value as PolarCheckoutPlanSlug);
}

export function normalizePolarProductId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!POLAR_UUID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

const checkoutProductConfigs = [
  {
    billingInterval: "month" as const,
    envVar: "POLAR_STARTER_MONTHLY_PRODUCT_ID",
    planTier: "starter" as const,
    slug: "starter-monthly" as const,
    value: serverEnv.POLAR_STARTER_MONTHLY_PRODUCT_ID || "",
  },
  {
    billingInterval: "month" as const,
    envVar: "POLAR_DRIVER_MONTHLY_PRODUCT_ID",
    planTier: "driver" as const,
    slug: "driver-monthly" as const,
    value: serverEnv.POLAR_DRIVER_MONTHLY_PRODUCT_ID || "",
  },
  {
    billingInterval: "year" as const,
    envVar: "POLAR_DRIVER_YEARLY_PRODUCT_ID",
    planTier: "driver" as const,
    slug: "driver-yearly" as const,
    value: serverEnv.POLAR_DRIVER_YEARLY_PRODUCT_ID || "",
  },
  {
    billingInterval: "month" as const,
    envVar: "POLAR_PRO_DRIVER_MONTHLY_PRODUCT_ID",
    planTier: "pro_driver" as const,
    slug: "pro-driver-monthly" as const,
    value:
      serverEnv.POLAR_PRO_DRIVER_MONTHLY_PRODUCT_ID ||
      serverEnv.POLAR_PRO_MONTHLY_PRODUCT_ID ||
      "",
  },
  {
    billingInterval: "year" as const,
    envVar: "POLAR_PRO_DRIVER_YEARLY_PRODUCT_ID",
    planTier: "pro_driver" as const,
    slug: "pro-driver-yearly" as const,
    value:
      serverEnv.POLAR_PRO_DRIVER_YEARLY_PRODUCT_ID ||
      serverEnv.POLAR_PRO_YEARLY_PRODUCT_ID ||
      "",
  },
].map((config) => {
  const normalized = normalizePolarProductId(config.value);
  if (config.value && !normalized) {
    logger.warn(
      {
        envVar: config.envVar,
      },
      "invalid_polar_product_uuid"
    );
  }

  return {
    ...config,
    productId: normalized,
  };
});

const checkoutProductBySlug = new Map<
  string,
  (typeof checkoutProductConfigs)[number]
>(checkoutProductConfigs.map((config) => [config.slug, config]));
const checkoutProductById = new Map<
  string,
  (typeof checkoutProductConfigs)[number]
>(
  checkoutProductConfigs
    .filter((config) => Boolean(config.productId))
    .map((config) => [config.productId as string, config])
);

export function getPolarCheckoutPlanConfigByProductId(productId: string) {
  return checkoutProductById.get(productId) || null;
}

export function hasPolarCheckoutSlugFromEnv(slug: string) {
  const config = checkoutProductBySlug.get(slug);
  return Boolean(config?.productId);
}

/**
 * Ported from the gigstax `hasPolarCheckoutSlug` helper in lib/auth/server.ts:
 * env-configured product IDs win, then any resolved checkout catalog
 * entry (database plan/pack mappings) counts too.
 */
export async function hasPolarCheckoutSlug(slug: string) {
  if (hasPolarCheckoutSlugFromEnv(slug)) {
    return true;
  }

  const checkoutProducts = await resolvePolarCheckoutProducts();
  return checkoutProducts.some((product) => product.slug === slug);
}

export async function getPolarCheckoutDiagnostics(): Promise<PolarCheckoutDiagnostics> {
  const warnings: string[] = [];
  const dbPlanProductIds = new Map<string, string | null>();

  try {
    const rows = await db
      .select({
        polarProductId: pricingPlans.polarProductId,
        slug: pricingPlans.slug,
      })
      .from(pricingPlans)
      .where(inArray(pricingPlans.slug, [...POLAR_CHECKOUT_PLAN_SLUGS]));

    for (const row of rows) {
      if (!isPolarCheckoutPlanSlug(row.slug)) {
        continue;
      }

      dbPlanProductIds.set(
        row.slug,
        normalizePolarProductId(row.polarProductId || "")
      );
    }
  } catch (error) {
    logger.error({ error }, "polar_checkout_plan_diagnostics_query_failed");
    warnings.push(
      "Failed to inspect pricing plan checkout mappings from the database."
    );
  }

  const planMappings = checkoutProductConfigs.map((config) => {
    const dbProductId = dbPlanProductIds.get(config.slug) || null;
    const envProductId = config.productId;
    const productId = envProductId || dbProductId || null;
    const source: PolarCheckoutProductMapping["source"] = envProductId
      ? "env"
      : dbProductId
        ? "db"
        : "missing";

    if (envProductId && dbProductId && envProductId !== dbProductId) {
      warnings.push(
        `${config.slug} is using ${config.envVar} and overriding a different database product ID.`
      );
    }

    return {
      dbProductId,
      envProductId,
      envVar: config.envVar,
      productId,
      slug: config.slug,
      source,
    };
  });

  let packMappings: PolarCheckoutProductMapping[] = [];
  try {
    const rows = await db
      .select({
        polarProductId: creditPacks.polarProductId,
        slug: creditPacks.slug,
      })
      .from(creditPacks)
      .where(and(eq(creditPacks.isActive, true)))
      .orderBy(asc(creditPacks.sortOrder), asc(creditPacks.id));

    packMappings = rows.map((row) => {
      const dbProductId = normalizePolarProductId(row.polarProductId || "");

      return {
        dbProductId,
        envProductId: null,
        productId: dbProductId,
        slug: row.slug,
        source: dbProductId ? "db" : "missing",
      };
    });
  } catch (error) {
    logger.error({ error }, "polar_checkout_pack_diagnostics_query_failed");
    warnings.push(
      "Failed to inspect credit pack checkout mappings from the database."
    );
  }

  return {
    packMappings,
    planMappings,
    polarServer: getPolarServer(),
    warnings,
  };
}

export async function resolvePolarCheckoutProducts() {
  const diagnostics = await getPolarCheckoutDiagnostics();

  return [...diagnostics.planMappings, ...diagnostics.packMappings]
    .filter((mapping) => Boolean(mapping.productId))
    .map((mapping) => ({
      productId: mapping.productId as string,
      slug: mapping.slug,
    }));
}

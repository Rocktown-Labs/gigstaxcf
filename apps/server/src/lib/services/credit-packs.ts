import { creditPacks } from "@gigstaxcf/db/schema";
import { Polar } from "@polar-sh/sdk";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/server-env";
import { getPolarServer, syncPolarProduct } from "@/lib/services/polar-catalog";

export interface CreditPackDefinition {
  credits: number;
  currencyCode: string;
  description: string;
  displayName: string;
  isActive: boolean;
  priceCents: number;
  slug: string;
  sortOrder: number;
}

export interface CreditPackDto extends CreditPackDefinition {
  id: number;
  lastSyncedAt: string | null;
  polarPriceId: string | null;
  polarProductId: string | null;
  updatedAt: string;
}

export interface SyncCreditPackResult {
  credits: number;
  displayName: string;
  polarPriceId: string | null;
  polarProductId: string;
  priceCents: number;
  slug: string;
  syncAction: "created" | "recreated" | "updated";
}

export interface CreditPackSyncResult {
  errors: string[];
  packResults: SyncCreditPackResult[];
  polarEnabled: boolean;
  skippedPacks: string[];
  syncTimestamp: string;
}

const DEFAULT_CREDIT_PACKS: CreditPackDefinition[] = [
  {
    credits: 50,
    currencyCode: "USD",
    description: "One-time credit pack for occasional users.",
    displayName: "AI Pack 50",
    isActive: true,
    priceCents: 500,
    slug: "ai-pack-50",
    sortOrder: 10,
  },
];

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

let ensureCreditPackCatalogPromise: Promise<void> | null = null;

function toCreditPackDto(row: typeof creditPacks.$inferSelect): CreditPackDto {
  return {
    credits: row.credits,
    currencyCode: row.currencyCode,
    description: row.description || "",
    displayName: row.displayName,
    id: row.id,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    polarPriceId: row.polarPriceId,
    polarProductId: row.polarProductId,
    priceCents: row.priceCents,
    slug: row.slug,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getPolarConfigError() {
  if (!polarAccessToken) {
    return "Polar integration is not configured. Set POLAR_ACCESS_TOKEN.";
  }

  if (isOrganizationAccessToken) {
    return null;
  }

  const normalizedOrgId = polarOrganizationId.trim();
  if (!normalizedOrgId) {
    return "Polar integration is not configured. Set POLAR_ORGANIZATION_ID.";
  }

  if (!POLAR_UUID_REGEX.test(normalizedOrgId)) {
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

function parsePolarCurrency(_currencyCode: string): "usd" {
  return "usd";
}

async function syncCreditPack(
  pack: CreditPackDto
): Promise<SyncCreditPackResult> {
  if (!polarClient || (!isOrganizationAccessToken && !polarOrganizationId)) {
    throw new Error("Polar integration is not configured");
  }

  const baseProduct = withOrganizationId({
    description: pack.description || null,
    name: pack.displayName,
    prices: [
      {
        amountType: "fixed" as const,
        priceAmount: pack.priceCents,
        priceCurrency: parsePolarCurrency(pack.currencyCode),
      },
    ],
  });

  const { product: syncedProduct, syncAction } = await syncPolarProduct({
    baseProduct,
    client: polarClient.products,
    currentProductId: pack.polarProductId,
  });

  const firstPriceId =
    syncedProduct.prices.find((price) => "id" in price)?.id || null;

  await db
    .update(creditPacks)
    .set({
      lastSyncedAt: new Date(),
      polarPriceId: firstPriceId,
      polarProductId: syncedProduct.id,
      updatedAt: new Date(),
    })
    .where(eq(creditPacks.id, pack.id));

  return {
    credits: pack.credits,
    displayName: pack.displayName,
    polarPriceId: firstPriceId,
    polarProductId: syncedProduct.id,
    priceCents: pack.priceCents,
    slug: pack.slug,
    syncAction,
  };
}

export function ensureCreditPackCatalog() {
  if (ensureCreditPackCatalogPromise) {
    return ensureCreditPackCatalogPromise;
  }

  ensureCreditPackCatalogPromise = (async () => {
    for (const pack of DEFAULT_CREDIT_PACKS) {
      await db
        .insert(creditPacks)
        .values({
          credits: pack.credits,
          currencyCode: pack.currencyCode,
          description: pack.description,
          displayName: pack.displayName,
          isActive: pack.isActive,
          priceCents: pack.priceCents,
          slug: pack.slug,
          sortOrder: pack.sortOrder,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: {
            credits: pack.credits,
            currencyCode: pack.currencyCode,
            description: pack.description,
            displayName: pack.displayName,
            isActive: pack.isActive,
            priceCents: pack.priceCents,
            sortOrder: pack.sortOrder,
            updatedAt: new Date(),
          },
          target: creditPacks.slug,
        });
    }
  })().catch((error) => {
    ensureCreditPackCatalogPromise = null;
    throw error;
  });

  return ensureCreditPackCatalogPromise;
}

export async function listCreditPacks(args?: {
  activeOnly?: boolean;
}): Promise<CreditPackDto[]> {
  await ensureCreditPackCatalog();

  const where = args?.activeOnly ? eq(creditPacks.isActive, true) : undefined;

  const rows = await db
    .select()
    .from(creditPacks)
    .where(where)
    .orderBy(asc(creditPacks.sortOrder), asc(creditPacks.id));

  return rows.map(toCreditPackDto);
}

export function listActiveCreditPacks() {
  return listCreditPacks({ activeOnly: true });
}

export async function getCreditPackBySlug(slug: string) {
  await ensureCreditPackCatalog();

  const [row] = await db
    .select()
    .from(creditPacks)
    .where(eq(creditPacks.slug, slug))
    .limit(1);

  return row ? toCreditPackDto(row) : null;
}

export async function getCreditPackByPolarProductId(productId: string) {
  await ensureCreditPackCatalog();

  const [row] = await db
    .select()
    .from(creditPacks)
    .where(eq(creditPacks.polarProductId, productId))
    .limit(1);

  return row ? toCreditPackDto(row) : null;
}

export async function updateCreditPackById(args: {
  id: number;
  patch: {
    credits?: number;
    currencyCode?: string;
    description?: string;
    displayName?: string;
    isActive?: boolean;
    polarPriceId?: string | null;
    polarProductId?: string | null;
    priceCents?: number;
    sortOrder?: number;
  };
}) {
  const [row] = await db
    .update(creditPacks)
    .set({
      credits: args.patch.credits,
      currencyCode: args.patch.currencyCode,
      description: args.patch.description,
      displayName: args.patch.displayName,
      isActive: args.patch.isActive,
      polarPriceId: args.patch.polarPriceId,
      polarProductId: args.patch.polarProductId,
      priceCents: args.patch.priceCents,
      sortOrder: args.patch.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(creditPacks.id, args.id))
    .returning();

  return row ? toCreditPackDto(row) : null;
}

export async function syncCreditPacksToPolar(): Promise<CreditPackSyncResult> {
  await ensureCreditPackCatalog();

  const packs = await listCreditPacks({ activeOnly: false });
  const activePacks = packs.filter((pack) => pack.isActive);

  const errors: string[] = [];
  const packResults: SyncCreditPackResult[] = [];
  const skippedPacks: string[] = [];

  const polarConfigError = getPolarConfigError();
  if (!polarClient || polarConfigError) {
    return {
      errors: [
        polarConfigError ||
          "Polar integration is not configured. Set POLAR_ACCESS_TOKEN and POLAR_ORGANIZATION_ID.",
      ],
      packResults,
      polarEnabled: false,
      skippedPacks: activePacks.map((pack) => pack.slug),
      syncTimestamp: new Date().toISOString(),
    };
  }

  for (const pack of activePacks) {
    try {
      const synced = await syncCreditPack(pack);
      packResults.push(synced);
    } catch (error) {
      errors.push(
        `[pack:${pack.slug}] ${
          error instanceof Error ? error.message : "Failed to sync credit pack"
        }`
      );
      skippedPacks.push(pack.slug);
    }
  }

  return {
    errors,
    packResults,
    polarEnabled: true,
    skippedPacks,
    syncTimestamp: new Date().toISOString(),
  };
}

export async function getActiveCreditPackSlugs() {
  const packs = await listActiveCreditPacks();
  return packs.map((pack) => pack.slug);
}

export async function getActiveCreditPacksWithPolarProducts() {
  const packs = await listActiveCreditPacks();
  return packs.filter((pack) => {
    const productId = (pack.polarProductId || "").trim();
    return productId.length > 0;
  });
}

export async function getCreditPackByPolarPriceOrProduct(args: {
  polarPriceId: string | null;
  polarProductId: string | null;
}) {
  await ensureCreditPackCatalog();

  const productId = args.polarProductId?.trim() || null;
  const priceId = args.polarPriceId?.trim() || null;

  if (productId) {
    const [byProductRow] = await db
      .select()
      .from(creditPacks)
      .where(
        and(
          eq(creditPacks.polarProductId, productId),
          eq(creditPacks.isActive, true)
        )
      )
      .limit(1);

    if (byProductRow) {
      return toCreditPackDto(byProductRow);
    }
  }

  if (!priceId) {
    return null;
  }

  const [byPriceRow] = await db
    .select()
    .from(creditPacks)
    .where(
      and(eq(creditPacks.polarPriceId, priceId), eq(creditPacks.isActive, true))
    )
    .limit(1);

  return byPriceRow ? toCreditPackDto(byPriceRow) : null;
}

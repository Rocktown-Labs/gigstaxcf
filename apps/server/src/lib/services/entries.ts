import {
  aiExtractions,
  earningsEntries,
  entryMedia,
  mediaAssets,
  platforms,
  userPlatforms,
} from "@gigstaxcf/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { ensureDefaultPlatforms } from "@/lib/db/platform-seed";
import {
  createMediaAsset,
  linkMediaToEntry,
  resolveMediaAssetUrl,
  uploadFileToBlob,
} from "@/lib/services/media";
import {
  getEntryTripVerificationForUser,
  seedEntryTripVerificationFromExtraction,
} from "@/lib/services/trip-verifications";
import type { EntryCreateInput, EntryPatchInput } from "@/lib/validations";

export interface EntryFilters {
  startDate?: string | null;
  endDate?: string | null;
  platformSlug?: string | null;
  status?: "offered" | "accepted" | "completed" | "cancelled" | null;
  tipStatus?: "none" | "pending" | "final" | null;
  sort?: "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
  page?: number;
  pageSize?: number;
  limit?: number;
}

export interface EntriesSummary {
  totalLogs: number;
  totalMiles: number;
  totalPayout: number;
  totalTips: number;
}

export interface EntriesPagination {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedEntriesResult {
  entries: Record<string, unknown>[];
  pagination: EntriesPagination;
  summary: EntriesSummary;
}

const toNumericString = (value: number | null | undefined) => {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return value;
  }

  return value.toString();
};

const toDateOrNull = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toDateOrThrow = (value: string, field: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid ${field}`);
  }

  return parsed;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildEntriesWhereClauses = (userId: number, filters: EntryFilters) => {
  const status = filters.status ?? null;
  const tipStatus = filters.tipStatus ?? null;
  const platformFilterSlug = filters.platformSlug ?? null;
  const startDate = toDateOrNull(filters.startDate ?? null);
  const endDate = toDateOrNull(filters.endDate ?? null);

  const whereClauses = [eq(earningsEntries.userId, userId)];

  if (status) {
    whereClauses.push(eq(earningsEntries.status, status));
  }

  if (tipStatus) {
    whereClauses.push(eq(earningsEntries.tipStatus, tipStatus));
  }

  if (platformFilterSlug) {
    whereClauses.push(eq(platforms.slug, platformFilterSlug));
  }

  if (startDate) {
    whereClauses.push(gte(earningsEntries.occurredAt, startDate));
  }

  if (endDate) {
    whereClauses.push(lte(earningsEntries.occurredAt, endDate));
  }

  return whereClauses;
};

const tipAmountSql = sql<number>`
  CASE
    WHEN ${earningsEntries.tipStatus} = 'final' THEN COALESCE(${earningsEntries.tipFinalAmount}, 0)
    WHEN ${earningsEntries.tipStatus} = 'pending' THEN COALESCE(${earningsEntries.tipEstimatedAmount}, 0)
    ELSE COALESCE(${earningsEntries.tipFinalAmount}, ${earningsEntries.tipEstimatedAmount}, 0)
  END
`;

const componentTotalSql = sql<number>`
  COALESCE(${earningsEntries.fareAmount}, 0) +
  COALESCE(${earningsEntries.bonusAmount}, 0) +
  ${tipAmountSql}
`;

const effectiveTotalSql = sql<number>`
  CASE
    WHEN ${earningsEntries.totalFinalAmount} IS NOT NULL THEN ${earningsEntries.totalFinalAmount}
    WHEN ${earningsEntries.totalEstimatedAmount} IS NOT NULL THEN ${earningsEntries.totalEstimatedAmount}
    ELSE ${componentTotalSql}
  END
`;

const getOrderBy = (sort: EntryFilters["sort"]) => {
  switch (sort) {
    case "date-asc": {
      return [
        asc(earningsEntries.occurredAt),
        asc(earningsEntries.id),
      ] as const;
    }
    case "amount-desc": {
      return [desc(effectiveTotalSql), desc(earningsEntries.id)] as const;
    }
    case "amount-asc": {
      return [asc(effectiveTotalSql), asc(earningsEntries.id)] as const;
    }
    default: {
      return [
        desc(earningsEntries.occurredAt),
        desc(earningsEntries.id),
      ] as const;
    }
  }
};

const getEntryValue = (
  entry: Record<string, unknown>,
  camel: string,
  snake: string
) => entry[camel] ?? entry[snake];

export function getEffectiveTip(entry: Record<string, unknown>) {
  const tipStatus = getEntryValue(entry, "tipStatus", "tip_status");
  const tipFinalAmount = getEntryValue(
    entry,
    "tipFinalAmount",
    "tip_final_amount"
  );
  const tipEstimatedAmount = getEntryValue(
    entry,
    "tipEstimatedAmount",
    "tip_estimated_amount"
  );
  const parsedFinal = Number(tipFinalAmount || 0);
  const parsedEstimated = Number(tipEstimatedAmount || 0);

  if (tipStatus === "final") {
    return Number.isFinite(parsedFinal) ? parsedFinal : 0;
  }

  if (tipStatus === "pending") {
    return Number.isFinite(parsedEstimated) ? parsedEstimated : 0;
  }

  if (Number.isFinite(parsedFinal) && parsedFinal > 0) {
    return parsedFinal;
  }

  if (Number.isFinite(parsedEstimated) && parsedEstimated > 0) {
    return parsedEstimated;
  }

  return 0;
}

export function getEffectiveTotal(entry: Record<string, unknown>) {
  const totalFinalAmount = getEntryValue(
    entry,
    "totalFinalAmount",
    "total_final_amount"
  );
  const totalEstimatedAmount = getEntryValue(
    entry,
    "totalEstimatedAmount",
    "total_estimated_amount"
  );

  const fareAmount = getEntryValue(entry, "fareAmount", "fare_amount");
  const bonusAmount = getEntryValue(entry, "bonusAmount", "bonus_amount");
  const componentTotal =
    Number(fareAmount || 0) + Number(bonusAmount || 0) + getEffectiveTip(entry);

  if (totalFinalAmount !== null && totalFinalAmount !== undefined) {
    const parsedFinal = Number(totalFinalAmount);
    if (
      Number.isFinite(parsedFinal) &&
      (parsedFinal > 0 || componentTotal === 0)
    ) {
      return parsedFinal;
    }
  }

  if (totalEstimatedAmount !== null && totalEstimatedAmount !== undefined) {
    const parsedEstimated = Number(totalEstimatedAmount);
    if (
      Number.isFinite(parsedEstimated) &&
      (parsedEstimated > 0 || componentTotal === 0)
    ) {
      return parsedEstimated;
    }
  }

  return componentTotal;
}

export function mapEntryToLegacyDelivery(entry: Record<string, unknown>) {
  const occurredAtValue = getEntryValue(entry, "occurredAt", "occurred_at");
  const completedAtValue = getEntryValue(entry, "completedAt", "completed_at");
  const distanceMiles = getEntryValue(entry, "distanceMiles", "distance_miles");
  const notes = getEntryValue(entry, "notes", "notes");
  const platformSlug = getEntryValue(entry, "platformSlug", "platform_slug");
  const mediaUrl = getEntryValue(entry, "screenshotUrl", "primary_media_url");
  const fareAmount = getEntryValue(entry, "fareAmount", "fare_amount");

  const occurredAt = occurredAtValue
    ? new Date(String(occurredAtValue)).toISOString()
    : null;
  const completedAt = completedAtValue
    ? new Date(String(completedAtValue)).toISOString()
    : occurredAt;

  return {
    delivered_at: completedAt,
    delivery_date: occurredAt,
    delivery_fee: Number(fareAmount || 0),
    estimated_total: getEffectiveTotal(entry),
    id: entry.id,
    miles: Number(distanceMiles || 0),
    notes: notes ?? null,
    platform_slug: platformSlug ?? "walmart_spark",
    screenshot_url: mediaUrl ?? null,
    tip: getEffectiveTip(entry),
  };
}

interface EntryRow {
  entry: typeof earningsEntries.$inferSelect;
  platformColorHex: string;
  platformDisplayName: string;
  platformSlug: string;
  userPlatformColorHex: string | null;
}

const loadPrimaryMediaByEntryId = async (entryIds: number[]) => {
  const mediaByEntryId = new Map<number, string>();
  if (entryIds.length === 0) {
    return mediaByEntryId;
  }

  const mediaRows = await db
    .select({
      createdAt: entryMedia.createdAt,
      entryId: entryMedia.entryId,
      isPrimary: entryMedia.isPrimary,
      mediaId: mediaAssets.id,
      storageProvider: mediaAssets.storageProvider,
      storageUrl: mediaAssets.storageUrl,
    })
    .from(entryMedia)
    .innerJoin(mediaAssets, eq(entryMedia.mediaId, mediaAssets.id))
    .where(inArray(entryMedia.entryId, entryIds))
    .orderBy(desc(entryMedia.isPrimary), desc(entryMedia.createdAt));

  for (const mediaRow of mediaRows) {
    if (!mediaByEntryId.has(mediaRow.entryId)) {
      mediaByEntryId.set(
        mediaRow.entryId,
        resolveMediaAssetUrl({
          id: mediaRow.mediaId,
          storageProvider: mediaRow.storageProvider,
          storageUrl: mediaRow.storageUrl,
        })
      );
    }
  }

  return mediaByEntryId;
};

const mapEntryRows = (rows: EntryRow[], mediaByEntryId: Map<number, string>) =>
  rows.map(
    ({
      entry,
      platformColorHex,
      platformDisplayName,
      platformSlug: rowPlatformSlug,
      userPlatformColorHex,
    }) => ({
      bonusAmount: entry.bonusAmount,
      bonus_amount: entry.bonusAmount,
      completedAt: entry.completedAt,
      completed_at: entry.completedAt,
      createdAt: entry.createdAt,
      created_at: entry.createdAt,
      currencyCode: entry.currencyCode,
      currency_code: entry.currencyCode,
      distanceMiles: entry.distanceMiles,
      distance_miles: entry.distanceMiles,
      durationSeconds: entry.durationSeconds,
      duration_seconds: entry.durationSeconds,
      earningsExtras: entry.earningsExtras,
      earnings_extras: entry.earningsExtras,
      externalRef: entry.externalRef,
      external_ref: entry.externalRef,
      fareAmount: entry.fareAmount,
      fare_amount: entry.fareAmount,
      id: entry.id,
      notes: entry.notes,
      occurredAt: entry.occurredAt,
      occurred_at: entry.occurredAt,
      platformColorHex: userPlatformColorHex ?? platformColorHex,
      platformDisplayName,
      platformId: entry.platformId,
      platformMetadata: entry.platformMetadata,
      platformSlug: rowPlatformSlug,
      platform_color_hex: userPlatformColorHex ?? platformColorHex,
      platform_display_name: platformDisplayName,
      platform_id: entry.platformId,
      platform_metadata: entry.platformMetadata,
      platform_slug: rowPlatformSlug,
      primary_media_url: mediaByEntryId.get(entry.id) ?? null,
      screenshotUrl: mediaByEntryId.get(entry.id) ?? null,
      source: entry.source,
      status: entry.status,
      stopsCount: entry.stopsCount,
      stops_count: entry.stopsCount,
      tipEstimatedAmount: entry.tipEstimatedAmount,
      tipFinalAmount: entry.tipFinalAmount,
      tipStatus: entry.tipStatus,
      tip_estimated_amount: entry.tipEstimatedAmount,
      tip_final_amount: entry.tipFinalAmount,
      tip_status: entry.tipStatus,
      totalEstimatedAmount: entry.totalEstimatedAmount,
      totalFinalAmount: entry.totalFinalAmount,
      total_estimated_amount: entry.totalEstimatedAmount,
      total_final_amount: entry.totalFinalAmount,
      updatedAt: entry.updatedAt,
      updated_at: entry.updatedAt,
      userId: entry.userId,
      user_id: entry.userId,
    })
  );

export async function listEntriesPageForUser(
  userId: number,
  filters: EntryFilters = {}
): Promise<PaginatedEntriesResult> {
  await ensureDefaultPlatforms();

  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 200, 500));
  const requestedPage = Math.max(1, filters.page ?? 1);
  const whereClauses = buildEntriesWhereClauses(userId, filters);

  const [summaryRow] = await db
    .select({
      totalItems: sql<number>`COUNT(*)`,
      totalMiles: sql<number>`COALESCE(SUM(${earningsEntries.distanceMiles}), 0)`,
      totalPayout: sql<number>`COALESCE(SUM(${effectiveTotalSql}), 0)`,
      totalTips: sql<number>`COALESCE(SUM(${tipAmountSql}), 0)`,
    })
    .from(earningsEntries)
    .innerJoin(platforms, eq(earningsEntries.platformId, platforms.id))
    .where(and(...whereClauses));

  const totalItems = Math.max(0, toFiniteNumber(summaryRow?.totalItems));
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const orderBy = getOrderBy(filters.sort);

  const rows = await db
    .select({
      entry: earningsEntries,
      platformColorHex: platforms.colorHex,
      platformDisplayName: platforms.displayName,
      platformSlug: platforms.slug,
      userPlatformColorHex: userPlatforms.colorHex,
    })
    .from(earningsEntries)
    .innerJoin(platforms, eq(earningsEntries.platformId, platforms.id))
    .leftJoin(
      userPlatforms,
      and(
        eq(userPlatforms.platformId, earningsEntries.platformId),
        eq(userPlatforms.userId, userId)
      )
    )
    .where(and(...whereClauses))
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const entryIds = rows.map((row) => row.entry.id);
  const mediaByEntryId = await loadPrimaryMediaByEntryId(entryIds);

  return {
    entries: mapEntryRows(rows, mediaByEntryId),
    pagination: {
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    summary: {
      totalLogs: totalItems,
      totalMiles: toFiniteNumber(summaryRow?.totalMiles),
      totalPayout: toFiniteNumber(summaryRow?.totalPayout),
      totalTips: toFiniteNumber(summaryRow?.totalTips),
    },
  };
}

export async function listEntriesForUser(
  userId: number,
  filters: EntryFilters = {}
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(filters.limit ?? 200, 500);
  const result = await listEntriesPageForUser(userId, {
    ...filters,
    page: 1,
    pageSize: limit,
    sort: filters.sort ?? "date-desc",
  });

  return result.entries;
}

export async function getEntryForUser(userId: number, entryId: number) {
  await ensureDefaultPlatforms();

  const rows = await db
    .select({
      entry: earningsEntries,
      platformColorHex: platforms.colorHex,
      platformDisplayName: platforms.displayName,
      platformSlug: platforms.slug,
      userPlatformColorHex: userPlatforms.colorHex,
    })
    .from(earningsEntries)
    .innerJoin(platforms, eq(earningsEntries.platformId, platforms.id))
    .leftJoin(
      userPlatforms,
      and(
        eq(userPlatforms.platformId, earningsEntries.platformId),
        eq(userPlatforms.userId, userId)
      )
    )
    .where(
      and(eq(earningsEntries.id, entryId), eq(earningsEntries.userId, userId))
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const mediaByEntryId = await loadPrimaryMediaByEntryId([row.entry.id]);
  const [mapped] = mapEntryRows([row], mediaByEntryId);
  if (!mapped) {
    return null;
  }

  const tripVerification = await getEntryTripVerificationForUser(
    userId,
    entryId
  );
  return {
    ...mapped,
    tripVerification,
  };
}

export async function createEntryForUser(
  userId: number,
  input: EntryCreateInput
): Promise<typeof earningsEntries.$inferSelect> {
  await ensureDefaultPlatforms();

  const [platform] = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.slug, input.platformSlug))
    .limit(1);

  if (!platform) {
    throw new Error(`Unknown platform: ${input.platformSlug}`);
  }

  const [entry] = await db
    .insert(earningsEntries)
    .values({
      bonusAmount: toNumericString(input.bonusAmount ?? 0) ?? "0",
      completedAt: toDateOrNull(input.completedAt || null),
      currencyCode: (input.currencyCode || "USD").toUpperCase(),
      distanceMiles: toNumericString(input.distanceMiles ?? null),
      durationSeconds: input.durationSeconds ?? null,
      earningsExtras: input.earningsExtras || {},
      externalRef: input.externalRef || null,
      fareAmount: toNumericString(input.fareAmount) ?? "0",
      notes: input.notes || null,
      occurredAt: toDateOrThrow(input.occurredAt, "occurredAt"),
      platformId: platform.id,
      platformMetadata: input.platformMetadata || {},
      source: input.source,
      status: input.status,
      stopsCount: input.stopsCount ?? null,
      tipEstimatedAmount: toNumericString(input.tipEstimatedAmount ?? null),
      tipFinalAmount: toNumericString(input.tipFinalAmount ?? null),
      tipStatus: input.tipStatus,
      totalEstimatedAmount: toNumericString(input.totalEstimatedAmount ?? null),
      totalFinalAmount: toNumericString(input.totalFinalAmount ?? null),
      updatedAt: new Date(),
      userId,
    })
    .returning();

  if (!entry) {
    throw new Error("Failed to create entry");
  }

  if (input.extractionId) {
    await db
      .update(aiExtractions)
      .set({
        applied: true,
        appliedAt: new Date(),
        entryId: entry.id,
      })
      .where(
        and(
          eq(aiExtractions.id, input.extractionId),
          eq(aiExtractions.userId, userId)
        )
      );

    const [extraction] = await db
      .select({
        mediaId: aiExtractions.mediaId,
        parsedPayload: aiExtractions.parsedPayload,
      })
      .from(aiExtractions)
      .where(
        and(
          eq(aiExtractions.id, input.extractionId),
          eq(aiExtractions.userId, userId)
        )
      )
      .limit(1);

    if (extraction) {
      await db
        .insert(entryMedia)
        .values({
          entryId: entry.id,
          isPrimary: true,
          mediaId: extraction.mediaId,
        })
        .onConflictDoUpdate({
          set: { isPrimary: true },
          target: [entryMedia.entryId, entryMedia.mediaId],
        });

      await seedEntryTripVerificationFromExtraction(
        entry.id,
        extraction.parsedPayload
      );
    }
  }

  return entry;
}

export async function updateEntryForUser(
  userId: number,
  entryId: number,
  input: EntryPatchInput
) {
  const updateData: Partial<typeof earningsEntries.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.occurredAt !== undefined) {
    updateData.occurredAt = toDateOrThrow(input.occurredAt, "occurredAt");
  }

  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  if (Object.hasOwn(input, "completedAt")) {
    updateData.completedAt = input.completedAt
      ? toDateOrNull(input.completedAt)
      : null;
  }

  if (Object.hasOwn(input, "distanceMiles")) {
    updateData.distanceMiles = toNumericString(input.distanceMiles ?? null);
  }

  if (Object.hasOwn(input, "durationSeconds")) {
    updateData.durationSeconds = input.durationSeconds ?? null;
  }

  if (Object.hasOwn(input, "stopsCount")) {
    updateData.stopsCount = input.stopsCount ?? null;
  }

  if (input.fareAmount !== undefined) {
    const fareAmount = toNumericString(input.fareAmount);
    if (fareAmount !== undefined && fareAmount !== null) {
      updateData.fareAmount = fareAmount;
    }
  }

  if (input.bonusAmount !== undefined) {
    const bonusAmount = toNumericString(input.bonusAmount);
    if (bonusAmount !== undefined && bonusAmount !== null) {
      updateData.bonusAmount = bonusAmount;
    }
  }

  if (Object.hasOwn(input, "tipEstimatedAmount")) {
    updateData.tipEstimatedAmount = toNumericString(
      input.tipEstimatedAmount ?? null
    );
  }

  if (Object.hasOwn(input, "tipFinalAmount")) {
    updateData.tipFinalAmount = toNumericString(input.tipFinalAmount ?? null);
  }

  if (input.tipStatus !== undefined) {
    updateData.tipStatus = input.tipStatus;
  }

  if (Object.hasOwn(input, "totalEstimatedAmount")) {
    updateData.totalEstimatedAmount = toNumericString(
      input.totalEstimatedAmount ?? null
    );
  }

  if (Object.hasOwn(input, "totalFinalAmount")) {
    updateData.totalFinalAmount = toNumericString(
      input.totalFinalAmount ?? null
    );
  }

  if (Object.hasOwn(input, "notes")) {
    updateData.notes = input.notes ?? null;
  }

  if (Object.hasOwn(input, "earningsExtras")) {
    updateData.earningsExtras = input.earningsExtras || {};
  }

  if (Object.hasOwn(input, "platformMetadata")) {
    updateData.platformMetadata = input.platformMetadata || {};
  }

  const [entry] = await db
    .update(earningsEntries)
    .set(updateData)
    .where(
      and(eq(earningsEntries.id, entryId), eq(earningsEntries.userId, userId))
    )
    .returning();

  if (!entry) {
    throw new Error("Entry not found or unauthorized");
  }

  return entry;
}

/**
 * Delete an entry (ported from the gigstax deleteEntryAction server
 * action so the API exposes it as DELETE /entries/:id).
 */
export async function deleteEntryForUser(userId: number, entryId: number) {
  const [deleted] = await db
    .delete(earningsEntries)
    .where(
      and(eq(earningsEntries.id, entryId), eq(earningsEntries.userId, userId))
    )
    .returning({ id: earningsEntries.id });

  if (!deleted) {
    throw new Error("Entry not found or unauthorized");
  }

  return deleted.id;
}

export type AttachEntryMediaOutcome =
  | {
      error:
        | "entry_not_found"
        | "invalid_media_id"
        | "media_not_found"
        | "missing_input";
    }
  | { media: Record<string, unknown>; ok: true };

/**
 * Attach an existing or freshly uploaded media asset to an entry
 * (ported from the gigstax /api/entries/[id]/media route logic).
 */
export async function attachEntryMediaForUser(args: {
  entryId: number;
  file: File | null;
  mediaIdParam: string | null;
  url: string | null;
  userId: number;
}): Promise<AttachEntryMediaOutcome> {
  const [entry] = await db
    .select({ id: earningsEntries.id })
    .from(earningsEntries)
    .where(
      and(
        eq(earningsEntries.id, args.entryId),
        eq(earningsEntries.userId, args.userId)
      )
    )
    .limit(1);

  if (!entry) {
    return { error: "entry_not_found" };
  }

  let media: Record<string, unknown>;

  if (args.mediaIdParam && args.mediaIdParam.length > 0) {
    const mediaId = Number.parseInt(args.mediaIdParam, 10);
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return { error: "invalid_media_id" };
    }

    const [existingMedia] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaId),
          eq(mediaAssets.kind, "entry_screenshot"),
          eq(mediaAssets.userId, args.userId)
        )
      )
      .limit(1);

    if (!existingMedia) {
      return { error: "media_not_found" };
    }

    media = existingMedia;
  } else if (args.file) {
    const upload = await uploadFileToBlob(args.file, {
      kind: "entry_screenshot",
      userId: args.userId,
    });
    media = await createMediaAsset({
      byteSize: upload.byteSize,
      kind: "entry_screenshot",
      mimeType: upload.mimeType,
      sha256: upload.sha256,
      storageKey: upload.blob.pathname,
      storageProvider: upload.storageProvider,
      storageUrl: upload.blob.url,
      userId: args.userId,
    });
  } else if (args.url && args.url.length > 0) {
    media = await createMediaAsset({
      kind: "entry_screenshot",
      storageProvider: "external",
      storageUrl: args.url,
      userId: args.userId,
    });
  } else {
    return { error: "missing_input" };
  }

  await linkMediaToEntry(args.entryId, Number(media.id), true);

  return { media, ok: true };
}

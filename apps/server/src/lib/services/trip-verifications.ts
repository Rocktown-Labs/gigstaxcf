import {
  earningsEntries,
  entryTripVerifications,
  platforms,
} from "@gigstaxcf/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { buildPaginationState } from "@/lib/pagination";
import type { NormalizedExtractionPayload } from "@/lib/services/extraction";
import type { EntryTripVerification } from "@/lib/trip-verification";
import {
  getTripRouteDistanceMiles,
  getTripRouteDurationSeconds,
} from "@/lib/trip-verification";
import type { UpsertTripVerificationInput } from "@/lib/validations";

const TRIP_VERIFICATION_TABLE_IDENTIFIERS = [
  '"entry_trip_verifications"',
] as const;

export const TRIP_VERIFICATION_TABLES_MISSING_MESSAGE =
  "Trip verification is not available until database migrations are applied. Run `pnpm db:migrate` and refresh.";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getPostgresErrorCode = (error: unknown) => {
  if (!isObjectRecord(error)) {
    return null;
  }

  if (typeof error.code === "string") {
    return error.code;
  }

  if (isObjectRecord(error.cause) && typeof error.cause.code === "string") {
    return error.cause.code;
  }

  return null;
};

const getErrorQuery = (error: unknown) => {
  if (!isObjectRecord(error)) {
    return "";
  }

  if (typeof error.query === "string") {
    return error.query;
  }

  if (isObjectRecord(error.cause) && typeof error.cause.query === "string") {
    return error.cause.query;
  }

  return "";
};

export const isTripVerificationTablesMissingError = (error: unknown) => {
  if (getPostgresErrorCode(error) !== "42P01") {
    return false;
  }

  const query = getErrorQuery(error);
  if (!query) {
    return true;
  }

  return TRIP_VERIFICATION_TABLE_IDENTIFIERS.some((identifier) =>
    query.includes(identifier)
  );
};

const toNumericString = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toString();
};

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toTrimmedOrNull = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function mapTripVerificationRow(
  row: typeof entryTripVerifications.$inferSelect
): EntryTripVerification {
  return {
    createdAt: row.createdAt,
    dropoffAddress: row.dropoffAddress,
    dropoffLatitude: toNumberOrNull(row.dropoffLatitude),
    dropoffLongitude: toNumberOrNull(row.dropoffLongitude),
    extractedDropoffText: row.extractedDropoffText,
    extractedPickupText: row.extractedPickupText,
    id: row.id,
    pickupAddress: row.pickupAddress,
    pickupLatitude: toNumberOrNull(row.pickupLatitude),
    pickupLongitude: toNumberOrNull(row.pickupLongitude),
    radarDistanceMiles: toNumberOrNull(row.radarDistanceMiles),
    radarDurationSeconds: row.radarDurationSeconds,
    returnAddress: row.returnAddress,
    returnLatitude: toNumberOrNull(row.returnLatitude),
    returnLongitude: toNumberOrNull(row.returnLongitude),
    routeCalculatedAt: row.routeCalculatedAt,
    routeData: row.routeData ?? null,
    status: row.status,
    updatedAt: row.updatedAt,
    verifiedAt: row.verifiedAt,
  };
}

export interface TripVerificationQueueItem {
  extractedDropoffText: string | null;
  extractedPickupText: string | null;
  id: number;
  occurredAt: string;
  platformDisplayName: string | null;
  platformSlug: string | null;
  returnAddress: string | null;
  screenshotDistanceMiles: number | null;
  status: EntryTripVerification["status"];
  stopsCount: number | null;
  tripVerificationUpdatedAt: string;
  verifiedStopCount: number;
}

export async function listTripVerificationQueueForUser(args: {
  page: number;
  pageSize: number;
  userId: number;
}) {
  const pageRaw = Math.max(1, Math.floor(args.page));
  const pageSize = Math.min(50, Math.max(1, Math.floor(args.pageSize)));

  try {
    const whereClause = and(
      eq(earningsEntries.userId, args.userId),
      eq(earningsEntries.status, "completed"),
      eq(entryTripVerifications.status, "needs_input")
    );

    // Fetch totalItems first so page can be clamped to totalPages before
    // computing the offset, preventing out-of-range pages from returning an
    // empty result set with a misleading page number.
    const [totalRow] = await db
      .select({ totalItems: count() })
      .from(entryTripVerifications)
      .innerJoin(
        earningsEntries,
        eq(entryTripVerifications.entryId, earningsEntries.id)
      )
      .where(whereClause);

    const totalItems = Number(totalRow?.totalItems ?? 0);
    const pagination = buildPaginationState({
      page: pageRaw,
      pageSize,
      totalItems,
    });
    const offset = (pagination.page - 1) * pageSize;

    const rows = await db
      .select({
        entry: earningsEntries,
        platformDisplayName: platforms.displayName,
        platformSlug: platforms.slug,
        tripVerification: entryTripVerifications,
      })
      .from(entryTripVerifications)
      .innerJoin(
        earningsEntries,
        eq(entryTripVerifications.entryId, earningsEntries.id)
      )
      .leftJoin(platforms, eq(earningsEntries.platformId, platforms.id))
      .where(whereClause)
      .orderBy(
        desc(earningsEntries.occurredAt),
        desc(entryTripVerifications.updatedAt)
      )
      .limit(pageSize)
      .offset(offset);

    const entries: TripVerificationQueueItem[] = rows.map((row) => {
      const verification = mapTripVerificationRow(row.tripVerification);
      return {
        extractedDropoffText: verification.extractedDropoffText,
        extractedPickupText: verification.extractedPickupText,
        id: row.entry.id,
        occurredAt: row.entry.occurredAt.toISOString(),
        platformDisplayName: row.platformDisplayName,
        platformSlug: row.platformSlug,
        returnAddress: verification.returnAddress,
        screenshotDistanceMiles: toNumberOrNull(row.entry.distanceMiles),
        status: verification.status,
        stopsCount: row.entry.stopsCount,
        tripVerificationUpdatedAt: new Date(
          verification.updatedAt
        ).toISOString(),
        verifiedStopCount:
          verification.routeData?.intermediateStops?.length ?? 0,
      };
    });

    return { entries, pagination };
  } catch (error) {
    if (isTripVerificationTablesMissingError(error)) {
      return {
        entries: [] satisfies TripVerificationQueueItem[],
        pagination: buildPaginationState({
          page: pageRaw,
          pageSize,
          totalItems: 0,
        }),
      };
    }

    throw error;
  }
}

export async function getEntryTripVerificationForUser(
  userId: number,
  entryId: number
) {
  try {
    const [row] = await db
      .select({
        tripVerification: entryTripVerifications,
      })
      .from(entryTripVerifications)
      .innerJoin(
        earningsEntries,
        and(
          eq(entryTripVerifications.entryId, earningsEntries.id),
          eq(earningsEntries.userId, userId)
        )
      )
      .where(eq(entryTripVerifications.entryId, entryId))
      .limit(1);

    return row ? mapTripVerificationRow(row.tripVerification) : null;
  } catch (error) {
    if (isTripVerificationTablesMissingError(error)) {
      return null;
    }

    throw error;
  }
}

export async function seedEntryTripVerificationFromExtraction(
  entryId: number,
  parsedPayload: NormalizedExtractionPayload | null | undefined
) {
  if (!parsedPayload || parsedPayload.entryType === "expense") {
    return null;
  }

  const extractedPickupText = toTrimmedOrNull(parsedPayload.pickupAddress);
  const extractedDropoffText = toTrimmedOrNull(parsedPayload.dropoffAddress);

  if (!extractedPickupText && !extractedDropoffText) {
    return null;
  }

  try {
    await db
      .insert(entryTripVerifications)
      .values({
        entryId,
        extractedDropoffText,
        extractedPickupText,
        status: "needs_input",
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    const [row] = await db
      .select()
      .from(entryTripVerifications)
      .where(eq(entryTripVerifications.entryId, entryId))
      .limit(1);

    return row ? mapTripVerificationRow(row) : null;
  } catch (error) {
    if (isTripVerificationTablesMissingError(error)) {
      return null;
    }

    throw error;
  }
}

export async function upsertEntryTripVerificationForUser(
  userId: number,
  entryId: number,
  input: UpsertTripVerificationInput
) {
  const [entry] = await db
    .select({ id: earningsEntries.id })
    .from(earningsEntries)
    .where(
      and(eq(earningsEntries.id, entryId), eq(earningsEntries.userId, userId))
    )
    .limit(1);

  if (!entry) {
    throw new Error("Entry not found or unauthorized");
  }

  try {
    const [existing] = await db
      .select()
      .from(entryTripVerifications)
      .where(eq(entryTripVerifications.entryId, entryId))
      .limit(1);

    const now = new Date();
    const radarDistanceMiles = getTripRouteDistanceMiles(input.routeData);
    const radarDurationSeconds = getTripRouteDurationSeconds(input.routeData);
    const verificationValues: Partial<
      typeof entryTripVerifications.$inferInsert
    > = {
      dropoffAddress: input.dropoff.address,
      dropoffLatitude: toNumericString(input.dropoff.latitude),
      dropoffLongitude: toNumericString(input.dropoff.longitude),
      extractedDropoffText:
        input.extractedDropoffText ?? existing?.extractedDropoffText ?? null,
      extractedPickupText:
        input.extractedPickupText ?? existing?.extractedPickupText ?? null,
      pickupAddress: input.pickup.address,
      pickupLatitude: toNumericString(input.pickup.latitude),
      pickupLongitude: toNumericString(input.pickup.longitude),
      radarDistanceMiles: toNumericString(radarDistanceMiles),
      radarDurationSeconds,
      returnAddress: input.returnLocation.address,
      returnLatitude: toNumericString(input.returnLocation.latitude),
      returnLongitude: toNumericString(input.returnLocation.longitude),
      routeCalculatedAt: now,
      routeData: input.routeData,
      status: "verified",
      updatedAt: now,
      verifiedAt: now,
    };

    if (existing) {
      const [updated] = await db
        .update(entryTripVerifications)
        .set(verificationValues)
        .where(eq(entryTripVerifications.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error("Failed to update trip verification");
      }

      return mapTripVerificationRow(updated);
    }

    const [inserted] = await db
      .insert(entryTripVerifications)
      .values({
        ...verificationValues,
        entryId,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create trip verification");
    }

    return mapTripVerificationRow(inserted);
  } catch (error) {
    if (isTripVerificationTablesMissingError(error)) {
      throw new Error(TRIP_VERIFICATION_TABLES_MISSING_MESSAGE, {
        cause: error,
      });
    }

    throw error;
  }
}

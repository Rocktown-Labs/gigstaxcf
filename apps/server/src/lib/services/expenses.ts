import {
  earningsEntries,
  expenseMedia,
  expenses,
  mediaAssets,
  platforms,
} from "@gigstaxcf/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/lib/db";
import { ensureDefaultPlatforms } from "@/lib/db/platform-seed";
import {
  createMediaAsset,
  linkMediaToExpense,
  resolveMediaAssetUrl,
  uploadFileToBlob,
} from "@/lib/services/media";
import { createExpenseSchema } from "@/lib/validations";
import type {
  ExpenseCreateInput,
  entryListSortSchema,
  expenseCategorySchema,
} from "@/lib/validations";

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type ExpenseSort = z.infer<typeof entryListSortSchema>;

export interface ExpenseFilters {
  category?: ExpenseCategory | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
  sort?: ExpenseSort;
  startDate?: string | null;
}

export interface ExpensesPagination {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ExpensesSummary {
  fuelExpenses: number;
  totalExpenses: number;
  totalItems: number;
}

export interface PaginatedExpensesResult {
  expenses: Record<string, unknown>[];
  pagination: ExpensesPagination;
  summary: ExpensesSummary;
}

export type AttachExpenseMediaOutcome =
  | {
      error:
        | "expense_not_found"
        | "invalid_media_id"
        | "media_not_found"
        | "missing_input";
    }
  | { media: Record<string, unknown>; ok: true };

const toDateOrNull = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getExpenseOrderBy = (sort: ExpenseSort | undefined) => {
  switch (sort) {
    case "date-asc": {
      return [asc(expenses.incurredAt), asc(expenses.id)] as const;
    }
    case "amount-desc": {
      return [desc(expenses.amount), desc(expenses.id)] as const;
    }
    case "amount-asc": {
      return [asc(expenses.amount), asc(expenses.id)] as const;
    }
    default: {
      return [desc(expenses.incurredAt), desc(expenses.id)] as const;
    }
  }
};

const loadPrimaryMediaByExpenseId = async (expenseIds: number[]) => {
  const mediaByExpenseId = new Map<number, string>();
  if (expenseIds.length === 0) {
    return mediaByExpenseId;
  }

  const mediaRows = await db
    .select({
      createdAt: expenseMedia.createdAt,
      expenseId: expenseMedia.expenseId,
      isPrimary: expenseMedia.isPrimary,
      mediaId: mediaAssets.id,
      storageProvider: mediaAssets.storageProvider,
      storageUrl: mediaAssets.storageUrl,
    })
    .from(expenseMedia)
    .innerJoin(mediaAssets, eq(expenseMedia.mediaId, mediaAssets.id))
    .where(inArray(expenseMedia.expenseId, expenseIds))
    .orderBy(desc(expenseMedia.isPrimary), desc(expenseMedia.createdAt));

  for (const mediaRow of mediaRows) {
    if (!mediaByExpenseId.has(mediaRow.expenseId)) {
      mediaByExpenseId.set(
        mediaRow.expenseId,
        resolveMediaAssetUrl({
          id: mediaRow.mediaId,
          storageProvider: mediaRow.storageProvider,
          storageUrl: mediaRow.storageUrl,
        })
      );
    }
  }

  return mediaByExpenseId;
};

interface ExpenseRow {
  expense: typeof expenses.$inferSelect;
  platformDisplayName: string | null;
  platformSlug: string | null;
}

const mapExpenseRow = (
  row: ExpenseRow,
  primaryMediaUrl: string | null
): Record<string, unknown> => ({
  ...row.expense,
  created_at: row.expense.createdAt,
  currency_code: row.expense.currencyCode,
  entry_id: row.expense.entryId,
  incurred_at: row.expense.incurredAt,
  platform_display_name: row.platformDisplayName,
  platform_id: row.expense.platformId,
  platform_slug: row.platformSlug,
  primary_media_url: primaryMediaUrl,
  updated_at: row.expense.updatedAt,
  user_id: row.expense.userId,
});

export async function listExpensesPageForUser(
  userId: number,
  filters: ExpenseFilters = {}
): Promise<PaginatedExpensesResult> {
  const whereClauses = [eq(expenses.userId, userId)];

  const startDate = toDateOrNull(filters.startDate ?? null);
  if (startDate) {
    whereClauses.push(gte(expenses.incurredAt, startDate));
  }

  const endDate = toDateOrNull(filters.endDate ?? null);
  if (endDate) {
    whereClauses.push(lte(expenses.incurredAt, endDate));
  }

  const category = filters.category ?? null;
  if (category) {
    whereClauses.push(eq(expenses.category, category));
  }

  const [summaryRow] = await db
    .select({
      fuelExpenses: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.category} = 'fuel' THEN ${expenses.amount} ELSE 0 END), 0)`,
      totalExpenses: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
      totalItems: sql<number>`COUNT(*)`,
    })
    .from(expenses)
    .where(and(...whereClauses));

  const totalItems = Math.max(0, toFiniteNumber(summaryRow?.totalItems));
  const pageSize = Math.max(1, filters.pageSize ?? 500);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const offset = (page - 1) * pageSize;
  const orderBy = getExpenseOrderBy(filters.sort);

  const rows = await db
    .select({
      expense: expenses,
      platformDisplayName: platforms.displayName,
      platformSlug: platforms.slug,
    })
    .from(expenses)
    .leftJoin(platforms, eq(expenses.platformId, platforms.id))
    .where(and(...whereClauses))
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const mediaByExpenseId = await loadPrimaryMediaByExpenseId(
    rows.map((row) => row.expense.id)
  );

  return {
    expenses: rows.map((row) =>
      mapExpenseRow(row, mediaByExpenseId.get(row.expense.id) ?? null)
    ),
    pagination: {
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    summary: {
      fuelExpenses: toFiniteNumber(summaryRow?.fuelExpenses),
      totalExpenses: toFiniteNumber(summaryRow?.totalExpenses),
      totalItems,
    },
  };
}

export async function getExpenseForUser(
  userId: number,
  expenseId: number
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({
      expense: expenses,
      platformDisplayName: platforms.displayName,
      platformSlug: platforms.slug,
    })
    .from(expenses)
    .leftJoin(platforms, eq(expenses.platformId, platforms.id))
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const [mediaRow] = await db
    .select({
      mediaId: mediaAssets.id,
      storageProvider: mediaAssets.storageProvider,
      storageUrl: mediaAssets.storageUrl,
    })
    .from(expenseMedia)
    .innerJoin(mediaAssets, eq(expenseMedia.mediaId, mediaAssets.id))
    .where(eq(expenseMedia.expenseId, row.expense.id))
    .orderBy(desc(expenseMedia.isPrimary), desc(expenseMedia.createdAt))
    .limit(1);

  return mapExpenseRow(
    row,
    mediaRow
      ? resolveMediaAssetUrl({
          id: mediaRow.mediaId,
          storageProvider: mediaRow.storageProvider,
          storageUrl: mediaRow.storageUrl,
        })
      : null
  );
}

export async function createExpenseForUser(
  userId: number,
  input: ExpenseCreateInput
): Promise<typeof expenses.$inferSelect> {
  const validated = createExpenseSchema.parse(input);
  await ensureDefaultPlatforms();

  let platformId: number | null = null;
  if (validated.platformSlug) {
    const [platform] = await db
      .select({ id: platforms.id })
      .from(platforms)
      .where(eq(platforms.slug, validated.platformSlug))
      .limit(1);

    if (!platform) {
      throw new Error(`Unknown platform: ${validated.platformSlug}`);
    }
    platformId = platform.id;
  }

  if (validated.entryId) {
    const [entry] = await db
      .select({ id: earningsEntries.id })
      .from(earningsEntries)
      .where(
        and(
          eq(earningsEntries.id, validated.entryId),
          eq(earningsEntries.userId, userId)
        )
      )
      .limit(1);

    if (!entry) {
      throw new Error("Entry not found for expense link");
    }
  }

  const [expense] = await db
    .insert(expenses)
    .values({
      amount: validated.amount.toString(),
      category: validated.category,
      currencyCode: (validated.currencyCode || "USD").toUpperCase(),
      description: validated.description || null,
      entryId: validated.entryId ?? null,
      incurredAt: new Date(validated.incurredAt),
      merchant: validated.merchant || null,
      notes: validated.notes || null,
      platformId,
      updatedAt: new Date(),
      userId,
    })
    .returning();

  if (!expense) {
    throw new Error("Failed to create expense");
  }

  return expense;
}

/**
 * Delete an expense (ported from the gigstax `deleteExpenseAction` server
 * action so the API can expose it as DELETE /expenses/:id).
 */
export async function deleteExpenseForUser(userId: number, expenseId: number) {
  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  if (!deleted) {
    throw new Error("Expense not found or unauthorized");
  }

  return deleted.id;
}

/**
 * Attach an existing or freshly uploaded media asset to an expense
 * (ported from the gigstax /api/expenses/[id]/media route logic).
 */
export async function attachExpenseMediaForUser(args: {
  expenseId: number;
  file: File | null;
  mediaIdParam: string | null;
  url: string | null;
  userId: number;
}): Promise<AttachExpenseMediaOutcome> {
  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(eq(expenses.id, args.expenseId), eq(expenses.userId, args.userId))
    )
    .limit(1);

  if (!expense) {
    return { error: "expense_not_found" };
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
          eq(mediaAssets.kind, "expense_receipt"),
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
      kind: "expense_receipt",
      userId: args.userId,
    });
    media = await createMediaAsset({
      byteSize: upload.byteSize,
      kind: "expense_receipt",
      mimeType: upload.mimeType,
      sha256: upload.sha256,
      storageKey: upload.blob.pathname,
      storageProvider: upload.storageProvider,
      storageUrl: upload.blob.url,
      userId: args.userId,
    });
  } else if (args.url && args.url.length > 0) {
    media = await createMediaAsset({
      kind: "expense_receipt",
      storageProvider: "external",
      storageUrl: args.url,
      userId: args.userId,
    });
  } else {
    return { error: "missing_input" };
  }

  await linkMediaToExpense(args.expenseId, Number(media.id), true);

  return { media, ok: true };
}

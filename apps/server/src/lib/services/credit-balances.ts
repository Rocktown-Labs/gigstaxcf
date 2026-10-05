import { creditTransactions, userCreditBalances } from "@gigstaxcf/db/schema";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type CreditTransactionKind =
  | "pack_purchase"
  | "pack_consumption"
  | "admin_adjustment";

interface CreditTransactionArgs {
  balanceAfter: number;
  deltaCredits: number;
  kind: CreditTransactionKind;
  metadata?: Record<string, unknown>;
  sourceId?: string | null;
  sourceType: string;
  userId: number;
}

const CREDIT_TABLE_IDENTIFIERS = [
  '"user_credit_balances"',
  '"credit_transactions"',
] as const;
const TRANSACTION_UNSUPPORTED_MESSAGE =
  "No transactions support in neon-http driver";

type DatabaseClient = typeof db;
type TransactionClient = Parameters<
  Parameters<DatabaseClient["transaction"]>[0]
>[0];
type CreditWriteClient = DatabaseClient | TransactionClient;

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

export const isCreditTablesMissingError = (error: unknown) => {
  if (getPostgresErrorCode(error) !== "42P01") {
    return false;
  }

  const query = getErrorQuery(error);
  if (!query) {
    return true;
  }

  return CREDIT_TABLE_IDENTIFIERS.some((identifier) =>
    query.includes(identifier)
  );
};

function toPositiveInt(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

const isTransactionUnsupportedError = (error: unknown) =>
  error instanceof Error &&
  error.message.includes(TRANSACTION_UNSUPPORTED_MESSAGE);

const withCreditWriteTransaction = async <T>(
  operation: (client: CreditWriteClient) => Promise<T>
): Promise<T> => {
  try {
    return await db.transaction((tx) => operation(tx));
  } catch (error) {
    if (!isTransactionUnsupportedError(error)) {
      throw error;
    }

    return operation(db);
  }
};

async function ensureUserBalanceRow(userId: number) {
  await db
    .insert(userCreditBalances)
    .values({
      aiPackCredits: 0,
      updatedAt: new Date(),
      userId,
    })
    .onConflictDoNothing({
      target: userCreditBalances.userId,
    });
}

export async function getPackBalance(userId: number) {
  try {
    await ensureUserBalanceRow(userId);

    const [row] = await db
      .select({
        aiPackCredits: userCreditBalances.aiPackCredits,
      })
      .from(userCreditBalances)
      .where(eq(userCreditBalances.userId, userId))
      .limit(1);

    return Math.max(0, Number(row?.aiPackCredits || 0));
  } catch (error) {
    if (isCreditTablesMissingError(error)) {
      return 0;
    }

    throw error;
  }
}

export async function recordCreditTransaction(args: CreditTransactionArgs) {
  const [row] = await db
    .insert(creditTransactions)
    .values({
      balanceAfter: Math.max(0, Math.floor(args.balanceAfter)),
      deltaCredits: Math.floor(args.deltaCredits),
      kind: args.kind,
      metadata: args.metadata || {},
      sourceId: args.sourceId || null,
      sourceType: args.sourceType,
      userId: args.userId,
    })
    .returning({
      balanceAfter: creditTransactions.balanceAfter,
      id: creditTransactions.id,
    });

  return row ?? null;
}

export async function incrementPackBalance(args: {
  credits: number;
  kind?: CreditTransactionKind;
  metadata?: Record<string, unknown>;
  sourceId?: string | null;
  sourceType: string;
  userId: number;
}): Promise<{ applied: boolean; balanceAfter: number }> {
  const credits = toPositiveInt(args.credits);
  if (credits === 0) {
    return {
      applied: false,
      balanceAfter: await getPackBalance(args.userId),
    };
  }

  const kind = args.kind || "pack_purchase";

  return withCreditWriteTransaction(async (tx) => {
    await tx
      .insert(userCreditBalances)
      .values({
        aiPackCredits: 0,
        updatedAt: new Date(),
        userId: args.userId,
      })
      .onConflictDoNothing({
        target: userCreditBalances.userId,
      });

    if (args.sourceId) {
      const [seedRow] = await tx
        .insert(creditTransactions)
        .values({
          balanceAfter: 0,
          deltaCredits: credits,
          kind,
          metadata: args.metadata || {},
          sourceId: args.sourceId,
          sourceType: args.sourceType,
          userId: args.userId,
        })
        .onConflictDoNothing({
          target: [creditTransactions.sourceType, creditTransactions.sourceId],
        })
        .returning({ id: creditTransactions.id });

      if (!seedRow) {
        const [existing] = await tx
          .select({
            balanceAfter: creditTransactions.balanceAfter,
          })
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.sourceType, args.sourceType),
              eq(creditTransactions.sourceId, args.sourceId)
            )
          )
          .limit(1);

        return {
          applied: false,
          balanceAfter: Math.max(0, Number(existing?.balanceAfter || 0)),
        };
      }

      const [updated] = await tx
        .update(userCreditBalances)
        .set({
          aiPackCredits: sql`${userCreditBalances.aiPackCredits} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(eq(userCreditBalances.userId, args.userId))
        .returning({
          aiPackCredits: userCreditBalances.aiPackCredits,
        });

      const balanceAfter = Math.max(0, Number(updated?.aiPackCredits || 0));

      await tx
        .update(creditTransactions)
        .set({ balanceAfter })
        .where(eq(creditTransactions.id, seedRow.id));

      return {
        applied: true,
        balanceAfter,
      };
    }

    const [updated] = await tx
      .update(userCreditBalances)
      .set({
        aiPackCredits: sql`${userCreditBalances.aiPackCredits} + ${credits}`,
        updatedAt: new Date(),
      })
      .where(eq(userCreditBalances.userId, args.userId))
      .returning({
        aiPackCredits: userCreditBalances.aiPackCredits,
      });

    const balanceAfter = Math.max(0, Number(updated?.aiPackCredits || 0));

    await tx.insert(creditTransactions).values({
      balanceAfter,
      deltaCredits: credits,
      kind,
      metadata: args.metadata || {},
      sourceId: args.sourceId || null,
      sourceType: args.sourceType,
      userId: args.userId,
    });

    return {
      applied: true,
      balanceAfter,
    };
  });
}

export async function consumePackCreditsAtomic(args: {
  credits: number;
  metadata?: Record<string, unknown>;
  sourceId?: string | null;
  sourceType: string;
  userId: number;
}): Promise<{ balanceAfter: number; consumed: boolean }> {
  const credits = toPositiveInt(args.credits);
  if (credits === 0) {
    return {
      balanceAfter: await getPackBalance(args.userId),
      consumed: true,
    };
  }

  return withCreditWriteTransaction(async (tx) => {
    await tx
      .insert(userCreditBalances)
      .values({
        aiPackCredits: 0,
        updatedAt: new Date(),
        userId: args.userId,
      })
      .onConflictDoNothing({
        target: userCreditBalances.userId,
      });

    const [updated] = await tx
      .update(userCreditBalances)
      .set({
        aiPackCredits: sql`${userCreditBalances.aiPackCredits} - ${credits}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userCreditBalances.userId, args.userId),
          sql`${userCreditBalances.aiPackCredits} >= ${credits}`
        )
      )
      .returning({
        aiPackCredits: userCreditBalances.aiPackCredits,
      });

    if (!updated) {
      const [current] = await tx
        .select({
          aiPackCredits: userCreditBalances.aiPackCredits,
        })
        .from(userCreditBalances)
        .where(eq(userCreditBalances.userId, args.userId))
        .limit(1);

      return {
        balanceAfter: Math.max(0, Number(current?.aiPackCredits || 0)),
        consumed: false,
      };
    }

    const balanceAfter = Math.max(0, Number(updated.aiPackCredits || 0));

    await tx.insert(creditTransactions).values({
      balanceAfter,
      deltaCredits: -credits,
      kind: "pack_consumption",
      metadata: args.metadata || {},
      sourceId: args.sourceId || null,
      sourceType: args.sourceType,
      userId: args.userId,
    });

    return {
      balanceAfter,
      consumed: true,
    };
  });
}

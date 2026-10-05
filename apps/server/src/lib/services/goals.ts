import { goals, users } from "@gigstaxcf/db/schema";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { isMissingColumnError } from "@/lib/db-errors";
import { createGoalSchema, goalSchema } from "@/lib/validations";
import { getWeekStartDateUtc, getWeekStartsOn } from "@/lib/week";
import type { WeekStartsOn } from "@/lib/week";

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateStringInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!day || !month || !year) {
    throw new Error("Could not resolve timezone date");
  }

  return `${year}-${month}-${day}`;
}

function normalizeDateInput(input: string | null, timezone: string) {
  if (!input) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    return input;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getDateStringInTimezone(parsed, timezone);
}

function getWeekStartDateString(inputDate: string, weekStartsOn: WeekStartsOn) {
  const parsed = new Date(`${inputDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError("Invalid date");
  }

  return formatDateOnly(getWeekStartDateUtc(parsed, weekStartsOn));
}

const loadUserGoalSettings = async (userId: number) => {
  try {
    const [user] = await db
      .select({ timezone: users.timezone, weekStartsOn: users.weekStartsOn })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      timezone: user?.timezone ?? "UTC",
      weekStartsOn: getWeekStartsOn(user?.weekStartsOn, "sunday"),
    };
  } catch (error) {
    if (!isMissingColumnError(error, "week_starts_on")) {
      throw error;
    }

    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      timezone: user?.timezone ?? "UTC",
      weekStartsOn: "sunday" as const,
    };
  }
};

const toGoalPayload = (
  goal: typeof goals.$inferSelect
): Record<string, unknown> => ({
  ...goal,
  period_end_date: goal.periodEndDate,
  period_start_date: goal.periodStartDate,
  start_date: goal.periodStartDate,
  target_amount: goal.targetAmount,
  weekly_target: Number(goal.targetAmount),
});

export async function listGoalsForUser(userId: number) {
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(desc(goals.periodStartDate));

  const { weekStartsOn } = await loadUserGoalSettings(userId);

  return {
    goals: rows.map((goal) => toGoalPayload(goal)),
    weekStartsOn,
  };
}

/**
 * Create (or update) the user's weekly earnings goal. Ported from the
 * gigstax /api/goals POST route, including its legacy-vs-canonical
 * payload branching (`weeklyTarget`/`startDate` vs `targetAmount`).
 *
 * Throws a ZodError when the payload matches neither shape.
 */
export async function createGoalForUser(userId: number, body: unknown) {
  const record =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  let targetAmount: number;
  let requestedStartDate: string | null = null;
  let requestedTimezone: string | undefined;

  if (record.weeklyTarget !== undefined || record.startDate !== undefined) {
    const legacy = goalSchema.parse(record);
    targetAmount = legacy.weeklyTarget;
    requestedStartDate = legacy.startDate || null;
  } else {
    const canonical = createGoalSchema.parse(record);
    ({ targetAmount } = canonical);
    requestedStartDate = canonical.periodStartDate ?? null;
    requestedTimezone = canonical.timezone;
  }

  const userSettings = await loadUserGoalSettings(userId);
  const timezone = requestedTimezone || userSettings.timezone;
  const { weekStartsOn } = userSettings;
  const normalizedInputDate =
    normalizeDateInput(requestedStartDate, timezone) ||
    getDateStringInTimezone(new Date(), timezone);
  const periodStart = getWeekStartDateString(normalizedInputDate, weekStartsOn);
  const periodEnd = formatDateOnly(
    addDays(new Date(`${periodStart}T00:00:00Z`), 6)
  );

  const [existing] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.metric, "earnings"),
        eq(goals.period, "week"),
        eq(goals.basis, "gross"),
        eq(goals.scope, "all_platforms"),
        eq(goals.periodStartDate, periodStart)
      )
    )
    .limit(1);

  const [goal] = existing
    ? await db
        .update(goals)
        .set({
          periodEndDate: periodEnd,
          targetAmount: targetAmount.toString(),
          timezone,
          updatedAt: new Date(),
        })
        .where(eq(goals.id, existing.id))
        .returning()
    : await db
        .insert(goals)
        .values({
          basis: "gross",
          metric: "earnings",
          period: "week",
          periodEndDate: periodEnd,
          periodStartDate: periodStart,
          scope: "all_platforms",
          targetAmount: targetAmount.toString(),
          timezone,
          updatedAt: new Date(),
          userId,
        })
        .returning();

  if (!goal) {
    throw new Error("Failed to save goal");
  }

  return {
    goal: toGoalPayload(goal),
    weekStartsOn,
  };
}

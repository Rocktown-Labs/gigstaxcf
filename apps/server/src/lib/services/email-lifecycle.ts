import {
  earningsEntries,
  entryTripVerifications,
  expenses,
  goals,
  platforms,
  stubProfiles,
  users,
} from "@gigstaxcf/db/schema";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { and, count, desc, eq, isNotNull, lte, or, sql } from "drizzle-orm";

import {
  AbandonedOnboardingOfferEmail,
  CadenceSummaryEmail,
  InactivityNudgeEmail,
  OnboardingTipsEmail,
  QuarterlyTaxReminderEmail,
  TipReminderEmail,
  TripVerificationReminderEmail,
  WeeklyGoalCelebrationEmail,
} from "@/emails";
import { renderEmailTemplate } from "@/emails/render-email";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";
import { sendEmail } from "@/lib/services/email";
import {
  ensureEmailEventPending,
  markEmailEventFailed,
  markEmailEventSent,
  markEmailEventSkipped,
  shouldSendEmailEvent,
} from "@/lib/services/email-events";
import { getOrCreateEmailPreferences } from "@/lib/services/email-preferences";
import {
  buildLifecycleUnsubscribeUrl,
  createUnsubscribeToken,
} from "@/lib/services/email-unsubscribe";
import { getActiveOnboardingOfferConfig } from "@/lib/services/onboarding-offers";
import { isTripVerificationTablesMissingError } from "@/lib/services/trip-verifications";
import type { StubCadence } from "@/lib/stubs/types";

const DELIVERY_HOUR_LOCAL = 8;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateKeyInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function getCadenceLabel(cadence: StubCadence) {
  if (cadence === "biweekly") {
    return "Biweekly";
  }

  if (cadence === "monthly") {
    return "Monthly";
  }

  return "Weekly";
}

function formatDateLabel(dateKey: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone,
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function getQuarter(utcMonthIndex: number) {
  return Math.floor(utcMonthIndex / 3) + 1;
}

function getQuarterStartMonth(quarter: number) {
  return (quarter - 1) * 3;
}

function getQuarterKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return `${date.getUTCFullYear()}-Q${getQuarter(date.getUTCMonth())}`;
}

function getPreviousQuarterLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const currentQuarter = getQuarter(date.getUTCMonth());

  if (currentQuarter === 1) {
    return `Q4 ${date.getUTCFullYear() - 1}`;
  }

  return `Q${currentQuarter - 1} ${date.getUTCFullYear()}`;
}

function isFirstDayOfQuarter(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return (
    date.getUTCDate() === 1 &&
    date.getUTCMonth() === getQuarterStartMonth(getQuarter(date.getUTCMonth()))
  );
}

async function getLifecycleLinks(args: {
  category:
    | "cadence_summary"
    | "inactivity_nudge"
    | "abandoned_onboarding_offer"
    | "onboarding_tips"
    | "quarterly_tax_reminder"
    | "tip_reminder"
    | "trip_verification_reminder"
    | "weekly_goal_celebration";
  email: string;
  userId: number;
}) {
  const token = await createUnsubscribeToken({
    category: args.category,
    email: args.email,
    userId: args.userId,
  });

  const oneClickUrl = `${siteUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    listUnsubscribeHeaders: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    managePreferencesHref: `${siteUrl}/dashboard/settings`,
    unsubscribeHref: buildLifecycleUnsubscribeUrl(token),
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEffectiveTip(row: {
  tipEstimatedAmount: unknown;
  tipFinalAmount: unknown;
  tipStatus: string | null;
}) {
  const finalAmount = toNumber(row.tipFinalAmount);
  const estimatedAmount = toNumber(row.tipEstimatedAmount);

  if (row.tipStatus === "final") {
    return finalAmount;
  }

  if (row.tipStatus === "pending") {
    return estimatedAmount;
  }

  if (finalAmount > 0) {
    return finalAmount;
  }

  return estimatedAmount;
}

function getEffectiveTotal(row: {
  bonusAmount: unknown;
  fareAmount: unknown;
  tipEstimatedAmount: unknown;
  tipFinalAmount: unknown;
  tipStatus: string | null;
  totalEstimatedAmount: unknown;
  totalFinalAmount: unknown;
}) {
  const totalFinalAmount = toNumber(row.totalFinalAmount);
  const totalEstimatedAmount = toNumber(row.totalEstimatedAmount);
  const componentTotal =
    toNumber(row.fareAmount) +
    toNumber(row.bonusAmount) +
    getEffectiveTip({
      tipEstimatedAmount: row.tipEstimatedAmount,
      tipFinalAmount: row.tipFinalAmount,
      tipStatus: row.tipStatus,
    });

  if (totalFinalAmount > 0 || componentTotal === 0) {
    return totalFinalAmount;
  }

  if (totalEstimatedAmount > 0 || componentTotal === 0) {
    return totalEstimatedAmount;
  }

  return componentTotal;
}

function getWeekStartDate(dateKey: string, weekStartsOn: "monday" | "sunday") {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const anchorDay = date.getUTCDay();
  const offset =
    weekStartsOn === "sunday" ? anchorDay : anchorDay === 0 ? 6 : anchorDay - 1;
  return addDays(dateKey, -offset);
}

function diffDateKeys(leftDateKey: string, rightDateKey: string) {
  const left = new Date(`${leftDateKey}T00:00:00.000Z`);
  const right = new Date(`${rightDateKey}T00:00:00.000Z`);
  return Math.round((left.getTime() - right.getTime()) / MILLISECONDS_PER_DAY);
}

function makeYearStart(dateKey: string) {
  return `${dateKey.slice(0, 4)}-01-01`;
}

function getBiweeklyWindowStart(
  anchorDate: string,
  weekStartsOn: "monday" | "sunday"
) {
  const anchorWeekStart = getWeekStartDate(anchorDate, weekStartsOn);
  const yearStart = makeYearStart(anchorDate);
  const cadenceStart = getWeekStartDate(yearStart, weekStartsOn);
  const elapsedDays = diffDateKeys(anchorWeekStart, cadenceStart);
  const elapsedBiweeklyPeriods = Math.floor(elapsedDays / 14);
  return addDays(cadenceStart, elapsedBiweeklyPeriods * 14);
}

function getPeriodRange(
  cadence: StubCadence,
  anchorDate: string,
  weekStartsOn: "monday" | "sunday"
) {
  if (cadence === "monthly") {
    const startDate = `${anchorDate.slice(0, 7)}-01`;
    const monthStartUtc = new Date(`${startDate}T00:00:00.000Z`);
    const nextMonthStartUtc = new Date(
      Date.UTC(
        monthStartUtc.getUTCFullYear(),
        monthStartUtc.getUTCMonth() + 1,
        1
      )
    );
    const endDate = new Date(nextMonthStartUtc.getTime() - MILLISECONDS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    return { endDate, startDate };
  }

  if (cadence === "biweekly") {
    const startDate = getBiweeklyWindowStart(anchorDate, weekStartsOn);
    return { endDate: addDays(startDate, 13), startDate };
  }

  const startDate = getWeekStartDate(anchorDate, weekStartsOn);
  return { endDate: addDays(startDate, 6), startDate };
}

function getIsoWeekKey(localDateKey: string) {
  const date = new Date(`${localDateKey}T00:00:00.000Z`);
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

function getLocalHour(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  return Number(hour || "0");
}

async function withLifecycleEvent(args: {
  externalEventId: string;
  payload: Record<string, unknown>;
  send: () => Promise<{
    providerMessageId?: string | null;
    status: "sent" | "skipped";
  }>;
  type:
    | "cadence_summary"
    | "tip_verification_reminder"
    | "trip_verification_reminder"
    | "inactivity_nudge"
    | "abandoned_onboarding_offer"
    | "onboarding_tips"
    | "weekly_goal_celebration"
    | "quarterly_tax_reminder";
  userId: number;
}) {
  const event = await ensureEmailEventPending({
    externalEventId: args.externalEventId,
    payload: args.payload,
    type: args.type,
    userId: args.userId,
  });

  if (!shouldSendEmailEvent(event)) {
    return;
  }

  try {
    const result = await args.send();
    if (result.status === "skipped") {
      await markEmailEventSkipped({
        eventId: event.id,
        reason: "Recipient suppressed",
      });
      return;
    }

    await markEmailEventSent({
      eventId: event.id,
      providerMessageId: result.providerMessageId ?? null,
    });
  } catch (error) {
    await markEmailEventFailed({
      error:
        error instanceof Error
          ? error.message
          : "Failed to send lifecycle email",
      eventId: event.id,
    });
  }
}

function getClosedCadenceAnchor(args: {
  cadence: StubCadence;
  timeZone: string;
  weekStartsOn: "monday" | "sunday";
}) {
  const today = toDateKeyInTimeZone(new Date(), args.timeZone);
  const currentPeriod = getPeriodRange(args.cadence, today, args.weekStartsOn);

  if (args.cadence === "monthly") {
    const priorEnd = addDays(currentPeriod.startDate, -1);
    return `${priorEnd.slice(0, 7)}-01`;
  }

  const length = args.cadence === "biweekly" ? 14 : 7;
  const priorEnd = addDays(currentPeriod.startDate, -1);
  return addDays(priorEnd, -(length - 1));
}

async function getUserIdentity(userId: number) {
  const [user] = await db
    .select({
      currencyCode: users.currencyCode,
      email: users.email,
      isOnboarded: users.isOnboarded,
      onboardedAt: users.onboardedAt,
      onboardingSetupCompletedAt: users.onboardingSetupCompletedAt,
      timezone: users.timezone,
      weekStartsOn: users.weekStartsOn,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

function inDateRange(
  dateKey: string,
  range: { endDate: string; startDate: string }
) {
  return dateKey >= range.startDate && dateKey <= range.endDate;
}

async function buildCadenceSummary(args: {
  cadence: StubCadence;
  currencyCode: string;
  timeZone: string;
  userId: number;
  weekStartsOn: "monday" | "sunday";
}) {
  const anchorDate = getClosedCadenceAnchor({
    cadence: args.cadence,
    timeZone: args.timeZone,
    weekStartsOn: args.weekStartsOn,
  });
  const period = getPeriodRange(args.cadence, anchorDate, args.weekStartsOn);
  const ytd = {
    endDate: period.endDate,
    startDate: makeYearStart(period.endDate),
  };

  const [entryRows, expenseRows] = await Promise.all([
    db
      .select({
        bonusAmount: earningsEntries.bonusAmount,
        fareAmount: earningsEntries.fareAmount,
        occurredAt: earningsEntries.occurredAt,
        platformDisplayName: platforms.displayName,
        tipEstimatedAmount: earningsEntries.tipEstimatedAmount,
        tipFinalAmount: earningsEntries.tipFinalAmount,
        tipStatus: earningsEntries.tipStatus,
        totalEstimatedAmount: earningsEntries.totalEstimatedAmount,
        totalFinalAmount: earningsEntries.totalFinalAmount,
      })
      .from(earningsEntries)
      .innerJoin(platforms, eq(earningsEntries.platformId, platforms.id))
      .where(
        and(
          eq(earningsEntries.userId, args.userId),
          eq(earningsEntries.status, "completed")
        )
      ),
    db
      .select({
        amount: expenses.amount,
        incurredAt: expenses.incurredAt,
      })
      .from(expenses)
      .where(eq(expenses.userId, args.userId)),
  ]);

  let periodGross = 0;
  let periodExpenses = 0;
  let ytdGross = 0;
  let ytdExpenses = 0;
  const dayTotals = new Map<string, number>();
  const platformTotals = new Map<string, number>();

  for (const row of entryRows) {
    const occurredDateKey = toDateKeyInTimeZone(row.occurredAt, args.timeZone);
    if (!occurredDateKey) {
      continue;
    }

    const total = getEffectiveTotal(row);
    if (inDateRange(occurredDateKey, ytd)) {
      ytdGross += total;
    }
    if (inDateRange(occurredDateKey, period)) {
      periodGross += total;
      dayTotals.set(
        occurredDateKey,
        (dayTotals.get(occurredDateKey) || 0) + total
      );
      const displayName = row.platformDisplayName || "Unknown";
      platformTotals.set(
        displayName,
        (platformTotals.get(displayName) || 0) + total
      );
    }
  }

  for (const row of expenseRows) {
    const incurredDateKey = toDateKeyInTimeZone(row.incurredAt, args.timeZone);
    if (!incurredDateKey) {
      continue;
    }

    const amount = toNumber(row.amount);
    if (inDateRange(incurredDateKey, ytd)) {
      ytdExpenses += amount;
    }
    if (inDateRange(incurredDateKey, period)) {
      periodExpenses += amount;
    }
  }

  const topPlatform =
    [...platformTotals.entries()].toSorted(
      (left, right) => right[1] - left[1]
    )[0]?.[0] || "No activity yet";
  const bestDay =
    [...dayTotals.entries()].toSorted((left, right) => right[1] - left[1])[0] ||
    null;

  return {
    bestDayGross: bestDay?.[1] || 0,
    bestDayLabel: bestDay
      ? formatDateLabel(bestDay[0], args.timeZone)
      : "No completed deliveries yet",
    cadence: args.cadence,
    currencyCode: args.currencyCode,
    periodEnd: period.endDate,
    periodExpenses,
    periodGross,
    periodNet: periodGross - periodExpenses,
    periodStart: period.startDate,
    topPlatform,
    ytdNet: ytdGross - ytdExpenses,
  };
}

export async function maybeSendCadenceSummaryEmail(userId: number) {
  const [identity, preferences, profile] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
    db
      .select({ primaryCadence: stubProfiles.primaryCadence })
      .from(stubProfiles)
      .where(eq(stubProfiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (
    !identity?.isOnboarded ||
    !preferences.cadenceSummaryEnabled ||
    !profile
  ) {
    return;
  }

  const cadence = profile.primaryCadence;
  const summary = await buildCadenceSummary({
    cadence,
    currencyCode: identity.currencyCode || "USD",
    timeZone: identity.timezone,
    userId,
    weekStartsOn: identity.weekStartsOn,
  });
  const { periodStart } = summary;
  const { periodEnd } = summary;
  const eventKey = `cadence_summary:${userId}:${cadence}:${periodStart}:${periodEnd}`;
  const links = await getLifecycleLinks({
    category: "cadence_summary",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    CadenceSummaryEmail({
      bestDayGross: formatMoney(summary.bestDayGross, summary.currencyCode),
      bestDayLabel: summary.bestDayLabel,
      cadenceLabel: getCadenceLabel(cadence),
      dashboardHref: `${siteUrl}/dashboard/stubs`,
      expenses: formatMoney(summary.periodExpenses, summary.currencyCode),
      gross: formatMoney(summary.periodGross, summary.currencyCode),
      managePreferencesHref: links.managePreferencesHref,
      net: formatMoney(summary.periodNet, summary.currencyCode),
      periodEnd,
      periodStart,
      topPlatform: summary.topPlatform,
      unsubscribeHref: links.unsubscribeHref,
      ytdNet: formatMoney(summary.ytdNet, summary.currencyCode),
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      cadence,
      periodEnd,
      periodStart,
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: `GigStax ${getCadenceLabel(cadence)} summary: ${periodStart} - ${periodEnd}`,
        text: rendered.text,
        to: identity.email,
      }),
    type: "cadence_summary",
    userId,
  });
}

export async function maybeSendTipReminderEmail(userId: number) {
  const [identity, preferences] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
  ]);
  if (!identity?.isOnboarded || !preferences.tipReminderEnabled) {
    return;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [summary] = await db
    .select({
      pendingCount: count(earningsEntries.id),
      tipTotal:
        sql<number>`COALESCE(SUM(COALESCE(${earningsEntries.tipEstimatedAmount}, 0)), 0)`.mapWith(
          Number
        ),
    })
    .from(earningsEntries)
    .where(
      and(
        eq(earningsEntries.userId, userId),
        eq(earningsEntries.tipStatus, "pending"),
        lte(earningsEntries.occurredAt, cutoff)
      )
    );

  const pendingCount = Number(summary?.pendingCount || 0);
  if (pendingCount <= 0) {
    return;
  }

  const localDateKey = toDateKeyInTimeZone(new Date(), identity.timezone);
  const eventKey = `tip_reminder:${userId}:${localDateKey}`;
  const links = await getLifecycleLinks({
    category: "tip_reminder",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    TipReminderEmail({
      estimatedTipTotal: formatMoney(
        Number(summary?.tipTotal || 0),
        identity.currencyCode || "USD"
      ),
      managePreferencesHref: links.managePreferencesHref,
      notificationsHref: `${siteUrl}/dashboard/notifications`,
      pendingCount: String(pendingCount),
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      localDateKey,
      pendingCount,
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: `You have ${pendingCount} pending tip ${pendingCount === 1 ? "entry" : "entries"} to verify`,
        text: rendered.text,
        to: identity.email,
      }),
    type: "tip_verification_reminder",
    userId,
  });
}

export async function maybeSendTripVerificationReminderEmail(userId: number) {
  const [identity, preferences] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
  ]);
  if (!identity?.isOnboarded || !preferences.tripVerificationReminderEnabled) {
    return;
  }

  let summary:
    | {
        pendingCount: number;
        screenshotMiles: number;
      }
    | null
    | undefined = null;

  try {
    [summary] = await db
      .select({
        pendingCount: count(earningsEntries.id),
        screenshotMiles:
          sql<number>`COALESCE(SUM(COALESCE(${earningsEntries.distanceMiles}, 0)), 0)`.mapWith(
            Number
          ),
      })
      .from(entryTripVerifications)
      .innerJoin(
        earningsEntries,
        eq(entryTripVerifications.entryId, earningsEntries.id)
      )
      .where(
        and(
          eq(earningsEntries.userId, userId),
          eq(earningsEntries.status, "completed"),
          eq(entryTripVerifications.status, "needs_input")
        )
      );
  } catch (error) {
    if (isTripVerificationTablesMissingError(error)) {
      return;
    }

    throw error;
  }

  const pendingCount = Number(summary?.pendingCount || 0);
  if (pendingCount <= 0) {
    return;
  }

  const localDateKey = toDateKeyInTimeZone(new Date(), identity.timezone);
  const isoWeekKey = getIsoWeekKey(localDateKey);
  const eventKey = `trip_verification_reminder:${userId}:${isoWeekKey}`;
  const links = await getLifecycleLinks({
    category: "trip_verification_reminder",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    TripVerificationReminderEmail({
      managePreferencesHref: links.managePreferencesHref,
      notificationsHref: `${siteUrl}/dashboard/notifications`,
      pendingCount: String(pendingCount),
      screenshotMiles: `${Number(summary?.screenshotMiles || 0).toFixed(2)} mi`,
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      isoWeekKey,
      pendingCount,
      screenshotMiles: Number(summary?.screenshotMiles || 0),
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: `You have ${pendingCount} trip ${pendingCount === 1 ? "log" : "logs"} waiting for mileage verification`,
        text: rendered.text,
        to: identity.email,
      }),
    type: "trip_verification_reminder",
    userId,
  });
}

export async function maybeSendInactivityNudgeEmail(userId: number) {
  const [identity, preferences, latest] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
    db
      .select({ occurredAt: earningsEntries.occurredAt })
      .from(earningsEntries)
      .where(
        and(
          eq(earningsEntries.userId, userId),
          eq(earningsEntries.status, "completed")
        )
      )
      .orderBy(desc(earningsEntries.occurredAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!identity?.isOnboarded || !preferences.inactivityNudgeEnabled) {
    return;
  }

  if (!latest?.occurredAt) {
    return;
  }

  const inactivityCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (latest.occurredAt > inactivityCutoff) {
    return;
  }

  const localDateKey = toDateKeyInTimeZone(new Date(), identity.timezone);
  const isoWeekKey = getIsoWeekKey(localDateKey);
  const eventKey = `inactivity_nudge:${userId}:${isoWeekKey}`;
  const links = await getLifecycleLinks({
    category: "inactivity_nudge",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    InactivityNudgeEmail({
      dashboardHref: `${siteUrl}/dashboard`,
      deliveriesHref: `${siteUrl}/dashboard/deliveries`,
      managePreferencesHref: links.managePreferencesHref,
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      isoWeekKey,
      latestCompletedAt: latest.occurredAt.toISOString(),
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: "Log this week’s deliveries in GigStax",
        text: rendered.text,
        to: identity.email,
      }),
    type: "inactivity_nudge",
    userId,
  });
}

export async function maybeSendAbandonedOnboardingOfferEmail(userId: number) {
  const [identity, offer, preferences] = await Promise.all([
    getUserIdentity(userId),
    getActiveOnboardingOfferConfig(),
    getOrCreateEmailPreferences(userId),
  ]);

  if (
    !identity ||
    identity.isOnboarded ||
    !identity.onboardingSetupCompletedAt ||
    !preferences.onboardingOfferEnabled ||
    !offer?.active
  ) {
    return;
  }

  const setupCompletedAt = identity.onboardingSetupCompletedAt.getTime();
  if (Date.now() - setupCompletedAt < MILLISECONDS_PER_DAY) {
    return;
  }

  const eventKey = `abandoned_onboarding_offer:${userId}:${identity.onboardingSetupCompletedAt.toISOString()}`;
  const links = await getLifecycleLinks({
    category: "abandoned_onboarding_offer",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    AbandonedOnboardingOfferEmail({
      code: offer.code,
      managePreferencesHref: links.managePreferencesHref,
      onboardingHref: `${siteUrl}/onboarding`,
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      code: offer.code,
      onboardingSetupCompletedAt:
        identity.onboardingSetupCompletedAt.toISOString(),
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: "Finish GigStax onboarding with your free Starter month",
        text: rendered.text,
        to: identity.email,
      }),
    type: "abandoned_onboarding_offer",
    userId,
  });
}

export async function maybeSendOnboardingTipsEmail(userId: number) {
  const [identity, preferences] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
  ]);

  if (
    !identity?.isOnboarded ||
    !identity.onboardedAt ||
    !preferences.onboardingTipsEnabled
  ) {
    return;
  }

  if (Date.now() - identity.onboardedAt.getTime() > 7 * MILLISECONDS_PER_DAY) {
    return;
  }

  const eventKey = `onboarding_tips:${userId}:${identity.onboardedAt.toISOString().slice(0, 10)}`;
  const links = await getLifecycleLinks({
    category: "onboarding_tips",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    OnboardingTipsEmail({
      dashboardHref: `${siteUrl}/dashboard`,
      deliveriesHref: `${siteUrl}/dashboard/deliveries`,
      managePreferencesHref: links.managePreferencesHref,
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      onboardedAt: identity.onboardedAt.toISOString(),
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: "Getting the most out of GigStax",
        text: rendered.text,
        to: identity.email,
      }),
    type: "onboarding_tips",
    userId,
  });
}

export async function maybeSendWeeklyGoalCelebrationEmail(userId: number) {
  const [identity, preferences] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
  ]);

  if (!identity?.isOnboarded || !preferences.goalCelebrationEnabled) {
    return;
  }

  const closedWeekStart = getClosedCadenceAnchor({
    cadence: "weekly",
    timeZone: identity.timezone,
    weekStartsOn: identity.weekStartsOn,
  });
  const weekRange = getPeriodRange(
    "weekly",
    closedWeekStart,
    identity.weekStartsOn
  );
  const [goal] = await db
    .select({
      targetAmount: goals.targetAmount,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.periodStartDate, weekRange.startDate)
      )
    )
    .limit(1);

  if (!goal) {
    return;
  }

  const entryRows = await db
    .select({
      bonusAmount: earningsEntries.bonusAmount,
      fareAmount: earningsEntries.fareAmount,
      occurredAt: earningsEntries.occurredAt,
      tipEstimatedAmount: earningsEntries.tipEstimatedAmount,
      tipFinalAmount: earningsEntries.tipFinalAmount,
      tipStatus: earningsEntries.tipStatus,
      totalEstimatedAmount: earningsEntries.totalEstimatedAmount,
      totalFinalAmount: earningsEntries.totalFinalAmount,
    })
    .from(earningsEntries)
    .where(
      and(
        eq(earningsEntries.userId, userId),
        eq(earningsEntries.status, "completed")
      )
    );

  let grossTotal = 0;
  for (const row of entryRows) {
    const dateKey = toDateKeyInTimeZone(row.occurredAt, identity.timezone);
    if (!dateKey || !inDateRange(dateKey, weekRange)) {
      continue;
    }

    grossTotal += getEffectiveTotal(row);
  }

  const targetAmount = toNumber(goal.targetAmount);
  if (grossTotal < targetAmount || targetAmount <= 0) {
    return;
  }

  const eventKey = `weekly_goal_celebration:${userId}:${weekRange.startDate}:${weekRange.endDate}`;
  const links = await getLifecycleLinks({
    category: "weekly_goal_celebration",
    email: identity.email,
    userId,
  });

  const rendered = await renderEmailTemplate(
    WeeklyGoalCelebrationEmail({
      dashboardHref: `${siteUrl}/dashboard/goals`,
      managePreferencesHref: links.managePreferencesHref,
      periodEnd: weekRange.endDate,
      periodStart: weekRange.startDate,
      targetAmount: formatMoney(targetAmount, identity.currencyCode || "USD"),
      totalAmount: formatMoney(grossTotal, identity.currencyCode || "USD"),
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: eventKey,
    payload: {
      periodEnd: weekRange.endDate,
      periodStart: weekRange.startDate,
      targetAmount,
      totalAmount: grossTotal,
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: eventKey,
        subject: "You hit your weekly GigStax goal",
        text: rendered.text,
        to: identity.email,
      }),
    type: "weekly_goal_celebration",
    userId,
  });
}

export async function maybeSendQuarterlyTaxReminderEmail(userId: number) {
  const [identity, preferences] = await Promise.all([
    getUserIdentity(userId),
    getOrCreateEmailPreferences(userId),
  ]);

  if (!identity?.isOnboarded || !preferences.quarterlyTaxReminderEnabled) {
    return;
  }

  const localDateKey = toDateKeyInTimeZone(new Date(), identity.timezone);
  if (!localDateKey || !isFirstDayOfQuarter(localDateKey)) {
    return;
  }

  const quarterKey = getQuarterKey(localDateKey);
  const links = await getLifecycleLinks({
    category: "quarterly_tax_reminder",
    email: identity.email,
    userId,
  });
  const rendered = await renderEmailTemplate(
    QuarterlyTaxReminderEmail({
      dashboardHref: `${siteUrl}/dashboard/deliveries`,
      managePreferencesHref: links.managePreferencesHref,
      quarterLabel: getPreviousQuarterLabel(localDateKey),
      unsubscribeHref: links.unsubscribeHref,
    })
  );

  await withLifecycleEvent({
    externalEventId: `quarterly_tax_reminder:${userId}:${quarterKey}`,
    payload: {
      quarterKey,
    },
    send: () =>
      sendEmail({
        category: "lifecycle",
        headers: links.listUnsubscribeHeaders,
        html: rendered.html,
        idempotencyKey: `quarterly_tax_reminder:${userId}:${quarterKey}`,
        subject: "Quarterly reminder: review your trip miles",
        text: rendered.text,
        to: identity.email,
      }),
    type: "quarterly_tax_reminder",
    userId,
  });
}

export async function runLifecycleEmailPassForUser(userId: number) {
  await maybeSendAbandonedOnboardingOfferEmail(userId);
  await maybeSendOnboardingTipsEmail(userId);
  await maybeSendWeeklyGoalCelebrationEmail(userId);
  await maybeSendQuarterlyTaxReminderEmail(userId);
  await maybeSendCadenceSummaryEmail(userId);
  await maybeSendTipReminderEmail(userId);
  await maybeSendTripVerificationReminderEmail(userId);
  await maybeSendInactivityNudgeEmail(userId);
}

export async function listUsersForLifecycleHour(date: Date = new Date()) {
  const rows = await db
    .select({
      id: users.id,
      timezone: users.timezone,
    })
    .from(users)
    .where(
      or(
        eq(users.isOnboarded, true),
        isNotNull(users.onboardingSetupCompletedAt)
      )
    );

  return rows
    .filter((row) => getLocalHour(row.timezone, date) === DELIVERY_HOUR_LOCAL)
    .map((row) => row.id);
}

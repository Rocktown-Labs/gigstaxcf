import { expenses, users } from "@gigstaxcf/db/schema";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  getEffectiveTip,
  getEffectiveTotal,
  listEntriesForUser,
} from "@/lib/services/entries";

export interface DashboardOverviewStats {
  totalDeliveries: number;
  totalEarnings: number;
  totalExpenses: number;
  totalMiles: number;
  totalTips: number;
}

export interface DashboardRecentEntry {
  distanceMiles: number;
  effectiveTip: number;
  effectiveTotal: number;
  id: number;
  occurredAt: string;
  platformDisplayName: string;
  platformSlug: string;
}

export interface DashboardPlatformBreakdown {
  colorHex: string;
  name: string;
  value: number;
}

export interface DashboardDataResult {
  monthlyPlatformBreakdown: DashboardPlatformBreakdown[];
  monthlyPlatformTotal: number;
  platformBreakdown: DashboardPlatformBreakdown[];
  recentEntries: DashboardRecentEntry[];
  stats: DashboardOverviewStats;
  user: {
    email: string;
    firstName: string;
    name: string;
  };
}

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const CHART_FALLBACK_COLOR = "#2563eb";
const HEX_COLOR_REGEX = /^#(?<hex>[0-9a-fA-F]{6})$/u;

const formatPlatformName = (slug: string) =>
  slug.replaceAll("_", " ").replaceAll(/\b\w/gu, (char) => char.toUpperCase());

const createMonthKeyGetter = (timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone,
    year: "numeric",
  });

  return (date: Date) => {
    const parts = formatter.formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const year = parts.find((part) => part.type === "year")?.value;

    if (!month || !year) {
      return "";
    }

    return `${year}-${month}`;
  };
};

const resolveMonthKeyGetter = (timeZone: string | null | undefined) => {
  const normalized = timeZone?.trim() || "UTC";

  try {
    return createMonthKeyGetter(normalized);
  } catch {
    return createMonthKeyGetter("UTC");
  }
};

const normalizePlatformColor = (value: unknown) => {
  if (typeof value !== "string") {
    return CHART_FALLBACK_COLOR;
  }

  const normalized = value.trim();
  const prefixed = normalized.startsWith("#") ? normalized : `#${normalized}`;
  if (!HEX_COLOR_REGEX.test(prefixed)) {
    return CHART_FALLBACK_COLOR;
  }

  return prefixed.toLowerCase();
};

const getFirstName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Driver";
  }

  const [firstToken] = trimmed.split(/\s+/u);
  return firstToken || "Driver";
};

export async function getDashboardData(
  userId: number
): Promise<DashboardDataResult | null> {
  const userPromise = db
    .select({ email: users.email, name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const entriesPromise = listEntriesForUser(userId, {
    limit: 500,
    status: "completed",
  });

  const expensesPromise = db
    .select({
      totalExpenses: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .then((rows) => rows[0] ?? null);

  const [user, entries, expenseStat] = await Promise.all([
    userPromise,
    entriesPromise,
    expensesPromise,
  ]);

  if (!user) {
    return null;
  }

  const platformTotals = new Map<
    string,
    { colorHex: string; name: string; value: number }
  >();
  const monthlyPlatformTotals = new Map<
    string,
    { colorHex: string; name: string; value: number }
  >();
  const recentEntries: DashboardRecentEntry[] = [];
  const monthKeyFor = resolveMonthKeyGetter(user.timezone);
  const currentMonthKey = monthKeyFor(new Date());

  let totalEarnings = 0;
  let totalMiles = 0;
  let totalTips = 0;

  for (const [index, entry] of entries.entries()) {
    const effectiveTip = getEffectiveTip(entry);
    const effectiveTotal = getEffectiveTotal(entry);
    const platformSlug = String(
      entry.platformSlug || entry.platform_slug || "other"
    );
    const platformDisplayName = String(
      entry.platformDisplayName ||
        entry.platform_display_name ||
        formatPlatformName(platformSlug)
    );
    const platformColorHex = normalizePlatformColor(
      entry.platformColorHex || entry.platform_color_hex || CHART_FALLBACK_COLOR
    );
    const distanceMiles = toNumber(
      entry.distanceMiles || entry.distance_miles || 0
    );
    const occurredAtRaw = String(
      entry.occurredAt || entry.occurred_at || new Date().toISOString()
    );
    const occurredAt = new Date(occurredAtRaw);
    const hasValidOccurredAt = !Number.isNaN(occurredAt.getTime());

    totalEarnings += effectiveTotal;
    totalMiles += distanceMiles;
    totalTips += effectiveTip;
    const existingPlatform = platformTotals.get(platformSlug);
    platformTotals.set(platformSlug, {
      colorHex: platformColorHex,
      name: platformDisplayName,
      value: (existingPlatform?.value || 0) + effectiveTotal,
    });
    if (hasValidOccurredAt && monthKeyFor(occurredAt) === currentMonthKey) {
      const existingMonthlyPlatform = monthlyPlatformTotals.get(platformSlug);
      monthlyPlatformTotals.set(platformSlug, {
        colorHex: platformColorHex,
        name: platformDisplayName,
        value: (existingMonthlyPlatform?.value || 0) + effectiveTotal,
      });
    }

    if (index < 10) {
      recentEntries.push({
        distanceMiles,
        effectiveTip,
        effectiveTotal,
        id: Number(entry.id),
        occurredAt: occurredAtRaw,
        platformDisplayName,
        platformSlug,
      });
    }
  }

  const platformBreakdown = [...platformTotals.values()].toSorted(
    (left, right) => right.value - left.value
  );
  const monthlyPlatformBreakdown = [...monthlyPlatformTotals.values()].toSorted(
    (left, right) => right.value - left.value
  );
  const monthlyPlatformTotal = monthlyPlatformBreakdown.reduce(
    (sum, platform) => sum + platform.value,
    0
  );

  return {
    monthlyPlatformBreakdown,
    monthlyPlatformTotal,
    platformBreakdown,
    recentEntries,
    stats: {
      totalDeliveries: entries.length,
      totalEarnings,
      totalExpenses: toNumber(expenseStat?.totalExpenses),
      totalMiles,
      totalTips,
    },
    user: {
      ...user,
      firstName: getFirstName(user.name),
    },
  };
}

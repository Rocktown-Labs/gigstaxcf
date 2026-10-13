import { aiUsageEvents, subscriptions, users } from "@gigstaxcf/db/schema";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { buildPaginationState } from "@/lib/pagination";
import type { ParsedPagination } from "@/lib/pagination";

const ACTIVE_PAID_STATUSES = ["active", "trialing", "uncanceled"] as const;
const ADMIN_USERS_PAGE_SIZE = 10;
const USER_GROWTH_DAYS = 30;

/**
 * Ported from the gigstax /api/admin/overview route.
 */
export async function getAdminOverview() {
  const [countsRow, activePaidRow] = await Promise.all([
    db
      .select({
        admins: sql<number>`COALESCE(SUM(CASE WHEN ${users.role} = 'admin' THEN 1 ELSE 0 END), 0)`,
        onboarded: sql<number>`COALESCE(SUM(CASE WHEN ${users.isOnboarded} = true THEN 1 ELSE 0 END), 0)`,
        totalUsers: sql<number>`COUNT(*)`,
      })
      .from(users)
      .then((rows) => rows[0]),
    db
      .select({
        activePaid: sql<number>`COUNT(*)`,
      })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, [...ACTIVE_PAID_STATUSES]),
          ne(subscriptions.planTier, "free")
        )
      )
      .then((rows) => rows[0]),
  ]);

  const planBreakdownRows = await db
    .select({
      count: sql<number>`COUNT(*)`,
      planTier: subscriptions.planTier,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .groupBy(subscriptions.planTier, subscriptions.status);

  const onboardingRows = await db
    .select({
      count: sql<number>`COUNT(*)`,
      isOnboarded: users.isOnboarded,
    })
    .from(users)
    .groupBy(users.isOnboarded);

  return {
    onboardingBreakdown: onboardingRows,
    planBreakdown: planBreakdownRows,
    stats: {
      activePaidSubscriptions: Number(activePaidRow?.activePaid || 0),
      adminUsers: Number(countsRow?.admins || 0),
      onboardedUsers: Number(countsRow?.onboarded || 0),
      totalUsers: Number(countsRow?.totalUsers || 0),
    },
  };
}

/**
 * Ported from the gigstax /api/admin/users route.
 */
export async function listAdminUsersPage(pagination: ParsedPagination) {
  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users);

  const paginationState = buildPaginationState({
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: Number(totalRow?.count ?? 0),
  });
  const offset = (paginationState.page - 1) * paginationState.pageSize;

  const rows = await db
    .select({
      authUserId: users.authUserId,
      createdAt: users.createdAt,
      email: users.email,
      id: users.id,
      isOnboarded: users.isOnboarded,
      name: users.name,
      onboardedAt: users.onboardedAt,
      role: users.role,
      subscriptionBillingInterval: subscriptions.billingInterval,
      subscriptionPlanTier: subscriptions.planTier,
      subscriptionStatus: subscriptions.status,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(paginationState.pageSize)
    .offset(offset);

  const chartStart = new Date();
  chartStart.setUTCHours(0, 0, 0, 0);
  chartStart.setUTCDate(chartStart.getUTCDate() - (USER_GROWTH_DAYS - 1));

  const userGrowthRows = await db
    .select({
      date: sql<string>`DATE(${users.createdAt})::text`,
      newUsers: sql<number>`COUNT(*)`,
      onboardedUsers: sql<number>`COALESCE(SUM(CASE WHEN ${users.isOnboarded} = true THEN 1 ELSE 0 END), 0)`,
      paidUsers: sql<number>`COALESCE(SUM(CASE WHEN ${subscriptions.planTier} <> 'free' AND ${subscriptions.status} IN ('active', 'trialing', 'uncanceled') THEN 1 ELSE 0 END), 0)`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(gte(users.createdAt, chartStart))
    .groupBy(sql`DATE(${users.createdAt})`)
    .orderBy(sql`DATE(${users.createdAt})`);

  const growthByDate = new Map(
    userGrowthRows.map((row) => [row.date, row] as const)
  );
  const userGrowth = Array.from(
    { length: USER_GROWTH_DAYS },
    (_item, index) => {
      const date = new Date(chartStart);
      date.setUTCDate(chartStart.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const row = growthByDate.get(key);
      const labelDate = new Date(`${key}T12:00:00.000Z`);

      return {
        date: key,
        label: labelDate.toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
        }),
        newUsers: Number(row?.newUsers ?? 0),
        onboardedUsers: Number(row?.onboardedUsers ?? 0),
        paidUsers: Number(row?.paidUsers ?? 0),
      };
    }
  );

  const [summaryRow] = await db
    .select({
      adminUsers: sql<number>`COALESCE(SUM(CASE WHEN ${users.role} = 'admin' THEN 1 ELSE 0 END), 0)`,
      onboardedUsers: sql<number>`COALESCE(SUM(CASE WHEN ${users.isOnboarded} = true THEN 1 ELSE 0 END), 0)`,
      totalUsers: sql<number>`COUNT(*)`,
    })
    .from(users);

  const [activePaidRow] = await db
    .select({ activePaidUsers: sql<number>`COUNT(*)` })
    .from(subscriptions)
    .where(
      and(
        inArray(subscriptions.status, [...ACTIVE_PAID_STATUSES]),
        ne(subscriptions.planTier, "free")
      )
    );

  return {
    pagination: paginationState,
    summary: {
      activePaidUsers: Number(activePaidRow?.activePaidUsers ?? 0),
      adminUsers: Number(summaryRow?.adminUsers ?? 0),
      onboardedUsers: Number(summaryRow?.onboardedUsers ?? 0),
      totalUsers: Number(summaryRow?.totalUsers ?? 0),
    },
    userGrowth,
    users: rows,
  };
}

export const ADMIN_USERS_DEFAULT_PAGE_SIZE = ADMIN_USERS_PAGE_SIZE;

/**
 * Ported from the gigstax /api/admin/users/[id]/role route.
 */
export async function updateAdminUserRole(
  userId: number,
  role: "admin" | "driver"
) {
  const [updated] = await db
    .update(users)
    .set({
      role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      role: users.role,
    });

  return updated ?? null;
}

/**
 * Ported from the gigstax /api/admin/usage/summary route.
 */
export async function getAdminUsageSummary(days: number) {
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    overviewRow,
    summaryRows,
    topUsersRows,
    dailyTotalsRows,
    dailyMeterRows,
    endpointRows,
  ] = await Promise.all([
    db
      .select({
        activeUsers: sql<number>`COUNT(DISTINCT ${aiUsageEvents.userId})`,
        blockedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'blocked' THEN 1 ELSE 0 END), 0)`,
        failedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
        successEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'success' THEN 1 ELSE 0 END), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        totalEvents: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .then((rows) => rows[0]),
    db
      .select({
        estimatedCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        meterKey: aiUsageEvents.meterKey,
        status: aiUsageEvents.status,
        totalEvents: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .groupBy(aiUsageEvents.meterKey, aiUsageEvents.status),
    db
      .select({
        blockedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'blocked' THEN 1 ELSE 0 END), 0)`,
        email: users.email,
        failedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
        name: users.name,
        successEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'success' THEN 1 ELSE 0 END), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        totalEvents: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
        userId: aiUsageEvents.userId,
      })
      .from(aiUsageEvents)
      .innerJoin(users, eq(users.id, aiUsageEvents.userId))
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .groupBy(aiUsageEvents.userId, users.email, users.name)
      .orderBy(desc(sql`COALESCE(SUM(${aiUsageEvents.units}), 0)`))
      .limit(25),
    db
      .select({
        blockedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'blocked' THEN 1 ELSE 0 END), 0)`,
        day: sql<string>`DATE(${aiUsageEvents.createdAt})::text`,
        failedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
        successEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'success' THEN 1 ELSE 0 END), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        totalEvents: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .groupBy(sql`DATE(${aiUsageEvents.createdAt})`)
      .orderBy(sql`DATE(${aiUsageEvents.createdAt})`),
    db
      .select({
        day: sql<string>`DATE(${aiUsageEvents.createdAt})::text`,
        meterKey: aiUsageEvents.meterKey,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        totalEvents: sql<number>`COUNT(*)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .groupBy(sql`DATE(${aiUsageEvents.createdAt})`, aiUsageEvents.meterKey)
      .orderBy(sql`DATE(${aiUsageEvents.createdAt})`, aiUsageEvents.meterKey),
    db
      .select({
        blockedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'blocked' THEN 1 ELSE 0 END), 0)`,
        endpoint: aiUsageEvents.endpoint,
        failedEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
        feature: aiUsageEvents.feature,
        successEvents: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsageEvents.status} = 'success' THEN 1 ELSE 0 END), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsageEvents.estimatedCostUsd}), 0)`,
        totalEvents: sql<number>`COUNT(*)`,
        totalUnits: sql<number>`COALESCE(SUM(${aiUsageEvents.units}), 0)`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, periodStart))
      .groupBy(aiUsageEvents.feature, aiUsageEvents.endpoint)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(30),
  ]);

  return {
    dailyTotals: dailyTotalsRows,
    endpointSummary: endpointRows,
    overview: overviewRow ?? null,
    periodStart: periodStart.toISOString(),
    summary: summaryRows,
    topUsers: topUsersRows,
    usageByDay: dailyMeterRows,
  };
}

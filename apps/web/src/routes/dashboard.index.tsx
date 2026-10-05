import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Banknote, MapPin, Navigation, Wallet } from "lucide-react";
import { z } from "zod";

import {
  dashboardPageMainWideClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { MonthlyPlatformDonut } from "@/components/dashboard/monthly-platform-donut";
import { ResponsiveDataCards } from "@/components/dashboard/responsive-data-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

const dashboardSearchSchema = z.object({
  recentPage: z.coerce.number().int().min(1).optional(),
  view: z.enum(["gross", "net"]).optional(),
});

const HEX_COLOR_REGEX = /^#(?<hex>[0-9a-fA-F]{6})$/u;
const NEAR_BLACK_RGB_THRESHOLD = 40;
const NEAR_BLACK_REPLACEMENT_COLOR = "#3f3f46";
const RECENT_PAGE_SIZE = 5;

const parseHexColor = (value: string) => {
  if (!HEX_COLOR_REGEX.test(value)) {
    return null;
  }

  return {
    blue: Number.parseInt(value.slice(5, 7), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    red: Number.parseInt(value.slice(1, 3), 16),
  };
};

const isNearBlack = (colorHex: string) => {
  const parsed = parseHexColor(colorHex);
  if (!parsed) {
    return false;
  }

  return (
    parsed.red <= NEAR_BLACK_RGB_THRESHOLD &&
    parsed.green <= NEAR_BLACK_RGB_THRESHOLD &&
    parsed.blue <= NEAR_BLACK_RGB_THRESHOLD
  );
};

const getChartColor = (colorHex: string) =>
  isNearBlack(colorHex) ? NEAR_BLACK_REPLACEMENT_COLOR : colorHex;

interface DashboardEntry {
  id: number;
  occurredAt?: string;
  occurred_at?: string;
  distanceMiles?: number | string | null;
  distance_miles?: number | string | null;
  effectiveTip?: number | string;
  effective_tip?: number | string;
  effectiveTotal?: number | string;
  effective_total?: number | string;
  platformSlug?: string;
  platform_slug?: string;
  platformDisplayName?: string;
  platform_display_name?: string;
  platformColorHex?: string;
  platform_color_hex?: string;
}

interface EntriesResponse {
  entries?: DashboardEntry[];
  pagination?: { totalItems: number };
  summary?: {
    totalLogs: number;
    totalMiles: number;
    totalPayout: number;
    totalTips: number;
  };
}

interface ExpensesSummaryResponse {
  summary?: { totalExpenses: number };
}

const CHART_FALLBACK_COLOR = "#2563eb";

const formatPlatformName = (slug: string) =>
  slug.replaceAll("_", " ").replaceAll(/\b\w/gu, (char) => char.toUpperCase());

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

const getFirstName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Driver";
  }

  const [firstToken] = trimmed.split(/\s+/u);
  return firstToken || "Driver";
};

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Dashboard" }],
  }),
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const isNetView = search.view === "net";
  const recentPage = search.recentPage ?? 1;

  // NOTE(dashboard-api): the legacy page consumed `getDashboardData`
  // (lib/services/dashboard.ts) on the server. There is no
  // /api/dashboard-summary endpoint, so this port recomputes the same shape
  // client-side from GET /api/entries?status=completed&pageSize=500 (stats +
  // recent entries + platform breakdowns) and the /api/expenses summary
  // (total expenses), matching what getDashboardData returned.
  const dashboardQuery = useQuery({
    queryFn: async () => {
      const [entriesResponse, expensesResponse] = await Promise.all([
        apiFetch("/api/entries?status=completed&pageSize=500"),
        apiFetch("/api/expenses?pageSize=1"),
      ]);

      if (!entriesResponse.ok || !expensesResponse.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const entriesPayload = (await entriesResponse.json()) as EntriesResponse;
      const expensesPayload =
        (await expensesResponse.json()) as ExpensesSummaryResponse;

      const entries = entriesPayload.entries ?? [];
      const monthKeyFor = resolveMonthKeyGetter(user.timezone);
      const currentMonthKey = monthKeyFor(new Date());

      const monthlyPlatformTotals = new Map<
        string,
        { colorHex: string; name: string; value: number }
      >();
      const recentEntries = entries.slice(0, 10).map((entry) => {
        const effectiveTotal = toNumber(
          entry.effectiveTotal ?? entry.effective_total
        );
        const effectiveTip = toNumber(
          entry.effectiveTip ?? entry.effective_tip
        );
        const platformSlug =
          entry.platformSlug || entry.platform_slug || "other";
        const platformColorHex = normalizePlatformColor(
          entry.platformColorHex || entry.platform_color_hex
        );
        const occurredAtRaw = String(
          entry.occurredAt || entry.occurred_at || new Date().toISOString()
        );
        const occurredAt = new Date(occurredAtRaw);

        // Mirror getDashboardData: the "This Month" breakdown only includes
        // completed entries whose occurredAt falls in the current month
        // (in the driver's timezone).
        if (
          !Number.isNaN(occurredAt.getTime()) &&
          monthKeyFor(occurredAt) === currentMonthKey
        ) {
          const monthly = monthlyPlatformTotals.get(platformSlug);
          monthlyPlatformTotals.set(platformSlug, {
            colorHex: platformColorHex,
            name:
              entry.platformDisplayName ||
              entry.platform_display_name ||
              formatPlatformName(platformSlug),
            value: (monthly?.value || 0) + effectiveTotal,
          });
        }

        return {
          distanceMiles: toNumber(
            entry.distanceMiles || entry.distance_miles || 0
          ),
          effectiveTip,
          effectiveTotal,
          id: entry.id,
          occurredAt: occurredAtRaw,
          platformDisplayName:
            entry.platformDisplayName ||
            entry.platform_display_name ||
            formatPlatformName(platformSlug),
          platformSlug,
        };
      });

      const monthlyPlatformBreakdown = [...monthlyPlatformTotals.values()]
        .sort((left, right) => right.value - left.value)
        .map((platform) => ({
          ...platform,
          chartColorHex: getChartColor(platform.colorHex),
        }));
      const monthlyPlatformTotal = monthlyPlatformBreakdown.reduce(
        (sum, platform) => sum + platform.value,
        0
      );
      const summary = entriesPayload.summary ?? {
        totalLogs: entries.length,
        totalMiles: 0,
        totalPayout: 0,
        totalTips: 0,
      };

      return {
        firstName: getFirstName(user.name),
        monthlyPlatformBreakdown,
        monthlyPlatformTotal,
        recentEntries,
        stats: {
          totalDeliveries: summary.totalLogs,
          totalEarnings: summary.totalPayout,
          totalExpenses: expensesPayload.summary?.totalExpenses ?? 0,
          totalMiles: summary.totalMiles,
          totalTips: summary.totalTips,
        },
      };
    },
    queryKey: ["dashboard-overview"],
  });

  const { data } = dashboardQuery;
  const displayEarnings = data
    ? data.stats.totalEarnings - (isNetView ? data.stats.totalExpenses : 0)
    : 0;

  const chartPlatforms = data?.monthlyPlatformBreakdown ?? [];
  const donutPlatforms = chartPlatforms.map((platform) => ({
    colorHex: platform.chartColorHex,
    name: platform.name,
    value: platform.value,
  }));
  const recentEntries = data?.recentEntries ?? [];
  const recentTotalItems = recentEntries.length;
  const recentTotalPages = Math.max(
    1,
    Math.ceil(recentTotalItems / RECENT_PAGE_SIZE)
  );
  const clampedRecentPage = Math.min(recentTotalPages, Math.max(1, recentPage));
  const recentStartIndex = (clampedRecentPage - 1) * RECENT_PAGE_SIZE;
  const pagedRecentEntries = recentEntries.slice(
    recentStartIndex,
    recentStartIndex + RECENT_PAGE_SIZE
  );
  const recentStartItem = recentTotalItems === 0 ? 0 : recentStartIndex + 1;
  const recentEndItem = Math.min(
    recentStartIndex + RECENT_PAGE_SIZE,
    recentTotalItems
  );

  const goToRecentPage = (targetPage: number) => {
    navigate({
      to: "/dashboard",
      search: (prev) => ({
        ...prev,
        recentPage: targetPage > 1 ? targetPage : undefined,
      }),
    });
  };

  const goToView = (view: "gross" | "net") => {
    navigate({
      to: "/dashboard",
      search: (prev) => ({
        ...prev,
        recentPage: clampedRecentPage > 1 ? clampedRecentPage : undefined,
        view,
      }),
    });
  };

  if (dashboardQuery.isLoading || !data) {
    return (
      <div className={dashboardPageOuterClass}>
        <main className={`${dashboardPageMainWideClass} py-12`}>
          <div className="border-primary/30 border-t-primary mx-auto h-8 w-8 animate-spin rounded-full border-4" />
        </main>
      </div>
    );
  }

  return (
    <div className={`bg-background min-h-screen ${dashboardPageOuterClass}`}>
      <main className={`${dashboardPageMainWideClass} space-y-8 md:py-12`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="mb-2 text-3xl font-extrabold tracking-tight">
              Welcome back, {data.firstName}
            </h2>
          </div>

          <div className="border-border/50 bg-background inline-flex w-fit items-center self-start rounded-lg border p-1 shadow-sm">
            <button
              type="button"
              className={`ring-offset-background inline-flex min-w-30 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                isNetView
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "bg-primary text-primary-foreground shadow-sm"
              }`}
              onClick={() => goToView("gross")}
            >
              Gross Earnings
            </button>
            <button
              type="button"
              className={`ring-offset-background inline-flex min-w-30 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                isNetView
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => goToView("net")}
            >
              Net Earnings
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="border-border/50 bg-card hover:border-primary/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                {isNetView ? "Net Earnings" : "Gross Earnings"}
              </span>
              <Wallet className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-3xl font-bold tracking-tight">
              ${displayEarnings.toFixed(2)}
            </div>
            {isNetView ? (
              <div className="bg-destructive/10 text-destructive mt-2 w-fit rounded-full px-2 py-0.5 text-xs">
                -${data.stats.totalExpenses.toFixed(2)} expenses
              </div>
            ) : null}
          </div>

          <div className="border-border/50 bg-card hover:border-primary/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Deliveries
              </span>
              <MapPin className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {data.stats.totalDeliveries}
            </div>
          </div>

          <div className="border-border/50 bg-card hover:border-primary/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Total Miles
              </span>
              <Navigation className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {data.stats.totalMiles.toFixed(1)}
            </div>
          </div>

          <div className="border-border/50 bg-card hover:border-primary/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">
                Total Tips
              </span>
              <Banknote className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-primary text-3xl font-bold tracking-tight">
              ${data.stats.totalTips.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <Button
            asChild
            size="sm"
            className="h-11 min-w-0 flex-1 rounded-xl px-2 text-xs font-semibold"
          >
            <Link to="/dashboard/deliveries">
              <span className="truncate">Log Delivery</span>
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="border-border/50 bg-secondary/50 hover:bg-secondary h-11 min-w-0 flex-1 rounded-xl border px-2 text-xs font-medium"
          >
            <Link to="/dashboard/expenses">
              <span className="truncate">Log Expense</span>
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-11 min-w-0 flex-1 rounded-xl px-2 text-xs font-medium"
          >
            <Link to="/dashboard/goals">
              <span className="truncate">Set Goal</span>
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-11 min-w-0 flex-1 rounded-xl px-2 text-xs font-medium"
          >
            <Link to="/dashboard/stubs">
              <span className="truncate">Stubs</span>
            </Link>
          </Button>
        </div>

        <div className="hidden gap-4 sm:flex">
          <Button
            asChild
            size="lg"
            className="text-md h-14 flex-1 rounded-xl font-semibold"
          >
            <Link to="/dashboard/deliveries">Log Delivery</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border-border/50 bg-secondary/50 text-md hover:bg-secondary h-14 flex-1 rounded-xl border font-medium"
          >
            <Link to="/dashboard/expenses">Log Expense</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="text-md h-14 flex-1 rounded-xl font-medium"
          >
            <Link to="/dashboard/goals">Set Goal</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="text-md h-14 flex-1 rounded-xl font-medium"
          >
            <Link to="/dashboard/stubs">GigStax Stubs</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="border-border bg-card/95 rounded-3xl shadow-lg xl:col-span-2">
            <CardHeader className="space-y-3">
              <div className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-xl">Recent Deliveries</CardTitle>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary/80"
                >
                  <Link to="/dashboard/deliveries">View All →</Link>
                </Button>
              </div>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Showing {recentStartItem}-{recentEndItem} of {recentTotalItems}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentTotalItems === 0 ? (
                <div className="border-border/50 bg-card/30 rounded-2xl border border-dashed p-12 text-center">
                  <div className="mb-4 text-4xl opacity-50">🚗</div>
                  <h4 className="mb-1 text-lg font-medium">
                    No deliveries logged
                  </h4>
                  <p className="text-muted-foreground mx-auto max-w-sm text-sm">
                    You have not tracked any routes yet. Use Log Delivery or Log
                    Expense to get started.
                  </p>
                </div>
              ) : (
                <>
                  <ResponsiveDataCards
                    className="xl:hidden"
                    items={pagedRecentEntries}
                    getKey={(entry) => entry.id}
                    renderCard={(entry) => (
                      <article className="border-border/60 bg-card rounded-2xl border p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className="bg-primary/10 text-primary inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
                            {entry.platformDisplayName}
                          </span>
                          <p className="text-right text-lg font-bold whitespace-nowrap">
                            ${entry.effectiveTotal.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-muted-foreground space-y-2 text-sm">
                          <p>
                            {new Date(entry.occurredAt).toLocaleDateString(
                              "en-US",
                              {
                                day: "numeric",
                                month: "short",
                                weekday: "short",
                              }
                            )}
                          </p>
                          <p>
                            Miles:{" "}
                            <span className="text-foreground font-semibold">
                              {entry.distanceMiles.toFixed(1)} mi
                            </span>
                          </p>
                          <p>
                            Tip:{" "}
                            {entry.effectiveTip > 0 ? (
                              <span className="inline-flex rounded-lg bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                +${entry.effectiveTip.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </p>
                        </div>
                        <div className="mt-4">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to="/dashboard/deliveries/$id"
                              params={{ id: String(entry.id) }}
                            >
                              Open
                            </Link>
                          </Button>
                        </div>
                      </article>
                    )}
                  />

                  <div className="border-border bg-card hidden overflow-x-auto rounded-2xl border xl:block">
                    <Table className="min-w-max table-auto">
                      <caption className="sr-only">
                        Recent deliveries snapshot
                      </caption>
                      <TableHeader className="bg-muted">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-11 min-w-40 px-3 font-semibold">
                            Platform
                          </TableHead>
                          <TableHead className="h-11 min-w-47.5 px-3 font-semibold">
                            Date
                          </TableHead>
                          <TableHead className="h-11 min-w-25 px-3 font-semibold">
                            Miles
                          </TableHead>
                          <TableHead className="h-11 min-w-[100px] px-3 font-semibold">
                            Tip
                          </TableHead>
                          <TableHead className="h-11 min-w-30 px-3 text-right font-semibold">
                            Total
                          </TableHead>
                          <TableHead className="h-11 min-w-32.5 px-3 text-right font-semibold">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedRecentEntries.map((entry) => (
                          <TableRow
                            key={entry.id}
                            className="border-border hover:bg-muted/40"
                          >
                            <TableCell className="px-3 py-2.5">
                              <span className="bg-primary/10 text-primary inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                {entry.platformDisplayName}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground px-3 py-2.5">
                              {new Date(entry.occurredAt).toLocaleDateString(
                                "en-US",
                                {
                                  day: "numeric",
                                  month: "short",
                                  weekday: "short",
                                }
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 font-semibold">
                              {entry.distanceMiles.toFixed(1)} mi
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              {entry.effectiveTip > 0 ? (
                                <span className="inline-flex rounded-lg bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                  +${entry.effectiveTip.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  --
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-right text-lg font-bold whitespace-nowrap">
                              ${entry.effectiveTotal.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              <div className="flex justify-end">
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    to="/dashboard/deliveries/$id"
                                    params={{ id: String(entry.id) }}
                                  >
                                    Open
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-border/50 bg-card/30 text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
                    {recentTotalItems} recent record
                    {recentTotalItems === 1 ? "" : "s"}
                  </div>
                </>
              )}

              {recentTotalPages > 1 ? (
                <Pagination>
                  <PaginationContent className="w-full justify-between sm:justify-center">
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        className={
                          clampedRecentPage <= 1
                            ? "pointer-events-none opacity-40"
                            : ""
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          goToRecentPage(Math.max(1, clampedRecentPage - 1));
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem className="hidden sm:block">
                      <PaginationLink
                        href="#"
                        aria-current="page"
                        isActive
                        onClick={(event) => {
                          event.preventDefault();
                          goToRecentPage(clampedRecentPage);
                        }}
                      >
                        {clampedRecentPage}
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        className={
                          clampedRecentPage >= recentTotalPages
                            ? "pointer-events-none opacity-40"
                            : ""
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          goToRecentPage(
                            Math.min(recentTotalPages, clampedRecentPage + 1)
                          );
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95 rounded-3xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-xl">Earnings by Platform</CardTitle>
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                This Month
              </span>
            </CardHeader>
            <CardContent className="space-y-6">
              <MonthlyPlatformDonut
                data={donutPlatforms}
                monthlyTotal={data.monthlyPlatformTotal}
              />

              <div className="w-full space-y-3">
                {chartPlatforms.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No platform data yet.
                  </p>
                ) : (
                  chartPlatforms.map((platform) => (
                    <div
                      key={platform.name}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`h-3 w-3 shrink-0 rounded-full border ${
                            isNearBlack(platform.colorHex)
                              ? "border-white/40 ring-1 ring-white/30"
                              : "border-border/70"
                          }`}
                          style={{ backgroundColor: platform.chartColorHex }}
                        />
                        <span className="text-muted-foreground truncate text-sm font-medium">
                          {platform.name}
                        </span>
                      </div>
                      <span className="text-foreground shrink-0 text-sm font-bold">
                        ${platform.value.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

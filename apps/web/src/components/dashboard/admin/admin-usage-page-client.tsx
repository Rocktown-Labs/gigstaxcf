import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  DollarSign,
  Layers3,
  RefreshCw,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type UsageMeterKey = "ai_extract_credits" | "bulk_upload_batches";
type UsageStatus = "blocked" | "failed" | "success";

interface UsageOverview {
  activeUsers: number;
  blockedEvents: number;
  failedEvents: number;
  successEvents: number;
  totalCostUsd: number;
  totalEvents: number;
  totalTokens: number;
  totalUnits: number;
}

interface UsageSummaryRow {
  estimatedCostUsd: number;
  meterKey: UsageMeterKey;
  status: UsageStatus;
  totalEvents: number;
  totalTokens: number;
  totalUnits: number;
}

interface UsageTopUserRow {
  blockedEvents: number;
  email: string;
  failedEvents: number;
  name: string;
  successEvents: number;
  totalCostUsd: number;
  totalEvents: number;
  totalTokens: number;
  totalUnits: number;
  userId: number;
}

interface UsageDailyTotalRow {
  blockedEvents: number;
  day: string;
  failedEvents: number;
  successEvents: number;
  totalCostUsd: number;
  totalEvents: number;
  totalTokens: number;
  totalUnits: number;
}

interface UsageByDayRow {
  day: string;
  meterKey: UsageMeterKey;
  totalCostUsd: number;
  totalEvents: number;
  totalUnits: number;
}

interface UsageEndpointRow {
  blockedEvents: number;
  endpoint: string;
  failedEvents: number;
  feature: string;
  successEvents: number;
  totalCostUsd: number;
  totalEvents: number;
  totalUnits: number;
}

interface UsageSummaryResponse {
  dailyTotals: UsageDailyTotalRow[];
  endpointSummary: UsageEndpointRow[];
  overview: UsageOverview;
  periodStart: string;
  summary: UsageSummaryRow[];
  topUsers: UsageTopUserRow[];
  usageByDay: UsageByDayRow[];
}

type RiskTone = "critical" | "healthy" | "watch";

const WINDOW_OPTIONS = [
  { label: "Last 7 Days", value: "7" },
  { label: "Last 30 Days", value: "30" },
  { label: "Last 90 Days", value: "90" },
  { label: "Last 180 Days", value: "180" },
] as const;

const EMPTY_OVERVIEW: UsageOverview = {
  activeUsers: 0,
  blockedEvents: 0,
  failedEvents: 0,
  successEvents: 0,
  totalCostUsd: 0,
  totalEvents: 0,
  totalTokens: 0,
  totalUnits: 0,
};
const EMPTY_DAILY_TOTALS: UsageDailyTotalRow[] = [];
const EMPTY_ENDPOINT_SUMMARY: UsageEndpointRow[] = [];
const EMPTY_SUMMARY_ROWS: UsageSummaryRow[] = [];
const EMPTY_TOP_USERS: UsageTopUserRow[] = [];
const EMPTY_USAGE_BY_DAY: UsageByDayRow[] = [];

const METER_LABELS: Record<UsageMeterKey, string> = {
  ai_extract_credits: "AI Extract Credits",
  bulk_upload_batches: "Bulk Upload Batches",
};

const STATUS_LABELS: Record<UsageStatus, string> = {
  blocked: "Blocked",
  failed: "Failed",
  success: "Success",
};

const integerFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: "currency",
});

const throughputChartConfig = {
  totalCostUsd: {
    color: "#38bdf8",
    label: "Cost (USD)",
  },
  totalUnits: {
    color: "#22c55e",
    label: "Units",
  },
} satisfies ChartConfig;

const statusChartConfig = {
  blockedEvents: {
    color: "#f43f5e",
    label: "Blocked",
  },
  failedEvents: {
    color: "#f59e0b",
    label: "Failed",
  },
  successEvents: {
    color: "#22c55e",
    label: "Success",
  },
} satisfies ChartConfig;

const meterChartConfig = {
  aiUnits: {
    color: "#22c55e",
    label: "AI Extract Credits",
  },
  bulkUnits: {
    color: "#a78bfa",
    label: "Bulk Upload Batches",
  },
} satisfies ChartConfig;

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeRatio = (numerator: number, denominator: number) => {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatDayLabel = (day: string) =>
  new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatInteger = (value: number) => integerFormatter.format(value);
const formatCompact = (value: number) => compactFormatter.format(value);

const getRiskTone = (
  value: number,
  thresholds: { critical: number; watch: number }
): RiskTone => {
  if (value >= thresholds.critical) {
    return "critical";
  }

  if (value >= thresholds.watch) {
    return "watch";
  }

  return "healthy";
};

const getRiskToneStyles = (tone: RiskTone) => {
  if (tone === "critical") {
    return "border-rose-500/35 bg-rose-500/10 text-rose-300";
  }

  if (tone === "watch") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-300";
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
};

const normalizePayload = (payload: unknown): UsageSummaryResponse => {
  const raw = (payload ?? {}) as {
    dailyTotals?: Record<string, unknown>[];
    endpointSummary?: Record<string, unknown>[];
    overview?: Record<string, unknown>;
    periodStart?: string;
    summary?: Record<string, unknown>[];
    topUsers?: Record<string, unknown>[];
    usageByDay?: Record<string, unknown>[];
  };

  const rawOverview = raw.overview ?? {};
  const overview: UsageOverview = {
    activeUsers: toNumber(rawOverview.activeUsers as number | string),
    blockedEvents: toNumber(rawOverview.blockedEvents as number | string),
    failedEvents: toNumber(rawOverview.failedEvents as number | string),
    successEvents: toNumber(rawOverview.successEvents as number | string),
    totalCostUsd: toNumber(rawOverview.totalCostUsd as number | string),
    totalEvents: toNumber(rawOverview.totalEvents as number | string),
    totalTokens: toNumber(rawOverview.totalTokens as number | string),
    totalUnits: toNumber(rawOverview.totalUnits as number | string),
  };

  return {
    dailyTotals: (raw.dailyTotals ?? []).map((row) => ({
      blockedEvents: toNumber(row.blockedEvents as number | string),
      day: String(row.day ?? ""),
      failedEvents: toNumber(row.failedEvents as number | string),
      successEvents: toNumber(row.successEvents as number | string),
      totalCostUsd: toNumber(row.totalCostUsd as number | string),
      totalEvents: toNumber(row.totalEvents as number | string),
      totalTokens: toNumber(row.totalTokens as number | string),
      totalUnits: toNumber(row.totalUnits as number | string),
    })),
    endpointSummary: (raw.endpointSummary ?? []).map((row) => ({
      blockedEvents: toNumber(row.blockedEvents as number | string),
      endpoint: String(row.endpoint ?? ""),
      failedEvents: toNumber(row.failedEvents as number | string),
      feature: String(row.feature ?? ""),
      successEvents: toNumber(row.successEvents as number | string),
      totalCostUsd: toNumber(row.totalCostUsd as number | string),
      totalEvents: toNumber(row.totalEvents as number | string),
      totalUnits: toNumber(row.totalUnits as number | string),
    })),
    overview,
    periodStart: String(raw.periodStart ?? ""),
    summary: (raw.summary ?? []).map((row) => ({
      estimatedCostUsd: toNumber(row.estimatedCostUsd as number | string),
      meterKey: String(row.meterKey ?? "ai_extract_credits") as UsageMeterKey,
      status: String(row.status ?? "success") as UsageStatus,
      totalEvents: toNumber(row.totalEvents as number | string),
      totalTokens: toNumber(row.totalTokens as number | string),
      totalUnits: toNumber(row.totalUnits as number | string),
    })),
    topUsers: (raw.topUsers ?? []).map((row) => ({
      blockedEvents: toNumber(row.blockedEvents as number | string),
      email: String(row.email ?? ""),
      failedEvents: toNumber(row.failedEvents as number | string),
      name: String(row.name ?? "Unknown"),
      successEvents: toNumber(row.successEvents as number | string),
      totalCostUsd: toNumber(row.totalCostUsd as number | string),
      totalEvents: toNumber(row.totalEvents as number | string),
      totalTokens: toNumber(row.totalTokens as number | string),
      totalUnits: toNumber(row.totalUnits as number | string),
      userId: toNumber(row.userId as number | string),
    })),
    usageByDay: (raw.usageByDay ?? []).map((row) => ({
      day: String(row.day ?? ""),
      meterKey: String(row.meterKey ?? "ai_extract_credits") as UsageMeterKey,
      totalCostUsd: toNumber(row.totalCostUsd as number | string),
      totalEvents: toNumber(row.totalEvents as number | string),
      totalUnits: toNumber(row.totalUnits as number | string),
    })),
  };
};

function UsageKpiCard({
  helper,
  icon,
  label,
  value,
}: {
  helper: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 from-card via-card to-card/70 rounded-2xl bg-gradient-to-br">
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
          <span>{label}</span>
          <span className="text-muted-foreground/80">{icon}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{helper}</p>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ tone }: { tone: RiskTone }) {
  let label = "Action";
  if (tone === "healthy") {
    label = "Healthy";
  } else if (tone === "watch") {
    label = "Watch";
  }

  return (
    <Badge variant="outline" className={cn(getRiskToneStyles(tone))}>
      {label}
    </Badge>
  );
}

export function AdminUsagePageClient() {
  const [windowDays, setWindowDays] = useState<string>("30");
  const days = Number.parseInt(windowDays, 10) || 30;

  const usageQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch(`/api/admin/usage/summary?days=${days}`);
      if (!response.ok) {
        throw new Error("Failed to load usage analytics");
      }

      return normalizePayload(await response.json());
    },
    queryKey: ["admin-usage-summary", days],
  });

  const usage = usageQuery.data;

  const overview = usage?.overview ?? EMPTY_OVERVIEW;
  const dailyTotals = usage?.dailyTotals ?? EMPTY_DAILY_TOTALS;
  const summaryRows = usage?.summary ?? EMPTY_SUMMARY_ROWS;
  const topUsers = usage?.topUsers ?? EMPTY_TOP_USERS;
  const endpointSummary = usage?.endpointSummary ?? EMPTY_ENDPOINT_SUMMARY;
  const usageByDay = usage?.usageByDay ?? EMPTY_USAGE_BY_DAY;

  const dailyTrend = useMemo(
    () =>
      dailyTotals.map((row) => ({
        ...row,
        label: formatDayLabel(row.day),
      })),
    [dailyTotals]
  );

  const meterTrend = useMemo(() => {
    const rowsByDay = new Map<
      string,
      {
        aiUnits: number;
        bulkUnits: number;
        day: string;
        label: string;
      }
    >();

    for (const row of usageByDay) {
      const current = rowsByDay.get(row.day) ?? {
        aiUnits: 0,
        bulkUnits: 0,
        day: row.day,
        label: formatDayLabel(row.day),
      };

      if (row.meterKey === "ai_extract_credits") {
        current.aiUnits += row.totalUnits;
      } else {
        current.bulkUnits += row.totalUnits;
      }

      rowsByDay.set(row.day, current);
    }

    return [...rowsByDay.values()].sort((left, right) =>
      left.day.localeCompare(right.day)
    );
  }, [usageByDay]);

  const endpointWatchRows = useMemo(
    () =>
      endpointSummary
        .map((row) => ({
          ...row,
          riskRate: safeRatio(
            row.blockedEvents + row.failedEvents,
            row.totalEvents
          ),
        }))
        .sort((left, right) => {
          if (right.riskRate === left.riskRate) {
            return right.totalEvents - left.totalEvents;
          }

          return right.riskRate - left.riskRate;
        })
        .slice(0, 12),
    [endpointSummary]
  );

  const sortedSummaryRows = useMemo(
    () =>
      [...summaryRows].sort(
        (left, right) => right.estimatedCostUsd - left.estimatedCostUsd
      ),
    [summaryRows]
  );

  const successRate = safeRatio(overview.successEvents, overview.totalEvents);
  const failureRate = safeRatio(overview.failedEvents, overview.totalEvents);
  const blockedRate = safeRatio(overview.blockedEvents, overview.totalEvents);
  const topUserShare = safeRatio(
    topUsers[0]?.totalUnits ?? 0,
    overview.totalUnits
  );
  const averageDailyCost =
    dailyTotals.length > 0 ? overview.totalCostUsd / dailyTotals.length : 0;
  const costSpikeDays = dailyTotals.filter(
    (row) => row.totalCostUsd > averageDailyCost * 2 && row.totalCostUsd > 0
  ).length;
  const quotaPressureUsers = topUsers.filter(
    (row) => row.blockedEvents > 0
  ).length;
  const unreliableEndpoints = endpointSummary.filter((row) => {
    const riskRate = safeRatio(
      row.failedEvents + row.blockedEvents,
      row.totalEvents
    );
    return riskRate >= 0.2;
  }).length;

  const riskSignals = [
    {
      detail: `${formatInteger(overview.blockedEvents)} blocked events`,
      label: "Blocked request pressure",
      tone: getRiskTone(blockedRate, { critical: 0.1, watch: 0.03 }),
      value: formatPercent(blockedRate),
    },
    {
      detail: `${formatInteger(overview.failedEvents)} failed events`,
      label: "Failure rate",
      tone: getRiskTone(failureRate, { critical: 0.08, watch: 0.02 }),
      value: formatPercent(failureRate),
    },
    {
      detail: "Largest single-user share of units",
      label: "Top user concentration",
      tone: getRiskTone(topUserShare, { critical: 0.6, watch: 0.35 }),
      value: formatPercent(topUserShare),
    },
    {
      detail: "Days above 2x average cost",
      label: "Cost spikes",
      tone: getRiskTone(costSpikeDays, { critical: 4, watch: 2 }),
      value: `${costSpikeDays}`,
    },
    {
      detail: "Users repeatedly hitting limits",
      label: "Quota pressure users",
      tone: getRiskTone(quotaPressureUsers, { critical: 6, watch: 3 }),
      value: `${quotaPressureUsers}`,
    },
    {
      detail: "Endpoints with >=20% risk events",
      label: "Unreliable endpoints",
      tone: getRiskTone(unreliableEndpoints, { critical: 6, watch: 3 }),
      value: `${unreliableEndpoints}`,
    },
  ];

  const periodStartLabel =
    usage?.periodStart && usage.periodStart.length > 0
      ? new Date(usage.periodStart).toLocaleDateString()
      : "n/a";

  return (
    <div className="space-y-6">
      <div className="border-border/60 bg-card/70 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Usage Monitoring
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor meter volume, AI cost, endpoint health, and user-level quota
            pressure across the full app.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Data window starts: {periodStartLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger className="w-[150px] rounded-xl">
              <SelectValue placeholder="Window" />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={usageQuery.isFetching}
            onClick={() => {
              usageQuery.refetch();
            }}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                usageQuery.isFetching ? "animate-spin" : ""
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      {usageQuery.isLoading ? (
        <Card className="border-border/60 rounded-2xl">
          <CardContent className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading usage analytics...
          </CardContent>
        </Card>
      ) : null}

      {usageQuery.isError ? (
        <Card className="border-destructive/40 rounded-2xl">
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-destructive text-sm">
              Failed to load usage analytics. Try refreshing the dashboard.
            </p>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                usageQuery.refetch();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!usageQuery.isLoading && !usageQuery.isError ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <UsageKpiCard
              label="Total Events"
              value={formatInteger(overview.totalEvents)}
              helper={`${formatInteger(overview.successEvents)} successful requests`}
              icon={<Activity className="h-4 w-4" />}
            />
            <UsageKpiCard
              label="Billable Units"
              value={formatInteger(overview.totalUnits)}
              helper={`${formatCompact(overview.totalTokens)} tokens processed`}
              icon={<Layers3 className="h-4 w-4" />}
            />
            <UsageKpiCard
              label="Estimated Cost"
              value={formatCurrency(overview.totalCostUsd)}
              helper={`${formatCurrency(averageDailyCost)} avg daily run-rate`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <UsageKpiCard
              label="Active Users"
              value={formatInteger(overview.activeUsers)}
              helper={`${formatInteger(topUsers.length)} users generated tracked events`}
              icon={<Users className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border-border/60 rounded-2xl xl:col-span-2">
              <CardHeader>
                <CardTitle>Daily Throughput + Cost</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyTrend.length > 0 ? (
                  <ChartContainer
                    config={throughputChartConfig}
                    className="h-[320px] w-full"
                  >
                    <ComposedChart
                      accessibilityLayer
                      data={dailyTrend}
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        minTickGap={24}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="units"
                        allowDecimals={false}
                        tickFormatter={(value) => formatCompact(Number(value))}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="cost"
                        orientation="right"
                        tickFormatter={(value) =>
                          `$${Number(value).toFixed(2)}`
                        }
                        tickLine={false}
                        axisLine={false}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            formatter={(value, name) => {
                              const numericValue = Number(value);
                              if (name === "Cost (USD)") {
                                return (
                                  <span className="font-medium">
                                    Cost: {formatCurrency(numericValue)}
                                  </span>
                                );
                              }

                              return (
                                <span className="font-medium">
                                  Units: {formatInteger(numericValue)}
                                </span>
                              );
                            }}
                          />
                        }
                      />
                      <Area
                        yAxisId="units"
                        dataKey="totalUnits"
                        type="monotone"
                        fill="var(--color-totalUnits)"
                        fillOpacity={0.18}
                        stroke="var(--color-totalUnits)"
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="cost"
                        dataKey="totalCostUsd"
                        type="monotone"
                        dot={false}
                        stroke="var(--color-totalCostUsd)"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No usage recorded for this window.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 rounded-2xl">
              <CardHeader>
                <CardTitle>Operational Risk Signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskSignals.map((signal) => (
                  <div
                    key={signal.label}
                    className="border-border/60 bg-background/40 rounded-xl border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{signal.label}</p>
                      <RiskBadge tone={signal.tone} />
                    </div>
                    <p className="mt-1 text-lg font-semibold">{signal.value}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {signal.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/60 rounded-2xl">
              <CardHeader>
                <CardTitle>Status Health by Day</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyTrend.length > 0 ? (
                  <ChartContainer
                    config={statusChartConfig}
                    className="h-[300px] w-full"
                  >
                    <AreaChart
                      accessibilityLayer
                      data={dailyTrend}
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        minTickGap={24}
                        tickLine={false}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            formatter={(value, name) => (
                              <span className="font-medium">
                                {name}: {formatInteger(Number(value))}
                              </span>
                            )}
                          />
                        }
                      />
                      <Area
                        dataKey="successEvents"
                        stackId="events"
                        type="monotone"
                        fill="var(--color-successEvents)"
                        fillOpacity={0.15}
                        stroke="var(--color-successEvents)"
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="failedEvents"
                        stackId="events"
                        type="monotone"
                        fill="var(--color-failedEvents)"
                        fillOpacity={0.2}
                        stroke="var(--color-failedEvents)"
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="blockedEvents"
                        stackId="events"
                        type="monotone"
                        fill="var(--color-blockedEvents)"
                        fillOpacity={0.2}
                        stroke="var(--color-blockedEvents)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No status trend data for this window.
                  </p>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                    <p className="text-xs text-emerald-200">Success Rate</p>
                    <p className="text-lg font-semibold text-emerald-100">
                      {formatPercent(successRate)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-200">Failure Rate</p>
                    <p className="text-lg font-semibold text-amber-100">
                      {formatPercent(failureRate)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2">
                    <p className="text-xs text-rose-200">Blocked Rate</p>
                    <p className="text-lg font-semibold text-rose-100">
                      {formatPercent(blockedRate)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 rounded-2xl">
              <CardHeader>
                <CardTitle>Meter Mix by Day (Units)</CardTitle>
              </CardHeader>
              <CardContent>
                {meterTrend.length > 0 ? (
                  <ChartContainer
                    config={meterChartConfig}
                    className="h-[300px] w-full"
                  >
                    <BarChart
                      accessibilityLayer
                      data={meterTrend}
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        minTickGap={24}
                        tickLine={false}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            formatter={(value, name) => (
                              <span className="font-medium">
                                {name}: {formatInteger(Number(value))}
                              </span>
                            )}
                          />
                        }
                      />
                      <Bar
                        dataKey="aiUnits"
                        fill="var(--color-aiUnits)"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="bulkUnits"
                        fill="var(--color-bulkUnits)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No meter usage data for this window.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/60 rounded-2xl">
              <CardHeader>
                <CardTitle>Top Users by Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="min-w-[780px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Blocked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topUsers.slice(0, 12).map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell className="min-w-[220px]">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {row.email}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatInteger(row.totalEvents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatInteger(row.totalUnits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.totalCostUsd)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatInteger(row.failedEvents)} (
                          {formatPercent(
                            safeRatio(row.failedEvents, row.totalEvents)
                          )}
                          )
                        </TableCell>
                        <TableCell className="text-right">
                          {formatInteger(row.blockedEvents)} (
                          {formatPercent(
                            safeRatio(row.blockedEvents, row.totalEvents)
                          )}
                          )
                        </TableCell>
                      </TableRow>
                    ))}
                    {topUsers.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-muted-foreground text-center text-sm"
                        >
                          No user usage data found in this window.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-border/60 rounded-2xl">
              <CardHeader>
                <CardTitle>Endpoint Watchlist</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature / Endpoint</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Risk</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpointWatchRows.map((row) => {
                      const riskTone = getRiskTone(row.riskRate, {
                        critical: 0.25,
                        watch: 0.1,
                      });

                      return (
                        <TableRow key={`${row.feature}-${row.endpoint}`}>
                          <TableCell className="min-w-[250px]">
                            <p className="font-medium">{row.feature}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {row.endpoint}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatInteger(row.totalEvents)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatInteger(row.totalUnits)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-end gap-2">
                              <Badge
                                variant="outline"
                                className={cn(getRiskToneStyles(riskTone))}
                              >
                                {formatPercent(row.riskRate)}
                              </Badge>
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.totalCostUsd)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {endpointWatchRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-muted-foreground text-center text-sm"
                        >
                          No endpoint activity found in this window.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 rounded-2xl">
            <CardHeader>
              <CardTitle>Meter + Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Meter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSummaryRows.map((row) => (
                    <TableRow key={`${row.meterKey}-${row.status}`}>
                      <TableCell className="font-medium">
                        {METER_LABELS[row.meterKey]}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatInteger(row.totalEvents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatInteger(row.totalUnits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCompact(row.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.estimatedCostUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sortedSummaryRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-muted-foreground text-center text-sm"
                      >
                        No meter summary data found in this window.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      {!usageQuery.isLoading &&
      !usageQuery.isError &&
      overview.totalEvents === 0 ? (
        <Card className="border-border/60 rounded-2xl border-dashed">
          <CardContent className="text-muted-foreground flex items-center gap-3 py-6 text-sm">
            <Ban className="h-4 w-4" />
            No usage events found for this timeframe. Increase the window or
            verify event ingestion from AI and bulk endpoints.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

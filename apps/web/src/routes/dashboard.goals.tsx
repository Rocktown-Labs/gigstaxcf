import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import * as z from "zod";

import {
  dashboardPageMainComfortableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MoneyInput } from "@/components/ui/numeric-inputs";
import { apiFetch } from "@/lib/api";
import {
  hasMaxFractionDigits,
  parseFiniteNumber,
  roundToFractionDigits,
} from "@/lib/numeric-policy";
import {
  getWeekStartDate,
  getWeekStartsOn,
  getWeekdayLabels,
} from "@/lib/week";

interface GoalRecord {
  id: number;
  period_end_date?: string;
  period_start_date?: string;
  start_date?: string;
  target_amount?: string | number;
  weekly_target?: string | number;
}

interface EntryRecord {
  id?: number | string;
  bonusAmount?: number | string | null;
  bonus_amount?: number | string | null;
  fareAmount?: number | string | null;
  fare_amount?: number | string | null;
  occurredAt?: string | null;
  occurred_at?: string | null;
  platformSlug?: string | null;
  platform_slug?: string | null;
  tipEstimatedAmount?: number | string | null;
  tipFinalAmount?: number | string | null;
  tipStatus?: string | null;
  tip_estimated_amount?: number | string | null;
  tip_final_amount?: number | string | null;
  tip_status?: string | null;
  totalEstimatedAmount?: number | string | null;
  totalFinalAmount?: number | string | null;
  total_estimated_amount?: number | string | null;
  total_final_amount?: number | string | null;
}

interface ExpenseRecord {
  amount: number | string;
  incurredAt?: string | null;
  incurred_at?: string | null;
}

interface GoalsDashboardData {
  entries: EntryRecord[];
  expenses: ExpenseRecord[];
  goals: GoalRecord[];
  weekStartsOn: "monday" | "sunday";
}

const EMPTY_ENTRIES: EntryRecord[] = [];
const EMPTY_EXPENSES: ExpenseRecord[] = [];
const EMPTY_GOALS: GoalRecord[] = [];

const dayOrdersChartConfig = {
  basePay: {
    color: "hsl(var(--chart-2))",
    label: "Base Pay",
  },
  tip: {
    color: "hsl(var(--chart-1))",
    label: "Tip",
  },
} satisfies ChartConfig;

const goalFormSchema = z.object({
  weeklyTarget: z
    .string()
    .min(1, { message: "Weekly target is required" })
    .refine(
      (value) => {
        const parsed = parseFiniteNumber(value);
        return parsed !== null && parsed > 0 && hasMaxFractionDigits(parsed, 2);
      },
      { message: "Must be a valid positive amount with up to 2 decimals" }
    ),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

const pad2 = (value: number) => value.toString().padStart(2, "0");

const toLocalDateKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toLocalDateKey = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toLocalDateKeyFromDate(parsed);
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const getEntryValue = (
  entry: EntryRecord,
  camel: keyof EntryRecord,
  snake: keyof EntryRecord
) => entry[camel] ?? entry[snake];

const getEffectiveTip = (entry: EntryRecord) => {
  const tipStatus = getEntryValue(entry, "tipStatus", "tip_status");
  const tipFinal = getEntryValue(entry, "tipFinalAmount", "tip_final_amount");
  const tipEstimated = getEntryValue(
    entry,
    "tipEstimatedAmount",
    "tip_estimated_amount"
  );
  const finalTip = toNumber(tipFinal);
  const estimatedTip = toNumber(tipEstimated);

  if (tipStatus === "final") {
    return finalTip;
  }

  if (tipStatus === "pending") {
    return estimatedTip;
  }

  if (finalTip > 0) {
    return finalTip;
  }

  if (estimatedTip > 0) {
    return estimatedTip;
  }

  return 0;
};

const getEffectiveTotal = (entry: EntryRecord) => {
  const totalFinal = getEntryValue(
    entry,
    "totalFinalAmount",
    "total_final_amount"
  );
  const totalEstimated = getEntryValue(
    entry,
    "totalEstimatedAmount",
    "total_estimated_amount"
  );
  const fare = getEntryValue(entry, "fareAmount", "fare_amount");
  const bonus = getEntryValue(entry, "bonusAmount", "bonus_amount");
  const componentTotal =
    toNumber(fare) + toNumber(bonus) + getEffectiveTip(entry);

  if (totalFinal !== null && totalFinal !== undefined) {
    const finalAmount = toNumber(totalFinal);
    if (finalAmount > 0 || componentTotal === 0) {
      return finalAmount;
    }
  }

  if (totalEstimated !== null && totalEstimated !== undefined) {
    const estimatedAmount = toNumber(totalEstimated);
    if (estimatedAmount > 0 || componentTotal === 0) {
      return estimatedAmount;
    }
  }

  return componentTotal;
};

// Captured once per page load so week boundaries stay stable across re-renders
// without calling impure `new Date()` during render.
const SESSION_TODAY = new Date();

const buildMonthGrid = (cursor: Date, weekStartsOn: "monday" | "sunday") => {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const gridStart = getWeekStartDate(monthStart, weekStartsOn);
  const gridEnd = addDays(getWeekStartDate(monthEnd, weekStartsOn), 6);

  const days: Date[] = [];
  for (let day = new Date(gridStart); day <= gridEnd; day = addDays(day, 1)) {
    days.push(new Date(day));
  }

  return { days, monthEnd, monthStart };
};

export const Route = createFileRoute("/dashboard/goals")({
  component: GoalsPage,
  head: () => ({
    meta: [{ title: "Weekly Earnings Goal" }],
  }),
});

function GoalsPage() {
  const queryClient = useQueryClient();
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [submitError, setSubmitError] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);

  const form = useForm<GoalFormValues>({
    defaultValues: {
      weeklyTarget: "",
    },
    resolver: zodResolver(goalFormSchema),
  });

  const { data, isLoading } = useQuery<GoalsDashboardData>({
    queryFn: async () => {
      const [goalsResponse, entriesResponse, expensesResponse] =
        await Promise.all([
          apiFetch("/api/goals"),
          apiFetch("/api/entries"),
          apiFetch("/api/expenses"),
        ]);

      if (!goalsResponse.ok || !entriesResponse.ok || !expensesResponse.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const [goalsData, entriesData, expensesData] = await Promise.all([
        goalsResponse.json(),
        entriesResponse.json(),
        expensesResponse.json(),
      ]);

      return {
        entries: (entriesData.entries ||
          entriesData.deliveries ||
          []) as EntryRecord[],
        expenses: (expensesData.expenses || []) as ExpenseRecord[],
        goals: (goalsData.goals || []) as GoalRecord[],
        weekStartsOn: getWeekStartsOn(goalsData.weekStartsOn, "sunday"),
      };
    },
    queryKey: ["goals-dashboard"],
    staleTime: 0,
  });

  const { mutateAsync: saveGoal, isPending: savingGoal } = useMutation({
    mutationFn: async (weeklyTarget: number) => {
      const response = await apiFetch("/api/goals", {
        body: JSON.stringify({ weeklyTarget }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save weekly goal");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals-dashboard"] });
    },
  });

  const entries = data?.entries ?? EMPTY_ENTRIES;
  const expenses = data?.expenses ?? EMPTY_EXPENSES;
  const goals = data?.goals ?? EMPTY_GOALS;
  const weekStartsOn = data?.weekStartsOn ?? "sunday";
  const weekdayLabels = useMemo(
    () => getWeekdayLabels(weekStartsOn),
    [weekStartsOn]
  );

  const currentWeekStart = useMemo(
    () => getWeekStartDate(SESSION_TODAY, weekStartsOn),
    [weekStartsOn]
  );
  const currentWeekEnd = useMemo(
    () => addDays(currentWeekStart, 6),
    [currentWeekStart]
  );
  const currentWeekStartKey = useMemo(
    () => toLocalDateKeyFromDate(currentWeekStart),
    [currentWeekStart]
  );

  const activeGoal = useMemo(
    () =>
      goals.find((goal) => {
        const startDate =
          goal.period_start_date || goal.start_date || goal.period_end_date;
        return toLocalDateKey(startDate) === currentWeekStartKey;
      }) || null,
    [currentWeekStartKey, goals]
  );

  const activeTarget = useMemo(
    () => toNumber(activeGoal?.weekly_target ?? activeGoal?.target_amount ?? 0),
    [activeGoal]
  );

  useEffect(() => {
    if (!isLoading) {
      form.reset({
        weeklyTarget: activeTarget > 0 ? activeTarget.toFixed(2) : "",
      });
    }
  }, [activeTarget, form, isLoading]);

  const dailyGross = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of entries) {
      const dateKey = toLocalDateKey(entry.occurredAt || entry.occurred_at);
      if (!dateKey) {
        continue;
      }

      map.set(dateKey, (map.get(dateKey) || 0) + getEffectiveTotal(entry));
    }

    return map;
  }, [entries]);

  const dailyExpenses = useMemo(() => {
    const map = new Map<string, number>();

    for (const expense of expenses) {
      const dateKey = toLocalDateKey(expense.incurredAt || expense.incurred_at);
      if (!dateKey) {
        continue;
      }

      map.set(dateKey, (map.get(dateKey) || 0) + toNumber(expense.amount));
    }

    return map;
  }, [expenses]);

  const weekDateKeys = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        toLocalDateKeyFromDate(addDays(currentWeekStart, index))
      ),
    [currentWeekStart]
  );

  const weeklyGross = useMemo(
    () =>
      weekDateKeys.reduce((sum, key) => sum + (dailyGross.get(key) || 0), 0),
    [dailyGross, weekDateKeys]
  );

  const weeklyExpenseTotal = useMemo(
    () =>
      weekDateKeys.reduce((sum, key) => sum + (dailyExpenses.get(key) || 0), 0),
    [dailyExpenses, weekDateKeys]
  );

  const weeklyNet = weeklyGross - weeklyExpenseTotal;
  const weeklyProgress =
    activeTarget > 0 ? (weeklyGross / activeTarget) * 100 : 0;

  const { days: monthDays, monthStart } = useMemo(
    () => buildMonthGrid(monthCursor, weekStartsOn),
    [monthCursor, weekStartsOn]
  );

  const todayKey = toLocalDateKeyFromDate(SESSION_TODAY);
  const monthLabel = monthCursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const weekLabel = `${currentWeekStart.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  })} - ${currentWeekEnd.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const selectedDateLabel = selectedDateKey
    ? new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        weekday: "long",
        year: "numeric",
      })
    : "";

  const selectedDayOrders = useMemo(() => {
    if (!selectedDateKey) {
      return [];
    }

    return entries
      .filter(
        (entry) =>
          toLocalDateKey(entry.occurredAt || entry.occurred_at) ===
          selectedDateKey
      )
      .map((entry, index) => {
        const fare = toNumber(
          getEntryValue(entry, "fareAmount", "fare_amount")
        );
        const bonus = toNumber(
          getEntryValue(entry, "bonusAmount", "bonus_amount")
        );
        const tip = getEffectiveTip(entry);
        const total = getEffectiveTotal(entry);
        const platform =
          (getEntryValue(entry, "platformSlug", "platform_slug") as
            | string
            | null) || "other";

        return {
          basePay: fare + bonus,
          id: entry.id || `${selectedDateKey}-${index}`,
          label: `Order ${index + 1}`,
          platform: platform
            .replaceAll("_", " ")
            .replaceAll(/\b\w/gu, (char) => char.toUpperCase()),
          tip,
          total,
        };
      });
  }, [entries, selectedDateKey]);

  const onSubmit = async (values: GoalFormValues) => {
    setSubmitError("");

    const parsed = parseFiniteNumber(values.weeklyTarget);
    if (parsed === null) {
      throw new TypeError("Weekly target is invalid");
    }

    try {
      await saveGoal(roundToFractionDigits(parsed, 2));
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to update weekly goal"
      );
    }
  };

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainComfortableClass} space-y-8`}>
        <Card className="border-border/50 bg-card/80 rounded-2xl shadow-lg backdrop-blur-md">
          <CardHeader className="border-border/50 space-y-2 border-b pb-6">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Weekly Earnings Goal
            </CardTitle>
            <CardDescription className="text-muted-foreground text-base">
              Goal periods are automatic and run from{" "}
              {weekStartsOn === "monday"
                ? "Monday through Sunday"
                : "Sunday through Saturday"}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="text-muted-foreground text-sm">
              Active week:{" "}
              <span className="text-foreground font-semibold">{weekLabel}</span>
            </div>

            <div className="flex flex-nowrap gap-4 overflow-x-auto pb-1">
              <div className="border-border/50 bg-background/50 min-w-[220px] flex-1 rounded-xl border p-4">
                <p className="text-muted-foreground text-xs tracking-wider uppercase">
                  Gross
                </p>
                <p className="mt-1 text-2xl font-bold">
                  ${weeklyGross.toFixed(2)}
                </p>
              </div>
              <div className="border-border/50 bg-background/50 min-w-[220px] flex-1 rounded-xl border p-4">
                <p className="text-muted-foreground text-xs tracking-wider uppercase">
                  Expenses
                </p>
                <p className="text-destructive mt-1 text-2xl font-bold">
                  -${weeklyExpenseTotal.toFixed(2)}
                </p>
              </div>
              <div className="border-border/50 bg-background/50 min-w-[220px] flex-1 rounded-xl border p-4">
                <p className="text-muted-foreground text-xs tracking-wider uppercase">
                  Net
                </p>
                <p className="mt-1 text-2xl font-bold">
                  ${weeklyNet.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">
                  Goal Progress
                </span>
                <span className="text-foreground font-semibold">
                  ${weeklyGross.toFixed(2)} / ${activeTarget.toFixed(2)}
                </span>
              </div>
              <div className="bg-muted/50 h-3 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${Math.min(weeklyProgress, 100)}%` }}
                />
              </div>
              <p className="text-muted-foreground text-right text-xs">
                {activeTarget > 0
                  ? `${weeklyProgress.toFixed(1)}%`
                  : "Set a weekly target to track progress"}
              </p>
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-2"
              >
                <FormField
                  control={form.control}
                  name="weeklyTarget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/90 font-semibold">
                        Weekly Gross Target (USD)
                      </FormLabel>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <FormControl>
                            <MoneyInput
                              placeholder="e.g. 900.00"
                              className="border-border/50 bg-background/50 focus-visible:ring-primary h-12 w-full rounded-xl"
                              value={field.value}
                              onValueChange={(value) => field.onChange(value)}
                              onBlur={() => field.onBlur()}
                            />
                          </FormControl>
                        </div>
                        <Button
                          type="submit"
                          className="h-12 rounded-xl px-8 font-semibold"
                          disabled={savingGoal}
                        >
                          {savingGoal ? "Saving..." : "Update Goal"}
                        </Button>
                      </div>
                      <FormDescription className="text-muted-foreground text-xs">
                        Up to 2 decimals. Auto-rounded when you leave the field.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {submitError ? (
              <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
                {submitError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/80 rounded-2xl shadow-lg backdrop-blur-md">
          <CardHeader className="border-border/50 space-y-3 border-b pb-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-bold tracking-tight">
                Month Calendar
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    setMonthCursor(
                      new Date(
                        monthCursor.getFullYear(),
                        monthCursor.getMonth() - 1,
                        1
                      )
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    setMonthCursor(
                      new Date(
                        monthCursor.getFullYear(),
                        monthCursor.getMonth() + 1,
                        1
                      )
                    )
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription className="text-muted-foreground text-base">
              {monthLabel} with daily gross and expense logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="min-w-[680px]">
                <div className="text-muted-foreground mb-3 grid grid-cols-7 gap-2.5 text-center text-xs font-semibold tracking-wider uppercase">
                  {weekdayLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2.5">
                  {monthDays.map((date) => {
                    const dateKey = toLocalDateKeyFromDate(date);
                    const gross = dailyGross.get(dateKey) || 0;
                    const expense = dailyExpenses.get(dateKey) || 0;
                    const isCurrentMonth =
                      date.getMonth() === monthStart.getMonth();
                    const isToday = dateKey === todayKey;

                    return (
                      <button
                        type="button"
                        key={dateKey}
                        aria-label={`Show orders for ${dateKey}`}
                        className={`hover:bg-muted/40 min-h-28 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                          isCurrentMonth
                            ? "border-border/50 bg-background/50"
                            : "border-border/30 bg-muted/20 text-muted-foreground"
                        } ${isToday ? "ring-primary ring-1" : ""}`}
                        onClick={() => {
                          setSelectedDateKey(dateKey);
                          setIsDayDetailOpen(true);
                        }}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            {date.getDate()}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-emerald-500">
                            +${gross.toFixed(0)}
                          </p>
                          <p className="text-destructive font-medium">
                            -${expense.toFixed(0)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Orders for {selectedDateLabel}</DialogTitle>
              <DialogDescription>
                Delivery chart for the selected calendar date.
              </DialogDescription>
            </DialogHeader>

            {selectedDayOrders.length === 0 ? (
              <div className="border-border/50 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
                No delivery orders logged for this date.
              </div>
            ) : (
              <div className="space-y-6">
                <ChartContainer
                  config={dayOrdersChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart data={selectedDayOrders}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <span className="font-medium">
                              {name}: ${Number(value).toFixed(2)}
                            </span>
                          )}
                        />
                      }
                    />
                    <Bar
                      dataKey="basePay"
                      stackId="earnings"
                      fill="var(--color-basePay)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="tip"
                      stackId="earnings"
                      fill="var(--color-tip)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>

                <div className="space-y-3">
                  {selectedDayOrders.map((order) => (
                    <div
                      key={order.id}
                      className="border-border/50 bg-background/50 flex items-center justify-between rounded-xl border p-3"
                    >
                      <div>
                        <p className="font-semibold">{order.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {order.platform}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          Base: ${order.basePay.toFixed(2)} | Tip: $
                          {order.tip.toFixed(2)}
                        </p>
                        <p className="font-bold">${order.total.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

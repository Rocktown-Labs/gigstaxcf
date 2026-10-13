import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpDown,
  CalendarDays,
  ExternalLink,
  Filter,
  Fuel,
  Layers,
  Plus,
  Receipt,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  dashboardPageMainWideClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { ExpenseBulkManager } from "@/components/dashboard/expense-bulk-manager";
import { ExpenseForm } from "@/components/dashboard/expense-form";
import { ResponsiveDataCards } from "@/components/dashboard/responsive-data-cards";
import { ResponsiveDataCardsSkeleton } from "@/components/dashboard/responsive-data-cards-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Expense {
  amount: number;
  category: string;
  id: string;
  incurred_at: string;
  merchant?: string | null;
  notes: string | null;
  primary_media_url?: string | null;
  primaryMediaUrl?: string | null;
}

interface ExpensesListResponse {
  expenses?: Expense[];
  pagination?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary?: {
    fuelExpenses: number;
    totalExpenses: number;
    totalItems: number;
  };
}

interface ExpensesPageClientProps {
  aiEnabled: boolean;
  bulkEnabled: boolean;
  onSearchParamsChange: (updates: Record<string, string | null>) => void;
  page: number;
  categoryFilter: ExpenseCategoryFilter;
  sortBy: ExpenseSort;
}

type ExpenseSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
type ExpenseCategoryFilter =
  | "all"
  | "fuel"
  | "maintenance"
  | "tolls"
  | "parking"
  | "supplies"
  | "phone"
  | "other";

const EXPENSE_PAGE_SIZE = 10;
const CATEGORY_OPTIONS: { label: string; value: ExpenseCategoryFilter }[] = [
  { label: "All Categories", value: "all" },
  { label: "Fuel", value: "fuel" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Tolls", value: "tolls" },
  { label: "Parking", value: "parking" },
  { label: "Supplies", value: "supplies" },
  { label: "Phone", value: "phone" },
  { label: "Other", value: "other" },
];

function formatExpenseDate(incurredAt: string) {
  return new Date(incurredAt).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  });
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "fuel": {
      return <Fuel className="h-3.5 w-3.5" />;
    }
    case "maintenance": {
      return <Wrench className="h-3.5 w-3.5" />;
    }
    default: {
      return <Receipt className="h-3.5 w-3.5" />;
    }
  }
}

function getCategoryLabel(category: string) {
  const match = CATEGORY_OPTIONS.find((option) => option.value === category);
  if (match) {
    return match.label;
  }

  return category
    .replaceAll("_", " ")
    .replaceAll(/\b\w/gu, (value) => value.toUpperCase());
}

function getCategoryTone(category: string) {
  switch (category) {
    case "fuel": {
      return "border border-orange-500/20 bg-orange-500/10 text-orange-500";
    }
    case "maintenance": {
      return "border border-blue-500/20 bg-blue-500/10 text-blue-500";
    }
    case "tolls": {
      return "border border-violet-500/20 bg-violet-500/10 text-violet-400";
    }
    case "parking": {
      return "border border-sky-500/20 bg-sky-500/10 text-sky-400";
    }
    default: {
      return "border border-border bg-muted text-muted-foreground";
    }
  }
}

export function ExpensesPageClient({
  aiEnabled,
  bulkEnabled,
  onSearchParamsChange,
  page,
  categoryFilter,
  sortBy,
}: ExpensesPageClientProps) {
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      onSearchParamsChange(updates);
    },
    [onSearchParamsChange]
  );

  const expensesQuery = useQuery({
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(EXPENSE_PAGE_SIZE),
        sort: sortBy,
      });

      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }

      const response = await apiFetch(`/api/expenses?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch expenses");
      }

      return (await response.json()) as ExpensesListResponse;
    },
    queryKey: ["expenses", "expenses-list", page, categoryFilter, sortBy],
  });

  const expenses = expensesQuery.data?.expenses ?? [];
  const pagination = expensesQuery.data?.pagination ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    page,
    pageSize: EXPENSE_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  };
  const summary = expensesQuery.data?.summary ?? {
    fuelExpenses: 0,
    totalExpenses: 0,
    totalItems: 0,
  };

  useEffect(() => {
    if (pagination.page !== page) {
      updateSearchParams({ page: String(pagination.page) });
    }
  }, [page, pagination.page, updateSearchParams]);

  const handleExpenseSaved = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    setIsCreateOpen(false);
  }, [queryClient]);

  const handleBulkSaved = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
  }, [queryClient]);

  const startItem =
    pagination.totalItems === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainWideClass} space-y-6`}>
        <div>
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight">
            Expenses
          </h1>
          <p className="text-muted-foreground text-lg">
            Track your costs and focus on your expense overview.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
          <div className="border-border/50 bg-card flex min-w-0 flex-col justify-between rounded-2xl border p-2.5 shadow-sm sm:p-3 md:p-4">
            <div className="mb-1.5 flex items-center justify-between sm:mb-2">
              <span className="text-muted-foreground min-w-0 truncate text-[10px] font-semibold tracking-wide uppercase sm:text-xs">
                Total Expenses
              </span>
              <Receipt className="text-destructive/80 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div className="text-destructive truncate text-sm font-bold tracking-tight sm:text-lg md:text-2xl">
              ${summary.totalExpenses.toFixed(2)}
            </div>
          </div>

          <div className="border-border/50 bg-card flex min-w-0 flex-col justify-between rounded-2xl border p-2.5 shadow-sm sm:p-3 md:p-4">
            <div className="mb-1.5 flex items-center justify-between sm:mb-2">
              <span className="text-muted-foreground min-w-0 truncate text-[10px] font-semibold tracking-wide uppercase sm:text-xs">
                Fuel Costs
              </span>
              <Fuel className="h-3.5 w-3.5 text-orange-500/80 sm:h-4 sm:w-4" />
            </div>
            <div className="truncate text-sm font-bold tracking-tight sm:text-lg md:text-2xl">
              ${summary.fuelExpenses.toFixed(2)}
            </div>
          </div>

          <div className="border-border/50 bg-card flex min-w-0 flex-col justify-between rounded-2xl border p-2.5 shadow-sm sm:p-3 md:p-4">
            <div className="mb-1.5 flex items-center justify-between sm:mb-2">
              <span className="text-muted-foreground min-w-0 truncate text-[10px] font-semibold tracking-wide uppercase sm:text-xs">
                Logged Items
              </span>
              <Layers className="text-primary/80 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div className="truncate text-sm font-bold tracking-tight sm:text-lg md:text-2xl">
              {summary.totalItems}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 rounded-xl px-5 font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                Log Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-5xl">
              <DialogHeader className="sr-only">
                <DialogTitle>Log Expense</DialogTitle>
                <DialogDescription>
                  Upload a receipt or enter expense details manually.
                </DialogDescription>
              </DialogHeader>
              <ExpenseForm onSaved={handleExpenseSaved} aiEnabled={aiEnabled} />
            </DialogContent>
          </Dialog>

          {bulkEnabled ? (
            <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-11 rounded-xl px-5">
                  <Layers className="mr-2 h-4 w-4" />
                  Bulk Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Bulk Expense Uploads</DialogTitle>
                  <DialogDescription>
                    Queue receipt screenshots, review extracted drafts, and save
                    each expense card individually.
                  </DialogDescription>
                </DialogHeader>
                <ExpenseBulkManager onSaved={handleBulkSaved} />
              </DialogContent>
            </Dialog>
          ) : (
            <Button asChild variant="outline" className="h-11 rounded-xl px-5">
              <Link to="/dashboard/billing">
                <Layers className="mr-2 h-4 w-4" />
                Upgrade for Bulk Upload
              </Link>
            </Button>
          )}
        </div>

        <Card className="border-border bg-card/95 rounded-3xl shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl">Expense History</CardTitle>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Showing {startItem}-{endItem} of {pagination.totalItems}
                {expensesQuery.isFetching && !expensesQuery.isLoading
                  ? " • Updating..."
                  : ""}
              </p>
            </div>

            <div className="border-border/50 bg-card/30 flex flex-col items-center justify-between gap-3 rounded-2xl border p-3 sm:flex-row sm:p-4">
              <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                <Filter className="text-muted-foreground h-4 w-4 shrink-0" />
                <Select
                  value={categoryFilter}
                  onValueChange={(value) =>
                    updateSearchParams({
                      category: value === "all" ? null : value,
                      page: "1",
                    })
                  }
                >
                  <SelectTrigger className="bg-background/50 h-10 w-full rounded-lg sm:w-[220px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                <ArrowUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
                <Select
                  value={sortBy}
                  onValueChange={(value) =>
                    updateSearchParams({
                      page: "1",
                      sort: value === "date-desc" ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="bg-background/50 h-10 w-full rounded-lg sm:w-[220px]">
                    <SelectValue placeholder="Newest First" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest First</SelectItem>
                    <SelectItem value="date-asc">Oldest First</SelectItem>
                    <SelectItem value="amount-desc">Highest Amount</SelectItem>
                    <SelectItem value="amount-asc">Lowest Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {expensesQuery.isLoading && expenses.length === 0 ? (
              <>
                <ResponsiveDataCardsSkeleton className="xl:hidden" cards={3} />
                <div className="border-border/50 bg-card/30 hidden rounded-2xl border p-12 text-center xl:block">
                  <div className="border-primary/30 border-t-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4" />
                  <p className="text-muted-foreground font-medium">
                    Loading expense history...
                  </p>
                </div>
              </>
            ) : expenses.length === 0 ? (
              <div className="border-border/50 bg-card/30 rounded-2xl border-2 border-dashed p-16 text-center">
                <div className="mb-4 text-4xl opacity-50">💸</div>
                <h3 className="mb-2 text-xl font-bold">No Expenses Found</h3>
                <p className="text-muted-foreground">
                  Adjust your filters or log a new expense.
                </p>
                {summary.totalItems === 0 && categoryFilter === "all" ? (
                  <Button
                    variant="outline"
                    className="border-border/50 mt-6 rounded-xl font-semibold"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    Log Your First Expense
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <ResponsiveDataCards
                  className="xl:hidden"
                  items={expenses}
                  getKey={(expense) => expense.id}
                  renderCard={(expense) => {
                    const receiptUrl =
                      expense.primary_media_url || expense.primaryMediaUrl;
                    const hasReceipt = Boolean(receiptUrl);

                    return (
                      <article className="border-border/60 bg-card rounded-2xl border p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getCategoryTone(expense.category)}`}
                          >
                            {getCategoryIcon(expense.category)}
                            <span className="whitespace-nowrap">
                              {getCategoryLabel(expense.category)}
                            </span>
                          </span>
                          <p className="text-destructive text-right text-lg font-extrabold whitespace-nowrap">
                            -${Number(expense.amount).toFixed(2)}
                          </p>
                        </div>
                        <div className="text-muted-foreground space-y-2 text-sm">
                          <p className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatExpenseDate(expense.incurred_at)}
                          </p>
                          <p>
                            Merchant:{" "}
                            <span className="text-foreground font-semibold">
                              {expense.merchant || "--"}
                            </span>
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {hasReceipt ? (
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8"
                            >
                              <a
                                href={receiptUrl || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                View Receipt
                              </a>
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to="/dashboard/expenses/$id"
                              params={{ id: String(expense.id) }}
                            >
                              Open Expense
                            </Link>
                          </Button>
                        </div>
                      </article>
                    );
                  }}
                />

                <div className="border-border bg-card hidden overflow-x-auto rounded-2xl border xl:block">
                  <Table className="min-w-max table-auto">
                    <caption className="sr-only">Expense history table</caption>
                    <TableHeader className="bg-muted">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-11 min-w-[190px] px-3 font-semibold">
                          Category
                        </TableHead>
                        <TableHead className="h-11 min-w-[220px] px-3 font-semibold">
                          Incurred
                        </TableHead>
                        <TableHead className="h-11 min-w-[180px] px-3 font-semibold">
                          Merchant
                        </TableHead>
                        <TableHead className="h-11 min-w-[130px] px-3 text-right font-semibold">
                          Amount
                        </TableHead>
                        <TableHead className="h-11 min-w-[210px] px-3 text-right font-semibold">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((expense) => {
                        const receiptUrl =
                          expense.primary_media_url || expense.primaryMediaUrl;
                        const hasReceipt = Boolean(receiptUrl);

                        return (
                          <TableRow
                            key={expense.id}
                            className="border-border hover:bg-muted/40"
                          >
                            <TableCell className="px-3 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getCategoryTone(expense.category)}`}
                              >
                                {getCategoryIcon(expense.category)}
                                <span className="whitespace-nowrap">
                                  {getCategoryLabel(expense.category)}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground px-3 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatExpenseDate(expense.incurred_at)}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground px-3 py-2.5">
                              {expense.merchant || "--"}
                            </TableCell>
                            <TableCell className="text-destructive px-3 py-2.5 text-right text-lg font-extrabold whitespace-nowrap">
                              -${Number(expense.amount).toFixed(2)}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              <div className="flex justify-end gap-2">
                                {hasReceipt ? (
                                  <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                  >
                                    <a
                                      href={receiptUrl || undefined}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                      View Receipt
                                    </a>
                                  </Button>
                                ) : null}
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    to="/dashboard/expenses/$id"
                                    params={{ id: String(expense.id) }}
                                  >
                                    Open Expense
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="border-border text-muted-foreground flex items-center gap-2 border-t px-3 py-2 text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {pagination.totalItems} record
                    {pagination.totalItems === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="border-border/50 bg-card/30 text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-xs xl:hidden">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {pagination.totalItems} record
                  {pagination.totalItems === 1 ? "" : "s"}
                </div>
              </>
            )}

            <DashboardPaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(nextPage) =>
                updateSearchParams({ page: String(nextPage) })
              }
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

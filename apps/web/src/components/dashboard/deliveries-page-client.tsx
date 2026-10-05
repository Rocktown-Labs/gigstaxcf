import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Wallet,
  MapPin,
  Navigation,
  Banknote,
  CalendarDays,
  ExternalLink,
  Filter,
  ArrowUpDown,
  Plus,
  Layers,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  dashboardPageMainWideClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { DeliveryBulkManager } from "@/components/dashboard/delivery-bulk-manager";
import { DeliveryForm } from "@/components/dashboard/delivery-form";
import { ImageViewerDialog } from "@/components/dashboard/image-viewer-dialog";
import { ResponsiveDataCards } from "@/components/dashboard/responsive-data-cards";
import { ResponsiveDataCardsSkeleton } from "@/components/dashboard/responsive-data-cards-skeleton";
import { usePendingTipCount } from "@/components/dashboard/use-pending-tip-count";
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

interface Entry {
  id: number | string;
  miles?: string;
  distanceMiles?: string;
  distance_miles?: string;
  effective_total?: number | string;
  effective_tip?: number | string;
  estimated_total?: string;
  totalEstimatedAmount?: string;
  totalFinalAmount?: string;
  total_estimated_amount?: string;
  total_final_amount?: string;
  fareAmount?: string;
  fare_amount?: string;
  bonusAmount?: string;
  bonus_amount?: string;
  delivery_fee?: string;
  tip?: string;
  tipAmount?: string;
  tipEstimatedAmount?: string;
  tipFinalAmount?: string;
  tip_estimated_amount?: string;
  tip_final_amount?: string;
  tipStatus?: string;
  tip_status?: string;
  platformSlug?: string;
  platformDisplayName?: string;
  platformColorHex?: string;
  platform_slug?: string;
  platform_display_name?: string;
  platform_color_hex?: string;
  status?: string;
  screenshotUrl?: string | null;
  primary_media_url?: string | null;
  screenshot_url?: string | null;
  notes?: string | null;
  delivery_date?: string;
  occurred_at?: string;
  occurredAt?: string;
}

interface PlatformOption {
  colorHex: string;
  displayName: string;
  slug: string;
}

interface EntriesListResponse {
  entries?: Entry[];
  pagination?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary?: {
    totalLogs: number;
    totalMiles: number;
    totalPayout: number;
    totalTips: number;
  };
}

interface PlatformsResponse {
  availablePlatforms?: PlatformOption[];
}

const DELIVERY_PAGE_SIZE = 10;

const toAmount = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEffectiveTip = (entry: Entry) => {
  if ((entry.tipStatus || entry.tip_status) === "final") {
    return toAmount(entry.tipFinalAmount || entry.tip_final_amount || 0);
  }

  if ((entry.tipStatus || entry.tip_status) === "pending") {
    return toAmount(
      entry.tipEstimatedAmount || entry.tip_estimated_amount || 0
    );
  }

  return toAmount(
    entry.effective_tip ||
      entry.tip ||
      entry.tipAmount ||
      entry.tipFinalAmount ||
      entry.tipEstimatedAmount ||
      entry.tip_final_amount ||
      entry.tip_estimated_amount ||
      0
  );
};

const getEffectiveTotal = (entry: Entry) => {
  const fare = toAmount(
    entry.fareAmount || entry.fare_amount || entry.delivery_fee
  );
  const bonus = toAmount(entry.bonusAmount || entry.bonus_amount);
  const componentTotal = fare + bonus + getEffectiveTip(entry);

  const finalTotal = toAmount(
    entry.totalFinalAmount || entry.total_final_amount
  );
  if (finalTotal > 0 || componentTotal === 0) {
    return finalTotal;
  }

  const estimatedTotal = toAmount(
    entry.totalEstimatedAmount ||
      entry.total_estimated_amount ||
      entry.estimated_total
  );
  if (estimatedTotal > 0 || componentTotal === 0) {
    return estimatedTotal;
  }

  const apiEffectiveTotal = toAmount(entry.effective_total);
  if (apiEffectiveTotal > 0 || componentTotal === 0) {
    return apiEffectiveTotal;
  }

  return componentTotal;
};

interface DeliveriesPageClientProps {
  aiEnabled: boolean;
  bulkEnabled: boolean;
  onSearchParamsChange: (updates: Record<string, string | null>) => void;
  page: number;
  platformFilter: string;
  sortBy: string;
}

export function DeliveriesPageClient({
  aiEnabled,
  bulkEnabled,
  onSearchParamsChange,
  page,
  platformFilter,
  sortBy,
}: DeliveriesPageClientProps) {
  const queryClient = useQueryClient();
  const pendingTipCount = usePendingTipCount();

  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      onSearchParamsChange(updates);
    },
    [onSearchParamsChange]
  );

  const handleEntrySaved = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["entries"] });
    setIsCreateOpen(false);
  }, [queryClient]);

  const openCreateModal = useCallback(() => {
    setIsCreateOpen(true);
  }, []);

  const entriesQuery = useQuery({
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(DELIVERY_PAGE_SIZE),
        sort: sortBy,
      });

      if (platformFilter !== "all") {
        params.set("platform", platformFilter);
      }

      const response = await apiFetch(`/api/entries?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch entries");
      }

      return (await response.json()) as EntriesListResponse;
    },
    queryKey: ["entries", "deliveries-list", page, platformFilter, sortBy],
  });

  const platformsQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/platforms");
      if (!response.ok) {
        throw new Error("Failed to fetch platforms");
      }

      return (await response.json()) as PlatformsResponse;
    },
    queryKey: ["platforms", "delivery-filters"],
    staleTime: 60_000,
  });

  const entries = entriesQuery.data?.entries ?? [];
  const pagination = entriesQuery.data?.pagination ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    page,
    pageSize: DELIVERY_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  };
  const summary = entriesQuery.data?.summary ?? {
    totalLogs: 0,
    totalMiles: 0,
    totalPayout: 0,
    totalTips: 0,
  };

  useEffect(() => {
    if (pagination.page !== page) {
      updateSearchParams({ page: String(pagination.page) });
    }
  }, [page, pagination.page, updateSearchParams]);

  const platformOptions = useMemo(() => {
    const options = platformsQuery.data?.availablePlatforms ?? [];
    if (options.length > 0) {
      return [...options].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
    }

    return [] as PlatformOption[];
  }, [platformsQuery.data?.availablePlatforms]);

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
            Delivery Overview
          </h1>
          <p className="text-muted-foreground text-lg">
            Full history across platforms with tips, miles, and payout totals.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <div className="border-border/50 bg-card flex flex-col justify-between rounded-2xl border p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <span className="text-muted-foreground text-sm font-medium">
                Total Logs
              </span>
              <MapPin className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight md:text-3xl">
              {summary.totalLogs}
            </div>
          </div>

          <div className="border-border/50 bg-card flex flex-col justify-between rounded-2xl border p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <span className="text-muted-foreground text-sm font-medium">
                Gross Payout
              </span>
              <Wallet className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight md:text-3xl">
              ${summary.totalPayout.toFixed(2)}
            </div>
          </div>

          <div className="border-border/50 bg-card flex flex-col justify-between rounded-2xl border p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <span className="text-muted-foreground text-sm font-medium">
                Total Miles
              </span>
              <Navigation className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-2xl font-bold tracking-tight md:text-3xl">
              {summary.totalMiles.toFixed(1)}
            </div>
          </div>

          <div className="border-border/50 bg-card flex flex-col justify-between rounded-2xl border p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between md:mb-4">
              <span className="text-muted-foreground text-sm font-medium">
                Total Tips
              </span>
              <Banknote className="text-primary/80 h-4 w-4" />
            </div>
            <div className="text-primary text-2xl font-bold tracking-tight md:text-3xl">
              ${summary.totalTips.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 rounded-xl px-5 font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                Log Delivery
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-5xl">
              <DialogHeader className="sr-only">
                <DialogTitle>Log Delivery</DialogTitle>
                <DialogDescription>
                  Upload a screenshot first, then confirm and save details.
                </DialogDescription>
              </DialogHeader>
              <DeliveryForm onSaved={handleEntrySaved} aiEnabled={aiEnabled} />
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
                  <DialogTitle>Bulk Delivery Uploads</DialogTitle>
                  <DialogDescription>
                    Set a day and upload many screenshots, or add manual entries
                    in batches.
                  </DialogDescription>
                </DialogHeader>
                <DeliveryBulkManager onSaved={handleEntrySaved} />
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

          <Button asChild variant="secondary" className="h-11 rounded-xl px-5">
            <Link to="/dashboard/notifications">
              Notifications
              {pendingTipCount > 0 ? ` (${pendingTipCount})` : ""}
            </Link>
          </Button>
        </div>

        <Card className="border-border bg-card/95 rounded-3xl shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl">Trip History</CardTitle>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Showing {startItem}-{endItem} of {pagination.totalItems}
                {entriesQuery.isFetching && !entriesQuery.isLoading
                  ? " • Updating..."
                  : ""}
              </p>
            </div>

            <div className="border-border/50 bg-card/30 flex flex-col items-center justify-between gap-3 rounded-2xl border p-3 sm:flex-row sm:p-4">
              <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                <Filter className="text-muted-foreground h-4 w-4 shrink-0" />
                <Select
                  value={platformFilter}
                  onValueChange={(value) => {
                    updateSearchParams({
                      page: "1",
                      platform: value === "all" ? null : value,
                    });
                  }}
                >
                  <SelectTrigger className="bg-background/50 h-10 w-full rounded-lg sm:w-[220px]">
                    <SelectValue placeholder="All Platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {platformOptions.map((platform) => (
                      <SelectItem key={platform.slug} value={platform.slug}>
                        {platform.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                <ArrowUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
                <Select
                  value={sortBy}
                  onValueChange={(value) => {
                    updateSearchParams({
                      page: "1",
                      sort: value === "date-desc" ? null : value,
                    });
                  }}
                >
                  <SelectTrigger className="bg-background/50 h-10 w-full rounded-lg sm:w-[220px]">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest First</SelectItem>
                    <SelectItem value="date-asc">Oldest First</SelectItem>
                    <SelectItem value="amount-desc">Highest Payout</SelectItem>
                    <SelectItem value="amount-asc">Lowest Payout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {entriesQuery.isLoading && entries.length === 0 ? (
              <>
                <ResponsiveDataCardsSkeleton className="xl:hidden" cards={3} />
                <div className="border-border/50 bg-card/30 hidden rounded-2xl border p-12 text-center xl:block">
                  <div className="border-primary/30 border-t-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4" />
                  <p className="text-muted-foreground font-medium">
                    Loading history...
                  </p>
                </div>
              </>
            ) : entries.length === 0 ? (
              <div className="border-border/50 bg-card/30 rounded-2xl border-2 border-dashed p-16 text-center">
                <div className="mb-4 text-4xl opacity-50">📂</div>
                <h3 className="mb-2 text-xl font-bold">No Deliveries Found</h3>
                <p className="text-muted-foreground">
                  Adjust your filters or log a new delivery.
                </p>
                {summary.totalLogs === 0 && platformFilter === "all" ? (
                  <Button
                    className="mt-6 rounded-xl font-semibold shadow-[0_0_20px_-5px_oklch(0.65_0.25_140)]"
                    onClick={openCreateModal}
                  >
                    Log Your First Delivery
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <ResponsiveDataCards
                  className="xl:hidden"
                  items={entries}
                  getKey={(entry) => entry.id}
                  renderCard={(entry) => {
                    const amount = getEffectiveTotal(entry);
                    const tip = getEffectiveTip(entry);
                    const miles = toAmount(
                      entry.miles || entry.distanceMiles || entry.distance_miles
                    );
                    const fee = toAmount(
                      entry.delivery_fee ||
                        entry.fareAmount ||
                        entry.fare_amount
                    );
                    const platformSlug =
                      entry.platformSlug || entry.platform_slug || "other";
                    const platformName =
                      entry.platformDisplayName ||
                      entry.platform_display_name ||
                      platformSlug
                        .replaceAll("_", " ")
                        .replaceAll(/\b\w/gu, (value) => value.toUpperCase());
                    const occurredAt =
                      entry.delivery_date ||
                      entry.occurredAt ||
                      entry.occurred_at;
                    const isTipPending =
                      entry.tipStatus === "pending" ||
                      entry.tip_status === "pending" ||
                      (tip > 0 && !entry.tipStatus && !entry.tip_status);
                    const hasReceipt = Boolean(
                      entry.screenshot_url ||
                      entry.screenshotUrl ||
                      entry.primary_media_url
                    );

                    return (
                      <article className="border-border/60 bg-card rounded-2xl border p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className="bg-primary/10 text-primary inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
                            {platformName}
                          </span>
                          <p className="text-right text-lg font-extrabold">
                            ${amount.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-muted-foreground space-y-2 text-sm">
                          <p className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {occurredAt
                              ? new Date(occurredAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    weekday: "short",
                                    year: "numeric",
                                  }
                                )
                              : "--"}
                          </p>
                          <p>
                            Miles:{" "}
                            <span className="text-foreground font-semibold">
                              {miles > 0 ? `${miles.toFixed(1)} mi` : "--"}
                            </span>
                          </p>
                          <p>
                            Base fare:{" "}
                            <span className="text-foreground font-semibold">
                              ${fee > 0 ? fee.toFixed(2) : amount.toFixed(2)}
                            </span>
                          </p>
                          <p className="flex items-center gap-2">
                            <span>Tip:</span>
                            {tip > 0 ? (
                              <span
                                className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${
                                  isTipPending
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                                    : "border-green-500/20 bg-green-500/10 text-green-500"
                                }`}
                              >
                                +${tip.toFixed(2)}{" "}
                                {isTipPending ? "est. tip" : "tip"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {hasReceipt ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => setSelectedEntry(entry)}
                            >
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              View Receipt
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to="/dashboard/deliveries/$id"
                              params={{ id: String(entry.id) }}
                            >
                              Open Log
                            </Link>
                          </Button>
                        </div>
                      </article>
                    );
                  }}
                />

                <div className="border-border bg-card hidden overflow-x-auto rounded-2xl border xl:block">
                  <Table className="min-w-max table-auto">
                    <caption className="sr-only">Trip history table</caption>
                    <TableHeader className="bg-muted">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-11 min-w-[180px] px-3 font-semibold">
                          Platform
                        </TableHead>
                        <TableHead className="h-11 min-w-[220px] px-3 font-semibold">
                          Date
                        </TableHead>
                        <TableHead className="h-11 min-w-[110px] px-3 font-semibold">
                          Miles
                        </TableHead>
                        <TableHead className="h-11 min-w-[120px] px-3 font-semibold">
                          Base Fare
                        </TableHead>
                        <TableHead className="h-11 min-w-[140px] px-3 font-semibold">
                          Tip
                        </TableHead>
                        <TableHead className="h-11 min-w-[120px] px-3 text-right font-semibold">
                          Total
                        </TableHead>
                        <TableHead className="h-11 min-w-[150px] px-3 text-right font-semibold">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => {
                        const amount = getEffectiveTotal(entry);
                        const tip = getEffectiveTip(entry);
                        const miles = toAmount(
                          entry.miles ||
                            entry.distanceMiles ||
                            entry.distance_miles ||
                            0
                        );
                        const fee = toAmount(
                          entry.delivery_fee ||
                            entry.fareAmount ||
                            entry.fare_amount ||
                            0
                        );
                        const platformSlug =
                          entry.platformSlug || entry.platform_slug || "other";
                        const platformName =
                          entry.platformDisplayName ||
                          entry.platform_display_name ||
                          platformSlug
                            .replaceAll("_", " ")
                            .replaceAll(/\b\w/gu, (value) =>
                              value.toUpperCase()
                            );
                        const occurredAt =
                          entry.delivery_date ||
                          entry.occurredAt ||
                          entry.occurred_at;
                        const isTipPending =
                          entry.tipStatus === "pending" ||
                          entry.tip_status === "pending" ||
                          (tip > 0 && !entry.tipStatus && !entry.tip_status);
                        const hasReceipt = Boolean(
                          entry.screenshot_url ||
                          entry.screenshotUrl ||
                          entry.primary_media_url
                        );

                        return (
                          <TableRow
                            key={entry.id}
                            className="border-border hover:bg-muted/40"
                          >
                            <TableCell className="px-3 py-2.5">
                              <div className="flex flex-col gap-1">
                                <span className="bg-primary/10 text-primary inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                  {platformName}
                                </span>
                                {entry.status === "cancelled" ? (
                                  <span className="bg-destructive/10 text-destructive inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                                    Cancelled
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground px-3 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {occurredAt
                                  ? new Date(occurredAt).toLocaleDateString(
                                      "en-US",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        weekday: "short",
                                        year: "numeric",
                                      }
                                    )
                                  : "--"}
                              </span>
                            </TableCell>
                            <TableCell className="text-foreground px-3 py-2.5 font-semibold">
                              {miles > 0 ? `${miles.toFixed(1)} mi` : "--"}
                            </TableCell>
                            <TableCell className="text-foreground px-3 py-2.5 font-semibold">
                              ${fee > 0 ? fee.toFixed(2) : amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              {tip > 0 ? (
                                <span
                                  className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${
                                    isTipPending
                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                                      : "border-green-500/20 bg-green-500/10 text-green-500"
                                  }`}
                                >
                                  +${tip.toFixed(2)}{" "}
                                  {isTipPending ? "est. tip" : "tip"}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  --
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-foreground px-3 py-2.5 text-right text-lg font-extrabold whitespace-nowrap">
                              ${amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-3 py-2.5">
                              <div className="flex justify-end gap-2">
                                {hasReceipt ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => setSelectedEntry(entry)}
                                  >
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    View Receipt
                                  </Button>
                                ) : null}
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    to="/dashboard/deliveries/$id"
                                    params={{ id: String(entry.id) }}
                                  >
                                    Open Log
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

      {selectedEntry?.screenshot_url ||
      selectedEntry?.screenshotUrl ||
      selectedEntry?.primary_media_url ? (
        <ImageViewerDialog
          open={selectedEntry !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedEntry(null);
            }
          }}
          imageUrl={
            selectedEntry.screenshot_url ||
            selectedEntry.screenshotUrl ||
            selectedEntry.primary_media_url ||
            ""
          }
          alt="Delivery receipt screenshot"
          title="Attached receipt screenshot"
        />
      ) : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPinned,
  Route,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  dashboardPageMainReadableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { updateEntryAction } from "@/components/dashboard/entry-mutations";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/numeric-inputs";
import { apiFetch } from "@/lib/api";
import { parseFiniteNumber, roundToFractionDigits } from "@/lib/numeric-policy";

interface Entry {
  id: number | string;
  bonusAmount?: number | string | null;
  bonus_amount?: number | string | null;
  fareAmount?: number | string | null;
  fare_amount?: number | string | null;
  occurredAt?: string | null;
  occurred_at?: string | null;
  platformSlug?: string | null;
  platformDisplayName?: string | null;
  platform_slug?: string | null;
  platform_display_name?: string | null;
  tipEstimatedAmount?: number | string | null;
  tipFinalAmount?: number | string | null;
  tipStatus?: string | null;
  tip_estimated_amount?: number | string | null;
  tip_final_amount?: number | string | null;
  tip_status?: string | null;
  totalEstimatedAmount?: number | string | null;
  total_estimated_amount?: number | string | null;
}

interface TripQueueEntry {
  extractedDropoffText?: string | null;
  extractedPickupText?: string | null;
  id: number | string;
  occurredAt?: string | null;
  platformDisplayName?: string | null;
  platformSlug?: string | null;
  returnAddress?: string | null;
  screenshotDistanceMiles?: number | null;
  status?: string | null;
  stopsCount?: number | null;
  tripVerificationUpdatedAt?: string | null;
  verifiedStopCount?: number | null;
}

interface PaginationState {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface PaginatedResponse<TEntry> {
  entries?: TEntry[];
  pagination?: PaginationState;
}

const VERIFICATION_DELAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_PAGE_SIZE = 10;

const emptyPagination = (page: number): PaginationState => ({
  hasNextPage: false,
  hasPreviousPage: false,
  page,
  pageSize: NOTIFICATION_PAGE_SIZE,
  totalItems: 0,
  totalPages: 1,
});

const toAmount = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPlatformName = (entry: {
  platformDisplayName?: string | null;
  platformSlug?: string | null;
  platform_display_name?: string | null;
  platform_slug?: string | null;
}) => {
  const displayName = entry.platformDisplayName || entry.platform_display_name;
  if (displayName) {
    return displayName;
  }

  const slug = entry.platformSlug || entry.platform_slug || "other";
  return slug
    .replaceAll("_", " ")
    .replaceAll(/\b\w/gu, (character) => character.toUpperCase());
};

const formatOccurredAt = (value: string | null | undefined) => {
  if (!value) {
    return "No trip date";
  }

  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatMiles = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return `${value.toFixed(2)} mi`;
};

const getVerificationState = (entry: Entry) => {
  const occurredAt = entry.occurredAt || entry.occurred_at;
  const occurredTime = occurredAt ? new Date(occurredAt).getTime() : Number.NaN;

  if (!Number.isFinite(occurredTime)) {
    return { isReady: true, label: "Ready to verify now" };
  }

  const readyAtTime = occurredTime + VERIFICATION_DELAY_MS;
  const now = Date.now();
  if (now >= readyAtTime) {
    return { isReady: true, label: "Ready to verify now" };
  }

  const hoursRemaining = Math.max(
    1,
    Math.ceil((readyAtTime - now) / (60 * 60 * 1000))
  );

  return { isReady: false, label: `Verify in ~${hoursRemaining}h` };
};

const getTripQueueLabel = (entry: TripQueueEntry) => {
  if (!entry.returnAddress) {
    return "Missing return location";
  }

  if ((entry.stopsCount ?? 0) > 1 && (entry.verifiedStopCount ?? 0) === 0) {
    return "Multiple-stop review available";
  }

  return "Ready to map and save";
};

const getStartAndEndItems = (pagination: PaginationState) => {
  const startItem =
    pagination.totalItems === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  return { endItem, startItem };
};

function TripQueueCard({ entry }: { entry: TripQueueEntry }) {
  const id = String(entry.id);
  const platformName = getPlatformName(entry);
  const label = getTripQueueLabel(entry);
  const stopsCount = entry.stopsCount ?? 0;
  const verifiedStopCount = entry.verifiedStopCount ?? 0;

  return (
    <article className="border-border/60 bg-card rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {platformName}
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{label}</div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatOccurredAt(entry.occurredAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Route className="h-4 w-4" />
                {formatMiles(entry.screenshotDistanceMiles)} screenshot miles
              </span>
            </div>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
            {entry.extractedPickupText ? (
              <span className="bg-muted rounded-full px-3 py-1">
                Pickup: {entry.extractedPickupText}
              </span>
            ) : null}
            {entry.extractedDropoffText ? (
              <span className="bg-muted rounded-full px-3 py-1">
                Dropoff: {entry.extractedDropoffText}
              </span>
            ) : null}
            {stopsCount > 1 ? (
              <span className="bg-muted rounded-full px-3 py-1">
                {stopsCount} screenshot stops • {verifiedStopCount} added
              </span>
            ) : null}
          </div>
        </div>

        <div className="w-full md:w-[260px]">
          <Button asChild className="w-full rounded-xl">
            <Link
              to="/dashboard/deliveries/$id"
              params={{ id: String(id) }}
              hash="trip-verification"
            >
              Open trip verification
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function TipQueueCard(props: {
  entry: Entry;
  errorMessage?: string;
  inputValue: string;
  isVerifying: boolean;
  onInputChange: (entryId: string, value: string) => void;
  onVerify: (entry: Entry, inputValue: string) => void;
}) {
  const {
    entry,
    errorMessage,
    inputValue,
    isVerifying,
    onInputChange,
    onVerify,
  } = props;
  const id = String(entry.id);
  const tipEstimatedAmount = toAmount(
    entry.tipEstimatedAmount || entry.tip_estimated_amount
  );
  const occurredAt = entry.occurredAt || entry.occurred_at;
  const verificationState = getVerificationState(entry);
  const parsedInputValue = parseFiniteNumber(inputValue);
  const handleValueChange = useCallback(
    (next: string) => {
      onInputChange(id, next);
    },
    [id, onInputChange]
  );
  const handleVerifyClick = useCallback(() => {
    onVerify(entry, inputValue);
  }, [entry, inputValue, onVerify]);

  return (
    <article className="border-border/60 bg-card rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="space-y-2">
          <div className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {getPlatformName(entry)}
          </div>
          <div className="text-2xl font-bold tracking-tight">
            +${tipEstimatedAmount.toFixed(2)} estimated tip
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {formatOccurredAt(occurredAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {verificationState.label}
            </span>
          </div>
        </div>

        <div className="w-full space-y-2 md:w-[280px]">
          <label
            htmlFor={`tip-${id}`}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Final Tip Amount
          </label>
          <MoneyInput
            id={`tip-${id}`}
            placeholder="0.00"
            value={inputValue}
            onValueChange={handleValueChange}
          />
          <p className="text-muted-foreground text-xs">
            Up to 2 decimals. Auto-rounded on blur.
          </p>
          {errorMessage ? (
            <p className="text-destructive text-xs">{errorMessage}</p>
          ) : null}
          <Button
            className="w-full rounded-xl"
            disabled={
              !verificationState.isReady ||
              isVerifying ||
              parsedInputValue === null ||
              parsedInputValue < 0
            }
            onClick={handleVerifyClick}
          >
            {isVerifying ? "Verifying..." : "Mark as Verified"}
          </Button>
        </div>
      </div>
    </article>
  );
}

interface NotificationsPageClientProps {
  onSearchParamsChange: (updates: Record<string, string | null>) => void;
  page: number;
  tripPage: number;
}

const omitEntryKey = (
  record: Record<string, string>,
  key: string
): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const [recordKey, value] of Object.entries(record)) {
    if (recordKey !== key) {
      next[recordKey] = value;
    }
  }
  return next;
};

export function NotificationsPageClient({
  onSearchParamsChange,
  page: tipPage,
  tripPage,
}: NotificationsPageClientProps) {
  const queryClient = useQueryClient();

  const [tipInputs, setTipInputs] = useState<Record<string, string>>({});
  const [tipErrors, setTipErrors] = useState<Record<string, string>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      onSearchParamsChange(updates);
    },
    [onSearchParamsChange]
  );
  const handleTripPageChange = useCallback(
    (nextPage: number) => {
      updateSearchParams({ tripPage: String(nextPage) });
    },
    [updateSearchParams]
  );
  const handleTipPageChange = useCallback(
    (nextPage: number) => {
      updateSearchParams({ page: String(nextPage) });
    },
    [updateSearchParams]
  );

  const tipNotificationsQuery = useQuery({
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(tipPage),
        pageSize: String(NOTIFICATION_PAGE_SIZE),
        sort: "date-desc",
        status: "completed",
        tipStatus: "pending",
      });

      const response = await apiFetch(`/api/entries?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch pending tips");
      }

      return (await response.json()) as PaginatedResponse<Entry>;
    },
    queryKey: ["entries", "tip-notifications", tipPage],
  });

  const tripNotificationsQuery = useQuery({
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(tripPage),
        pageSize: String(NOTIFICATION_PAGE_SIZE),
      });
      const response = await apiFetch(
        `/api/entries/trip-verification-queue?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch trip verification queue");
      }

      return (await response.json()) as PaginatedResponse<TripQueueEntry>;
    },
    queryKey: ["entries", "trip-verification-queue", tripPage],
  });

  const pendingEntries = tipNotificationsQuery.data?.entries ?? [];
  const tipPagination =
    tipNotificationsQuery.data?.pagination ?? emptyPagination(tipPage);
  const tripEntries = tripNotificationsQuery.data?.entries ?? [];
  const tripPagination =
    tripNotificationsQuery.data?.pagination ?? emptyPagination(tripPage);

  // Sync URL params to the server-returned page when the server clamps an
  // out-of-range page value (e.g. ?page=100 but only 3 pages exist).
  useEffect(() => {
    const serverPage = tipNotificationsQuery.data?.pagination?.page;
    if (serverPage !== undefined && serverPage !== tipPage) {
      updateSearchParams({
        page: serverPage === 1 ? null : String(serverPage),
      });
    }
  }, [
    tipNotificationsQuery.data?.pagination?.page,
    tipPage,
    updateSearchParams,
  ]);

  useEffect(() => {
    const serverPage = tripNotificationsQuery.data?.pagination?.page;
    if (serverPage !== undefined && serverPage !== tripPage) {
      updateSearchParams({
        tripPage: serverPage === 1 ? null : String(serverPage),
      });
    }
  }, [
    tripNotificationsQuery.data?.pagination?.page,
    tripPage,
    updateSearchParams,
  ]);

  const { mutate: verifyTip } = useMutation({
    mutationFn: async ({
      entry,
      finalTipAmount,
    }: {
      entry: Entry;
      finalTipAmount: number;
    }) => {
      const fareAmount = toAmount(entry.fareAmount || entry.fare_amount);
      const bonusAmount = toAmount(entry.bonusAmount || entry.bonus_amount);
      const totalEstimatedAmount = toAmount(
        entry.totalEstimatedAmount || entry.total_estimated_amount
      );
      const normalizedTipAmount = roundToFractionDigits(finalTipAmount, 2);
      const totalFinalAmount = roundToFractionDigits(
        fareAmount + bonusAmount + normalizedTipAmount,
        2
      );

      await updateEntryAction(entry.id, {
        status: "completed",
        tipEstimatedAmount: null,
        tipFinalAmount: normalizedTipAmount,
        tipStatus: "final",
        totalEstimatedAmount:
          totalEstimatedAmount > 0 ? totalEstimatedAmount : totalFinalAmount,
        totalFinalAmount,
      });
    },
    onError: (_error, variables) => {
      const id = String(variables.entry.id);
      setTipErrors((current) => ({
        ...current,
        [id]: "Unable to verify this tip. Try again.",
      }));
    },
    onSettled: async (_data, _error, variables) => {
      const id = String(variables.entry.id);
      setVerifyingId((current) => (current === id ? null : current));
      await queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onSuccess: (_data, variables) => {
      const id = String(variables.entry.id);
      const currentData = queryClient.getQueryData<PaginatedResponse<Entry>>([
        "entries",
        "tip-notifications",
        tipPage,
      ]);
      const currentEntries = currentData?.entries ?? [];

      if (currentEntries.length <= 1 && tipPage > 1) {
        updateSearchParams({ page: String(tipPage - 1) });
      }

      setTipErrors((current) => omitEntryKey(current, id));
      setTipInputs((current) => omitEntryKey(current, id));
    },
  });

  const showGlobalEmptyState = useMemo(
    () =>
      !tipNotificationsQuery.isLoading &&
      !tripNotificationsQuery.isLoading &&
      tipPagination.totalItems === 0 &&
      tripPagination.totalItems === 0,
    [
      tipNotificationsQuery.isLoading,
      tipPagination.totalItems,
      tripNotificationsQuery.isLoading,
      tripPagination.totalItems,
    ]
  );

  const tipRange = getStartAndEndItems(tipPagination);
  const tripRange = getStartAndEndItems(tripPagination);
  const handleTipInputChange = useCallback((entryId: string, next: string) => {
    setTipInputs((current) => ({
      ...current,
      [entryId]: next,
    }));
    setTipErrors((current) => omitEntryKey(current, entryId));
  }, []);
  const handleVerifyTip = useCallback(
    (entry: Entry, inputValue: string) => {
      const id = String(entry.id);
      const parsed = parseFiniteNumber(inputValue);
      if (parsed === null || parsed < 0) {
        setTipErrors((current) => ({
          ...current,
          [id]: "Enter a valid non-negative amount.",
        }));
        return;
      }

      setVerifyingId(id);
      verifyTip({
        entry,
        finalTipAmount: roundToFractionDigits(parsed, 2),
      });
    },
    [verifyTip]
  );

  let tripSectionContent: ReactNode = (
    <div className="space-y-4">
      {tripEntries.map((entry) => (
        <TripQueueCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
  if (tripNotificationsQuery.isLoading) {
    tripSectionContent = (
      <div className="border-border/50 bg-card/30 rounded-2xl border p-12 text-center">
        <div className="border-primary/30 border-t-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4" />
        <p className="text-muted-foreground font-medium">
          Loading trip reminders...
        </p>
      </div>
    );
  } else if (tripEntries.length === 0) {
    tripSectionContent = (
      <div className="border-border/60 bg-card/20 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
        No trip logs are waiting for mileage verification.
      </div>
    );
  }

  let tipSectionContent: ReactNode = (
    <div className="space-y-4">
      {pendingEntries.map((entry) => {
        const id = String(entry.id);
        const tipEstimatedAmount = toAmount(
          entry.tipEstimatedAmount || entry.tip_estimated_amount
        );
        const inputValue =
          tipInputs[id] ??
          (tipEstimatedAmount > 0 ? tipEstimatedAmount.toFixed(2) : "");

        return (
          <TipQueueCard
            key={id}
            entry={entry}
            errorMessage={tipErrors[id]}
            inputValue={inputValue}
            isVerifying={verifyingId === id}
            onInputChange={handleTipInputChange}
            onVerify={handleVerifyTip}
          />
        );
      })}
    </div>
  );
  if (tipNotificationsQuery.isLoading) {
    tipSectionContent = (
      <div className="border-border/50 bg-card/30 rounded-2xl border p-12 text-center">
        <div className="border-primary/30 border-t-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4" />
        <p className="text-muted-foreground font-medium">
          Loading tip reminders...
        </p>
      </div>
    );
  } else if (pendingEntries.length === 0) {
    tipSectionContent = (
      <div className="border-border/60 bg-card/20 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
        No pending tips need verification right now.
      </div>
    );
  }

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainReadableClass} space-y-6`}>
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Notifications
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Clear pending payout updates and finish mileage verification while
            each trip is still easy to remember.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border-border/60 bg-card/50 rounded-2xl border p-4">
            <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <MapPinned className="text-primary h-4 w-4" />
              Trip Verification Queue
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {tripPagination.totalItems} pending{" "}
              {tripPagination.totalItems === 1 ? "trip" : "trips"}
            </div>
          </div>
          <div className="border-border/60 bg-card/50 rounded-2xl border p-4">
            <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <BellRing className="text-primary h-4 w-4" />
              Tip Verification Queue
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {tipPagination.totalItems} pending{" "}
              {tipPagination.totalItems === 1 ? "entry" : "entries"}
            </div>
          </div>
        </div>

        {showGlobalEmptyState ? (
          <div className="border-border/60 bg-card/20 rounded-2xl border border-dashed p-16 text-center">
            <CheckCircle2 className="text-primary mx-auto h-10 w-10" />
            <h2 className="mt-4 text-xl font-bold">All caught up</h2>
            <p className="text-muted-foreground mt-2">
              No trip logs or tips need follow-up right now.
            </p>
            <Button asChild className="mt-6 rounded-xl">
              <Link to="/dashboard/deliveries">Back to Deliveries</Link>
            </Button>
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Trip verification
              </h2>
              <p className="text-muted-foreground text-sm">
                Finish your mileage log with pickup, return, and optional stop
                details.
              </p>
            </div>
          </div>

          {tripSectionContent}

          {tripPagination.totalItems > 0 ? (
            <div className="border-border/50 bg-card/30 rounded-2xl border p-3 md:p-4">
              <div className="text-muted-foreground mb-2 text-sm md:mb-3">
                Showing {tripRange.startItem}-{tripRange.endItem} of{" "}
                {tripPagination.totalItems}
              </div>
              <DashboardPaginationControls
                page={tripPagination.page}
                totalPages={tripPagination.totalPages}
                onPageChange={handleTripPageChange}
              />
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Tip verification
            </h2>
            <p className="text-muted-foreground text-sm">
              Verify pending tips to clear your queue and finalize payout
              totals.
            </p>
          </div>

          {tipSectionContent}

          {tipPagination.totalItems > 0 ? (
            <div className="border-border/50 bg-card/30 rounded-2xl border p-3 md:p-4">
              <div className="text-muted-foreground mb-2 text-sm md:mb-3">
                Showing {tipRange.startItem}-{tipRange.endItem} of{" "}
                {tipPagination.totalItems}
              </div>
              <DashboardPaginationControls
                page={tipPagination.page}
                totalPages={tipPagination.totalPages}
                onPageChange={handleTipPageChange}
              />
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

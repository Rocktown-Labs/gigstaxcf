import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChartColumnBig,
  CircleDollarSign,
  FileText,
  Gauge,
  Layers,
  Lock,
  ReceiptText,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  dashboardPageMainWideClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { StubHistoryTable } from "@/components/dashboard/stub-history-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { STUB_FIELD_KEYS, STUB_MANDATORY_FIELD_KEYS } from "@/lib/stubs/types";
import type {
  StubCadence,
  StubFieldKey,
  StubSnapshot,
} from "@/lib/stubs/types";

interface StubVerificationProfile {
  address: string;
  email: string;
  issuerName: string;
  legalName: string;
  phone: string;
}

interface StubProfileRecord {
  autoGenerateEnabled: boolean;
  defaultFieldKeys: StubFieldKey[];
  primaryCadence: StubCadence;
  verificationProfile: StubVerificationProfile;
}

interface IncomeStubRecord {
  anchorDate: string;
  cadence: StubCadence;
  fieldKeys: StubFieldKey[];
  lockedAt: string | null;
  periodEnd: string;
  periodStart: string;
  publicId: string;
  revision: number;
  snapshot: StubSnapshot;
  status: "draft" | "locked";
}

interface StubsListResponse {
  defaults: Record<
    StubCadence,
    {
      anchorDate: string;
      period: {
        endDate: string;
        startDate: string;
      };
    }
  >;
  profile: StubProfileRecord;
  stubs: IncomeStubRecord[];
}

interface StubPreviewResponse {
  profile: StubProfileRecord;
  snapshot: StubSnapshot;
}

const HISTORY_PAGE_SIZE = 5;

const FIELD_LABELS: Record<StubFieldKey, string> = {
  earnings_itemization: "Earnings itemization",
  expenses_itemization: "Expense itemization",
  identity_block: "Identity block",
  miles_total: "Miles",
  orders_count: "Orders",
  period_window: "Period summary",
  summary_totals: "Period totals",
  tips_total: "Tips",
  ytd_totals: "YTD totals",
};

const FIELD_DESCRIPTIONS: Record<StubFieldKey, string> = {
  earnings_itemization: "Platform-level totals with orders and hours",
  expenses_itemization: "Category, merchant, and amount rows",
  identity_block: "Worker identity and issuer block",
  miles_total: "Total miles for selected period",
  orders_count: "Completed order count",
  period_window: "Cadence and covered date range",
  summary_totals: "Gross, expenses, operating net",
  tips_total: "Total tips in selected period",
  ytd_totals: "Calendar-year totals through period end",
};

const MANDATORY_FIELD_SET = new Set<StubFieldKey>(STUB_MANDATORY_FIELD_KEYS);
const AUTO_GENERATE_TOGGLE_ID = "stub-auto-generate-primary-cadence";
const CADENCE_LABELS: Record<StubCadence, string> = {
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  weekly: "Weekly",
};

const OPTIONAL_FIELDS = STUB_FIELD_KEYS.filter(
  (fieldKey) => !MANDATORY_FIELD_SET.has(fieldKey)
);
const METRIC_OPTION_FIELDS: StubFieldKey[] = [
  "tips_total",
  "orders_count",
  "miles_total",
];
const NON_METRIC_OPTION_FIELDS = OPTIONAL_FIELDS.filter(
  (fieldKey) => !METRIC_OPTION_FIELDS.includes(fieldKey)
);
const EMPTY_STUBS: IncomeStubRecord[] = [];

const getErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error || "Request failed";
};

const formatMoney = (value: number, currencyCode = "USD") =>
  new Intl.NumberFormat("en-US", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const SummaryTile = ({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  valueClassName?: string;
}) => (
  <div className="border-border bg-muted/40 rounded-2xl border p-4">
    <p className="text-muted-foreground mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] uppercase">
      <Icon className="text-primary h-3.5 w-3.5" />
      {label}
    </p>
    <p
      className={`text-foreground text-xl font-semibold ${valueClassName ?? ""}`}
    >
      {value}
    </p>
  </div>
);

export const Route = createFileRoute("/dashboard/stubs")({
  component: GigStaxStubsPage,
  head: () => ({
    meta: [{ title: "Stub Suite" }],
  }),
});

function GigStaxStubsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cadence, setCadence] = useState<StubCadence>("weekly");
  const [anchorDate, setAnchorDate] = useState("");
  const [fieldKeys, setFieldKeys] = useState<StubFieldKey[]>([
    ...STUB_MANDATORY_FIELD_KEYS,
  ]);
  const [historyPage, setHistoryPage] = useState(1);
  const [autoGenerateEnabled, setAutoGenerateEnabled] = useState(true);
  const [lockPendingId, setLockPendingId] = useState<string | null>(null);

  const stubsQuery = useQuery<StubsListResponse>({
    queryFn: async () => {
      const response = await apiFetch("/api/stubs?limit=25");
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      return (await response.json()) as StubsListResponse;
    },
    queryKey: ["stubs", "recent"],
  });

  const previewQuery = useQuery<StubPreviewResponse>({
    enabled: Boolean(stubsQuery.data) && Boolean(anchorDate),
    queryFn: async () => {
      const response = await apiFetch("/api/stubs/preview", {
        body: JSON.stringify({ anchorDate, cadence, fieldKeys }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return (await response.json()) as StubPreviewResponse;
    },
    queryKey: ["stub-preview", cadence, anchorDate, fieldKeys.join(",")],
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/stubs", {
        body: JSON.stringify({ anchorDate, cadence, fieldKeys }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = (await response.json()) as { stub: IncomeStubRecord };
      return payload.stub;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stubs"] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/stubs/profile", {
        body: JSON.stringify({
          autoGenerateEnabled,
          defaultFieldKeys: fieldKeys,
          primaryCadence: cadence,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return (await response.json()) as { profile: StubProfileRecord };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stubs"] });
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (publicId: string) => {
      const response = await apiFetch(`/api/stubs/${publicId}/lock`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return (await response.json()) as { stub: IncomeStubRecord };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stubs"] });
    },
  });

  // Hydrate the generator defaults from the stubs profile once, following the
  // React "adjust state when inputs change" pattern (guarded render-time
  // update instead of a mount effect).
  const [initializedFrom, setInitializedFrom] = useState<unknown>(null);
  if (stubsQuery.data && initializedFrom !== stubsQuery.data) {
    setInitializedFrom(stubsQuery.data);
    setCadence(stubsQuery.data.profile.primaryCadence);
    setFieldKeys(stubsQuery.data.profile.defaultFieldKeys);
    setAutoGenerateEnabled(stubsQuery.data.profile.autoGenerateEnabled);
    setAnchorDate(
      stubsQuery.data.defaults[stubsQuery.data.profile.primaryCadence]
        .anchorDate
    );
  }

  const handleCadenceChange = (nextCadence: StubCadence) => {
    setCadence(nextCadence);

    const nextAnchor = stubsQuery.data?.defaults[nextCadence]?.anchorDate;
    if (nextAnchor) {
      setAnchorDate(nextAnchor);
    }
  };

  const toggleOptionalField = (fieldKey: StubFieldKey) => {
    setFieldKeys((current) => {
      if (MANDATORY_FIELD_SET.has(fieldKey)) {
        return current;
      }

      if (current.includes(fieldKey)) {
        return current.filter((item) => item !== fieldKey);
      }

      return STUB_FIELD_KEYS.filter((key) =>
        new Set([...current, fieldKey]).has(key)
      );
    });
  };

  const resetFieldKeys = () => {
    const defaults = stubsQuery.data?.profile.defaultFieldKeys;
    if (defaults) {
      setFieldKeys(defaults);
      return;
    }

    setFieldKeys([...STUB_MANDATORY_FIELD_KEYS]);
  };

  const handleCreateAndOpen = async () => {
    const stub = await saveDraftMutation.mutateAsync();
    navigate({
      to: "/dashboard/stubs/$id",
      params: { id: stub.publicId },
    });
  };

  const handleLockStub = async (publicId: string) => {
    setLockPendingId(publicId);
    try {
      await lockMutation.mutateAsync(publicId);
    } catch (error) {
      setLockPendingId(null);
      throw error;
    }
    setLockPendingId(null);
  };

  const isBusy =
    stubsQuery.isLoading ||
    saveDraftMutation.isPending ||
    updateProfileMutation.isPending ||
    lockMutation.isPending;

  const listError =
    stubsQuery.error instanceof Error ? stubsQuery.error.message : null;
  const previewError =
    previewQuery.error instanceof Error ? previewQuery.error.message : null;

  const currentDefaultWindow = stubsQuery.data?.defaults[cadence]?.period;
  const displayedSnapshot =
    previewQuery.data?.snapshot || stubsQuery.data?.stubs[0]?.snapshot || null;
  const snapshotCurrency = displayedSnapshot?.currencyCode ?? "USD";
  const selectedOptionalCount = fieldKeys.filter(
    (fieldKey) => !MANDATORY_FIELD_SET.has(fieldKey)
  ).length;

  const summaryTiles = displayedSnapshot
    ? [
        {
          icon: TrendingUp,
          label: "Gross",
          value: formatMoney(
            displayedSnapshot.totals.grossEarnings,
            snapshotCurrency
          ),
          valueClassName: "",
        },
        {
          icon: TrendingDown,
          label: "Business Expenses",
          value: formatMoney(
            displayedSnapshot.totals.businessExpenses,
            snapshotCurrency
          ),
          valueClassName: "text-destructive",
        },
        {
          icon: CircleDollarSign,
          label: "Operating Net",
          value: formatMoney(
            displayedSnapshot.totals.operatingNet,
            snapshotCurrency
          ),
          valueClassName: "",
        },
        {
          icon: Sparkles,
          label: "YTD Net",
          value: formatMoney(
            displayedSnapshot.ytd.totals.operatingNet,
            snapshotCurrency
          ),
          valueClassName: "",
        },
      ]
    : [];

  const activeWindowLabel = useMemo(() => {
    if (previewQuery.data?.snapshot) {
      return `${previewQuery.data.snapshot.period.startDate} to ${previewQuery.data.snapshot.period.endDate}`;
    }

    if (currentDefaultWindow) {
      return `${currentDefaultWindow.startDate} to ${currentDefaultWindow.endDate}`;
    }

    return "No active window";
  }, [currentDefaultWindow, previewQuery.data?.snapshot]);

  const historyStubs = stubsQuery.data?.stubs ?? EMPTY_STUBS;
  const historyPageCount = Math.max(
    1,
    Math.ceil(historyStubs.length / HISTORY_PAGE_SIZE)
  );
  const paginatedHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return historyStubs.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [historyPage, historyStubs]);

  const [knownHistoryPageCount, setKnownHistoryPageCount] =
    useState(historyPageCount);
  if (knownHistoryPageCount !== historyPageCount) {
    setKnownHistoryPageCount(historyPageCount);
    if (historyPage > historyPageCount) {
      setHistoryPage(historyPageCount);
    }
  }

  const goToHistoryPage = (pageNumber: number) => {
    const clamped = Math.min(historyPageCount, Math.max(1, pageNumber));
    setHistoryPage(clamped);
  };

  return (
    <div className={`relative ${dashboardPageOuterClass}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_42%),radial-gradient(circle_at_95%_20%,rgba(16,185,129,0.14),transparent_36%)]"
      />
      <main className={`${dashboardPageMainWideClass} space-y-6`}>
        <Card className="border-primary/25 from-primary/20 via-card/95 to-card shadow-primary/15 overflow-hidden rounded-3xl border bg-gradient-to-br shadow-lg">
          <CardContent className="space-y-5 p-6">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight lg:text-4xl">
                <ReceiptText className="text-primary h-8 w-8" />
                Stub Suite
              </h1>
              <p className="text-muted-foreground mt-3 max-w-3xl text-base">
                Build lender-ready income stubs with gross earnings, business
                expenses, operating net, and calendar-year YTD metrics.
              </p>
              <p className="border-primary/35 bg-primary/15 text-primary mt-3 inline-flex rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide">
                Expenses shown here are business costs, not payroll withholding.
              </p>
            </div>

            {summaryTiles.length > 0 ? (
              <section
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
                aria-live="polite"
              >
                {summaryTiles.map((tile) => (
                  <SummaryTile
                    key={tile.label}
                    icon={tile.icon}
                    label={tile.label}
                    value={tile.value}
                    valueClassName={tile.valueClassName}
                  />
                ))}
              </section>
            ) : null}

            <div className="border-border bg-muted/20 space-y-4 rounded-2xl border p-3 sm:p-4">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="border-border bg-card min-w-0 rounded-xl border p-2.5 sm:p-3">
                  <p className="text-muted-foreground truncate text-[10px] font-semibold tracking-[0.14em] uppercase sm:text-[11px] sm:tracking-[0.18em]">
                    Active Window
                  </p>
                  <p className="mt-1 text-xs leading-tight font-semibold break-words sm:text-sm">
                    {activeWindowLabel}
                  </p>
                  <p className="text-muted-foreground mt-2 text-[11px] leading-tight">
                    Defaults to the current{" "}
                    {CADENCE_LABELS[cadence].toLowerCase()} window.
                  </p>
                </div>
                <div className="border-border bg-card min-w-0 space-y-1.5 rounded-xl border p-2.5 sm:space-y-2 sm:p-3">
                  <Label htmlFor="stub-cadence" className="text-xs sm:text-sm">
                    Cadence
                  </Label>
                  <Select
                    value={cadence}
                    onValueChange={(value) =>
                      handleCadenceChange(value as StubCadence)
                    }
                  >
                    <SelectTrigger
                      id="stub-cadence"
                      className="h-9 text-xs sm:h-11 sm:text-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="border-border bg-card min-w-0 space-y-1.5 rounded-xl border p-2.5 sm:space-y-2 sm:p-3">
                  <Label
                    htmlFor="stub-anchor-date"
                    className="truncate text-xs sm:text-sm"
                  >
                    Anchor Window
                  </Label>
                  <Input
                    id="stub-anchor-date"
                    type="date"
                    className="h-9 text-xs sm:h-11 sm:text-sm"
                    value={anchorDate}
                    onChange={(event) => setAnchorDate(event.target.value)}
                  />
                </div>
              </div>

              <label
                className="border-border/60 bg-background/70 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                htmlFor={AUTO_GENERATE_TOGGLE_ID}
              >
                <span>Auto-generate primary cadence drafts</span>
                <Checkbox
                  id={AUTO_GENERATE_TOGGLE_ID}
                  checked={autoGenerateEnabled}
                  aria-label="Auto-generate primary cadence drafts"
                  onCheckedChange={(next) =>
                    setAutoGenerateEnabled(next === true)
                  }
                />
              </label>

              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm font-semibold">
                  Visible Fields
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {STUB_MANDATORY_FIELD_KEYS.map((fieldKey) => (
                    <span
                      key={fieldKey}
                      className="border-primary/40 bg-primary/15 text-primary inline-flex min-w-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
                    >
                      <Lock className="h-3 w-3" />
                      <span className="min-w-0 truncate">
                        {FIELD_LABELS[fieldKey]}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Required sections are locked. Optional sections selected:{" "}
                  {selectedOptionalCount}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {METRIC_OPTION_FIELDS.map((fieldKey) => {
                    const selected = fieldKeys.includes(fieldKey);

                    return (
                      <button
                        key={fieldKey}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleOptionalField(fieldKey)}
                        className={`min-w-0 rounded-xl border p-2.5 text-left transition sm:p-3 ${
                          selected
                            ? "border-primary/45 bg-primary/15"
                            : "border-border bg-card hover:border-primary/25 hover:bg-muted/40"
                        }`}
                      >
                        <p className="truncate text-xs font-semibold sm:text-sm">
                          {FIELD_LABELS[fieldKey]}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px] leading-tight sm:text-xs">
                          {FIELD_DESCRIPTIONS[fieldKey]}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {NON_METRIC_OPTION_FIELDS.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {NON_METRIC_OPTION_FIELDS.map((fieldKey) => {
                      const selected = fieldKeys.includes(fieldKey);

                      return (
                        <button
                          key={fieldKey}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleOptionalField(fieldKey)}
                          className={`rounded-xl border p-3 text-left transition ${
                            selected
                              ? "border-primary/45 bg-primary/15"
                              : "border-border bg-card hover:border-primary/25 hover:bg-muted/40"
                          }`}
                        >
                          <p className="text-sm font-semibold">
                            {FIELD_LABELS[fieldKey]}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {FIELD_DESCRIPTIONS[fieldKey]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isBusy}
                    onClick={resetFieldKeys}
                  >
                    <Layers className="mr-2 h-4 w-4" />
                    Reset Fields
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="border-border bg-card border"
                    disabled={isBusy}
                    onClick={() => updateProfileMutation.mutate()}
                  >
                    <Gauge className="mr-2 h-4 w-4" />
                    Save Defaults
                  </Button>
                </div>
              </fieldset>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="h-11"
                disabled={isBusy || !anchorDate}
                onClick={handleCreateAndOpen}
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate Statement
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={isBusy || !anchorDate}
                onClick={handleCreateAndOpen}
              >
                <ChartColumnBig className="mr-2 h-4 w-4" />
                Save Draft
              </Button>
            </div>

            <div aria-live="polite" className="sr-only">
              {displayedSnapshot
                ? `Totals updated: gross ${displayedSnapshot.totals.grossEarnings.toFixed(2)}, expenses ${displayedSnapshot.totals.businessExpenses.toFixed(2)}, operating net ${displayedSnapshot.totals.operatingNet.toFixed(2)}`
                : "No stub preview loaded."}
            </div>
          </CardContent>
        </Card>

        {listError ? (
          <Card className="border-destructive/40 bg-destructive/10 rounded-2xl">
            <CardContent className="text-destructive p-4 text-sm">
              Failed to load stubs: {listError}
            </CardContent>
          </Card>
        ) : null}

        {previewError ? (
          <Card className="border-destructive/40 bg-destructive/10 rounded-2xl">
            <CardContent className="text-destructive p-4 text-sm">
              Failed to refresh totals: {previewError}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border bg-card/95 rounded-3xl shadow-lg">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl">Stub History</CardTitle>
              <Button asChild type="button" variant="outline" size="sm">
                <Link to="/dashboard/stubs/history">View all history</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <StubHistoryTable
              stubs={paginatedHistory}
              totalCount={historyStubs.length}
              lockPendingId={lockPendingId}
              onLock={handleLockStub}
              isLoading={stubsQuery.isLoading}
              emptyMessage="No saved stubs yet. Generate your first statement above."
            />
            <DashboardPaginationControls
              className="mt-2"
              page={historyPage}
              totalPages={historyPageCount}
              onPageChange={goToHistoryPage}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

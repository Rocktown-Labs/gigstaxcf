import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  PencilLine,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AdminCreditPackManager } from "@/components/dashboard/admin/admin-credit-pack-manager";
import { AdminDiscountManager } from "@/components/dashboard/admin/admin-discount-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";

interface AdminPricingPlan {
  aiCreditLimit: number | null;
  billingInterval: "month" | "year" | null;
  bulkBatchLimit: number | null;
  bulkMaxImagesPerBatch: number | null;
  currencyCode: string;
  description: string;
  displayName: string;
  features: string[];
  id: number;
  isActive: boolean;
  lastSyncedAt: string | null;
  planTier: "free" | "starter" | "driver" | "pro_driver";
  polarPriceId: string | null;
  polarProductId: string | null;
  priceCents: number;
  slug: string;
  sortOrder: number;
}

interface PlanDraft {
  aiCreditLimit: string;
  bulkBatchLimit: string;
  bulkMaxImagesPerBatch: string;
  description: string;
  displayName: string;
  features: string;
  isActive: boolean;
  priceCents: string;
  sortOrder: string;
}

interface SyncResultPayload {
  checkoutDiagnostics?: {
    planMappings?: {
      dbProductId?: string | null;
      envProductId?: string | null;
      envVar?: string;
      productId?: string | null;
      slug: string;
      source: "db" | "env" | "missing";
    }[];
    polarServer?: "production" | "sandbox";
    warnings?: string[];
  };
  errors?: string[];
  packResults?: {
    slug: string;
    syncAction?: "created" | "recreated" | "updated";
  }[];
  planResults?: {
    slug: string;
    syncAction?: "created" | "recreated" | "updated";
  }[];
  polarServer?: "production" | "sandbox";
  syncedMeterResults?: unknown[];
}

interface OnboardingOfferPayload {
  checkoutDiagnostics?: {
    planMappings?: {
      productId?: string | null;
      slug: string;
      source: "db" | "env" | "missing";
    }[];
    warnings?: string[];
  };
  offer?: {
    active: boolean;
    code: string;
    discountId: string;
    lastSyncedAt: string | null;
    productId: string;
    updatedAt: string;
  } | null;
  polarConfigured?: boolean;
  polarServer?: "production" | "sandbox";
  reused?: boolean;
}

type PlanSyncState = "needs_sync" | "not_required" | "synced";

const EMPTY_PLAN_DRAFT: PlanDraft = {
  aiCreditLimit: "",
  bulkBatchLimit: "",
  bulkMaxImagesPerBatch: "",
  description: "",
  displayName: "",
  features: "",
  isActive: true,
  priceCents: "0",
  sortOrder: "0",
};

const PLAN_TIER_LABELS: Record<AdminPricingPlan["planTier"], string> = {
  driver: "Driver",
  free: "Legacy Free",
  pro_driver: "Pro Driver",
  starter: "Starter",
};

function toDraft(plan: AdminPricingPlan): PlanDraft {
  return {
    aiCreditLimit:
      plan.aiCreditLimit === null ? "" : String(plan.aiCreditLimit),
    bulkBatchLimit:
      plan.bulkBatchLimit === null ? "" : String(plan.bulkBatchLimit),
    bulkMaxImagesPerBatch:
      plan.bulkMaxImagesPerBatch === null
        ? ""
        : String(plan.bulkMaxImagesPerBatch),
    description: plan.description || "",
    displayName: plan.displayName || "",
    features: (plan.features || []).join(", "),
    isActive: plan.isActive,
    priceCents: String(plan.priceCents || 0),
    sortOrder: String(plan.sortOrder || 0),
  };
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPlanDirty(plan: AdminPricingPlan, draft: PlanDraft) {
  const baseline = toDraft(plan);

  return (
    baseline.displayName !== draft.displayName ||
    baseline.priceCents !== draft.priceCents ||
    baseline.aiCreditLimit !== draft.aiCreditLimit ||
    baseline.bulkBatchLimit !== draft.bulkBatchLimit ||
    baseline.bulkMaxImagesPerBatch !== draft.bulkMaxImagesPerBatch ||
    baseline.sortOrder !== draft.sortOrder ||
    baseline.description !== draft.description ||
    baseline.features !== draft.features ||
    baseline.isActive !== draft.isActive
  );
}

function formatPlanPrice(plan: AdminPricingPlan) {
  const amount = plan.priceCents / 100;

  try {
    const formatted = new Intl.NumberFormat("en-US", {
      currency: plan.currencyCode || "USD",
      style: "currency",
    }).format(amount);

    return plan.billingInterval
      ? `${formatted} / ${plan.billingInterval}`
      : formatted;
  } catch {
    const fallback = `$${amount.toFixed(2)}`;
    return plan.billingInterval
      ? `${fallback} / ${plan.billingInterval}`
      : fallback;
  }
}

function formatLimitValue(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function formatShortId(value: string | null) {
  if (!value) {
    return "not set";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatLastSyncedAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "never";
}

function isPaidRecurringPlan(plan: AdminPricingPlan) {
  return (
    plan.planTier !== "free" && plan.billingInterval !== null && plan.isActive
  );
}

function getPlanSyncState(plan: AdminPricingPlan): PlanSyncState {
  if (!isPaidRecurringPlan(plan)) {
    return "not_required";
  }

  if (plan.polarPriceId && plan.polarProductId && plan.lastSyncedAt) {
    return "synced";
  }

  return "needs_sync";
}

function SyncStateBadge({ state }: { state: PlanSyncState }) {
  if (state === "synced") {
    return (
      <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Synced
      </Badge>
    );
  }

  if (state === "needs_sync") {
    return (
      <Badge className="gap-1 border-amber-500/35 bg-amber-500/15 text-amber-300">
        <AlertCircle className="h-3 w-3" />
        Needs Sync
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <MinusCircle className="h-3 w-3" />
      Not Required
    </Badge>
  );
}

const omitDraftKey = (
  record: Record<number, PlanDraft>,
  key: number
): Record<number, PlanDraft> => {
  const next: Record<number, PlanDraft> = {};
  for (const [recordKey, value] of Object.entries(record)) {
    if (Number(recordKey) !== key) {
      next[Number(recordKey)] = value;
    }
  }
  return next;
};

export function AdminPricingPageClient() {
  const queryClient = useQueryClient();
  const [draftsById, setDraftsById] = useState<Record<number, PlanDraft>>({});
  const [feedback, setFeedback] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [syncSummary, setSyncSummary] = useState<string>("");
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [offerFeedback, setOfferFeedback] = useState<string>("");
  const [offerError, setOfferError] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  const plansQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/admin/pricing/plans");
      if (!response.ok) {
        throw new Error("Failed to load plans");
      }

      const payload = (await response.json()) as { plans: AdminPricingPlan[] };
      return payload.plans || [];
    },
    queryKey: ["admin-pricing-plans"],
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const onboardingOfferQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/admin/pricing/offer");
      if (!response.ok) {
        throw new Error("Failed to load onboarding offer");
      }

      return (await response.json()) as OnboardingOfferPayload;
    },
    queryKey: ["admin-onboarding-offer"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const sortedPlans = useMemo(() => {
    const plans = plansQuery.data ?? [];
    return [...plans].sort((left, right) => left.sortOrder - right.sortOrder);
  }, [plansQuery.data]);

  const selectedPlan = useMemo(() => {
    if (selectedPlanId === null) {
      return null;
    }

    return sortedPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  }, [selectedPlanId, sortedPlans]);

  const patchMutation = useMutation({
    mutationFn: async (args: {
      id: number;
      patch: Record<string, unknown>;
    }) => {
      const response = await apiFetch(`/api/admin/pricing/plans/${args.id}`, {
        body: JSON.stringify(args.patch),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        plan?: AdminPricingPlan;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save plan");
      }

      if (!payload.plan) {
        throw new Error("Failed to save plan");
      }

      return payload.plan;
    },
    onSuccess: (updatedPlan) => {
      queryClient.setQueryData<AdminPricingPlan[]>(
        ["admin-pricing-plans"],
        (current) => {
          const plans = current ?? [];
          return plans.map((plan) =>
            plan.id === updatedPlan.id ? updatedPlan : plan
          );
        }
      );
      setDraftsById((current) => omitDraftKey(current, updatedPlan.id));
      setFeedback("Plan updated.");
      setError("");
      setSyncErrors([]);
      setSyncSummary("");
      setSyncWarnings([]);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/admin/pricing/sync", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: SyncResultPayload;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to sync pricing");
      }

      return payload.result;
    },
    onError: (mutationError: unknown) => {
      setFeedback("");
      setSyncErrors([]);
      setSyncSummary("");
      setSyncWarnings([]);
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to sync pricing"
      );
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-pricing-plans"],
      });
      const planCount = result?.planResults?.length || 0;
      const packCount = result?.packResults?.length || 0;
      const meterCount = result?.syncedMeterResults?.length || 0;
      const errors = result?.errors || [];
      const warnings = result?.checkoutDiagnostics?.warnings || [];
      const repairedPlans =
        result?.planResults?.filter((plan) => plan.syncAction === "recreated")
          .length || 0;
      const repairedPacks =
        result?.packResults?.filter((pack) => pack.syncAction === "recreated")
          .length || 0;
      const envWarnings =
        result?.checkoutDiagnostics?.planMappings
          ?.filter(
            (mapping) =>
              mapping.source === "env" &&
              mapping.dbProductId &&
              mapping.envProductId &&
              mapping.dbProductId !== mapping.envProductId
          )
          .map(
            (mapping) =>
              `${mapping.slug} is using ${mapping.envVar || "an env product ID"} instead of the synced database product.`
          ) || [];
      if (errors.length > 0) {
        setSyncErrors(errors);
        setError(`Sync completed with ${errors.length} errors.`);
      } else {
        setSyncErrors([]);
        setError("");
      }
      setSyncSummary(
        `Polar ${result?.polarServer || result?.checkoutDiagnostics?.polarServer || "production"} sync repaired ${repairedPlans} plans and ${repairedPacks} packs.`
      );
      setSyncWarnings([...warnings, ...envWarnings]);
      setFeedback(
        `Synced ${planCount} plans, ${packCount} packs, and ${meterCount} meters.`
      );
    },
  });

  const onboardingOfferMutation = useMutation({
    mutationFn: async (regenerate: boolean) => {
      const response = await apiFetch("/api/admin/pricing/offer", {
        body: JSON.stringify({ regenerate }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        | OnboardingOfferPayload
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload
            ? payload.error || "Failed to sync onboarding offer"
            : "Failed to sync onboarding offer"
        );
      }

      return payload as OnboardingOfferPayload;
    },
    onError: (mutationError: unknown) => {
      setOfferFeedback("");
      setOfferError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to sync onboarding offer"
      );
    },
    onSuccess: async (result, regenerate) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-onboarding-offer"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-pricing-discounts"],
      });
      setOfferError("");
      setOfferFeedback(
        result.reused && !regenerate
          ? "Using the current active Starter onboarding offer."
          : "Starter onboarding offer synced to Polar."
      );
    },
  });

  const resolveDraft = (plan: AdminPricingPlan) =>
    draftsById[plan.id] || toDraft(plan);

  const setDraftValue = (planId: number, patch: Partial<PlanDraft>) => {
    setDraftsById((current) => {
      const plan = (plansQuery.data ?? []).find((item) => item.id === planId);
      const currentDraft =
        current[planId] || (plan ? toDraft(plan) : EMPTY_PLAN_DRAFT);

      return {
        ...current,
        [planId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const savePlan = async (plan: AdminPricingPlan) => {
    const draft = resolveDraft(plan);

    const patch = {
      aiCreditLimit: toNumberOrNull(draft.aiCreditLimit),
      bulkBatchLimit: toNumberOrNull(draft.bulkBatchLimit),
      bulkMaxImagesPerBatch: toNumberOrNull(draft.bulkMaxImagesPerBatch),
      description: draft.description.trim(),
      displayName: draft.displayName.trim(),
      features: draft.features
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
      isActive: draft.isActive,
      priceCents: Math.max(0, Number.parseInt(draft.priceCents, 10) || 0),
      sortOrder: Math.max(0, Number.parseInt(draft.sortOrder, 10) || 0),
    };

    await patchMutation.mutateAsync({
      id: plan.id,
      patch,
    });
  };

  const openEditor = (planId: number) => {
    setSelectedPlanId(planId);
    setIsEditorOpen(true);
  };

  const handleEditorOpenChange = (open: boolean) => {
    setIsEditorOpen(open);

    if (!open) {
      setSelectedPlanId(null);
    }
  };

  const selectedPlanDraft = selectedPlan ? resolveDraft(selectedPlan) : null;
  const selectedPlanDirty =
    selectedPlan && selectedPlanDraft
      ? isPlanDirty(selectedPlan, selectedPlanDraft)
      : false;

  return (
    <div className="space-y-4">
      {feedback ? (
        <p className="bg-primary/10 text-primary rounded-lg p-3 text-sm">
          {feedback}
        </p>
      ) : null}
      {syncSummary ? (
        <p className="border-primary/30 bg-primary/5 text-foreground rounded-lg border p-3 text-sm">
          {syncSummary}
        </p>
      ) : null}
      {error ? (
        <div className="bg-destructive/10 text-destructive space-y-2 rounded-lg p-3 text-sm">
          <p>{error}</p>
          {syncErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {syncErrors.map((syncError) => (
                <li key={syncError}>{syncError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {syncWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">Polar configuration warnings</p>
          <ul className="mt-2 list-disc pl-5">
            {syncWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Pricing Catalog
        </p>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={syncMutation.isPending}
          onClick={() => {
            syncMutation.mutate();
          }}
        >
          {syncMutation.isPending
            ? "Syncing..."
            : "Sync Pricing + Meters to Polar"}
        </Button>
      </div>

      <div className="border-border/60 bg-card/50 rounded-2xl border p-4 shadow-lg shadow-black/10">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              Onboarding Offer
            </p>
            <h3 className="text-foreground text-lg font-semibold">
              Starter first month free
            </h3>
            <p className="text-muted-foreground max-w-2xl text-sm">
              This code is sent in the abandoned-onboarding lifecycle email and
              targets the Starter Monthly Polar product.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={
                onboardingOfferQuery.isLoading ||
                onboardingOfferMutation.isPending
              }
              onClick={() => onboardingOfferMutation.mutate(false)}
            >
              {onboardingOfferMutation.isPending ? "Syncing..." : "Sync Offer"}
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={
                onboardingOfferQuery.isLoading ||
                onboardingOfferMutation.isPending
              }
              onClick={() => onboardingOfferMutation.mutate(true)}
            >
              Regenerate Code
            </Button>
          </div>
        </div>

        {offerFeedback ? (
          <p className="bg-primary/10 text-primary mt-3 rounded-lg p-3 text-sm">
            {offerFeedback}
          </p>
        ) : null}
        {offerError ? (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-lg p-3 text-sm">
            {offerError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="border-border/60 bg-background/35 rounded-xl border p-3">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Polar Server
            </p>
            <p className="mt-1 text-sm font-semibold">
              {onboardingOfferQuery.data?.polarServer || "production"}
            </p>
          </div>
          <div className="border-border/60 bg-background/35 rounded-xl border p-3">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Offer Code
            </p>
            <p className="mt-1 text-sm font-semibold">
              {onboardingOfferQuery.data?.offer?.code || "not created"}
            </p>
          </div>
          <div className="border-border/60 bg-background/35 rounded-xl border p-3">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Active
            </p>
            <p className="mt-1 text-sm font-semibold">
              {onboardingOfferQuery.data?.offer?.active ? "Yes" : "No"}
            </p>
          </div>
          <div className="border-border/60 bg-background/35 rounded-xl border p-3">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Last Synced
            </p>
            <p className="mt-1 text-sm font-semibold">
              {formatLastSyncedAt(
                onboardingOfferQuery.data?.offer?.lastSyncedAt || null
              )}
            </p>
          </div>
        </div>

        <div className="border-border/60 bg-background/35 text-muted-foreground mt-3 rounded-xl border p-3 text-xs">
          <p>
            Starter product:{" "}
            {onboardingOfferQuery.data?.offer?.productId ||
              onboardingOfferQuery.data?.checkoutDiagnostics?.planMappings?.find(
                (mapping) => mapping.slug === "starter-monthly"
              )?.productId ||
              "missing"}
          </p>
          <p className="mt-1">
            Discount id:{" "}
            {onboardingOfferQuery.data?.offer?.discountId || "not created"}
          </p>
        </div>

        {onboardingOfferQuery.data?.checkoutDiagnostics?.warnings?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-200">
            {onboardingOfferQuery.data.checkoutDiagnostics.warnings.map(
              (warning) => (
                <li key={warning}>{warning}</li>
              )
            )}
          </ul>
        ) : null}
      </div>

      {plansQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">
          Loading pricing plans...
        </p>
      ) : null}
      {plansQuery.isError ? (
        <p className="text-destructive text-sm">
          Failed to load pricing plans.
        </p>
      ) : null}

      {!plansQuery.isLoading && !plansQuery.isError ? (
        <div className="-mx-1 overflow-x-auto pb-2">
          <div className="flex snap-x snap-mandatory gap-4 px-1">
            {sortedPlans.map((plan) => {
              const syncState = getPlanSyncState(plan);

              return (
                <article
                  key={plan.id}
                  className="border-border/60 from-card to-card/70 w-[320px] shrink-0 snap-start rounded-2xl border bg-gradient-to-b p-4 shadow-lg shadow-black/15"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base leading-tight font-semibold">
                        {plan.displayName}
                      </p>
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {plan.slug}
                      </p>
                    </div>
                    <Badge variant={plan.isActive ? "default" : "outline"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-2">
                    <p className="text-xl font-bold">{formatPlanPrice(plan)}</p>
                    <p className="text-muted-foreground text-xs">
                      {PLAN_TIER_LABELS[plan.planTier]}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="border-border/60 bg-background/40 rounded-lg border px-2 py-2">
                      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        AI
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatLimitValue(plan.aiCreditLimit)}
                      </p>
                    </div>
                    <div className="border-border/60 bg-background/40 rounded-lg border px-2 py-2">
                      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        Batches
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatLimitValue(plan.bulkBatchLimit)}
                      </p>
                    </div>
                    <div className="border-border/60 bg-background/40 rounded-lg border px-2 py-2">
                      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        Images
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatLimitValue(plan.bulkMaxImagesPerBatch)}
                      </p>
                    </div>
                  </div>

                  <div className="border-border/60 bg-background/35 mt-4 rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        Polar Sync
                      </p>
                      <SyncStateBadge state={syncState} />
                    </div>
                    <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                      <p>Product: {formatShortId(plan.polarProductId)}</p>
                      <p>Price: {formatShortId(plan.polarPriceId)}</p>
                      <p>
                        Last synced: {formatLastSyncedAt(plan.lastSyncedAt)}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full rounded-xl"
                    onClick={() => {
                      openEditor(plan.id);
                    }}
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit Plan
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <Sheet open={isEditorOpen} onOpenChange={handleEditorOpenChange}>
        <SheetContent
          side="right"
          className="border-border/70 bg-background w-full overflow-y-auto px-0 sm:max-w-2xl"
        >
          {selectedPlan && selectedPlanDraft ? (
            <>
              <SheetHeader className="border-border/60 space-y-3 border-b px-6 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-xl font-bold">
                    {selectedPlan.displayName}
                  </SheetTitle>
                  <Badge
                    variant={selectedPlan.isActive ? "default" : "outline"}
                  >
                    {selectedPlan.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <SyncStateBadge state={getPlanSyncState(selectedPlan)} />
                </div>
                <SheetDescription>
                  Edit plan pricing, limits, and Polar metadata for
                  {` ${selectedPlan.slug}.`}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Display Name
                    </p>
                    <Input
                      value={selectedPlanDraft.displayName}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          displayName: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Price (cents)
                    </p>
                    <Input
                      type="number"
                      value={selectedPlanDraft.priceCents}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          priceCents: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      AI Credit Limit
                    </p>
                    <Input
                      type="number"
                      placeholder="blank = unlimited"
                      value={selectedPlanDraft.aiCreditLimit}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          aiCreditLimit: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Bulk Batch Limit
                    </p>
                    <Input
                      type="number"
                      placeholder="blank = unlimited"
                      value={selectedPlanDraft.bulkBatchLimit}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          bulkBatchLimit: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Max Images / Batch
                    </p>
                    <Input
                      type="number"
                      placeholder="blank = unlimited"
                      value={selectedPlanDraft.bulkMaxImagesPerBatch}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          bulkMaxImagesPerBatch: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium">
                      Sort Order
                    </p>
                    <Input
                      type="number"
                      value={selectedPlanDraft.sortOrder}
                      onChange={(event) =>
                        setDraftValue(selectedPlan.id, {
                          sortOrder: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Description
                  </p>
                  <Input
                    value={selectedPlanDraft.description}
                    onChange={(event) =>
                      setDraftValue(selectedPlan.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Features (comma separated)
                  </p>
                  <Input
                    value={selectedPlanDraft.features}
                    onChange={(event) =>
                      setDraftValue(selectedPlan.id, {
                        features: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="text-muted-foreground flex items-center gap-3 text-sm">
                  <Switch
                    checked={selectedPlanDraft.isActive}
                    onCheckedChange={(checked) => {
                      setDraftValue(selectedPlan.id, {
                        isActive: checked,
                      });
                    }}
                  />
                  Plan is active
                </div>

                <div className="border-border/60 bg-background/35 text-muted-foreground rounded-xl border p-3 text-xs">
                  <p>
                    Polar Product: {selectedPlan.polarProductId || "not set"}
                  </p>
                  <p className="mt-1">
                    Polar Price: {selectedPlan.polarPriceId || "not set"}
                  </p>
                  <p className="mt-1">
                    Last synced: {formatLastSyncedAt(selectedPlan.lastSyncedAt)}
                  </p>
                </div>
              </div>

              <SheetFooter className="border-border/60 border-t px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    handleEditorOpenChange(false);
                  }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={patchMutation.isPending || !selectedPlanDirty}
                  onClick={async () => {
                    try {
                      await savePlan(selectedPlan);
                    } catch (mutationError: unknown) {
                      setFeedback("");
                      setSyncErrors([]);
                      setError(
                        mutationError instanceof Error
                          ? mutationError.message
                          : "Failed to update plan"
                      );
                    }
                  }}
                >
                  {patchMutation.isPending ? "Saving..." : "Save Plan"}
                </Button>
              </SheetFooter>
            </>
          ) : (
            <div className="text-muted-foreground px-6 py-8 text-sm">
              Select a plan from the card rail to edit pricing details.
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AdminDiscountManager />
      <AdminCreditPackManager />
    </div>
  );
}

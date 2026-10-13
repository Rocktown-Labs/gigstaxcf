import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLine, Plus, TimerReset, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface AdminDiscountTarget {
  id: string;
  kind: "pack" | "plan";
  label: string;
  priceLabel: string;
  slug: string;
}

interface AdminDiscountRecord {
  amount: number | null;
  appliesToAllProducts: boolean;
  basisPoints: number | null;
  code: string | null;
  createdAt: string;
  currency: string | null;
  duration: "forever" | "once" | "repeating";
  durationInMonths: number | null;
  endsAt: string | null;
  id: string;
  isActive: boolean;
  managedBy: "onboarding_offer" | null;
  maxRedemptions: number | null;
  modifiedAt: string | null;
  name: string;
  productIds: string[];
  productNames: string[];
  redemptionsCount: number;
  startsAt: string | null;
  type: "fixed" | "percentage";
}

interface DiscountStatePayload {
  discounts: AdminDiscountRecord[];
  polarConfigured: boolean;
  polarServer: "production" | "sandbox";
  targets: AdminDiscountTarget[];
}

interface DiscountDraft {
  amount: string;
  appliesToAllProducts: boolean;
  basisPoints: string;
  code: string;
  duration: "forever" | "once" | "repeating";
  durationInMonths: string;
  endsAt: string;
  maxRedemptions: string;
  name: string;
  productIds: string[];
  startsAt: string;
  type: "fixed" | "percentage";
}

const EMPTY_DRAFT: DiscountDraft = {
  amount: "100",
  appliesToAllProducts: true,
  basisPoints: "1000",
  code: "",
  duration: "once",
  durationInMonths: "",
  endsAt: "",
  maxRedemptions: "",
  name: "",
  productIds: [],
  startsAt: "",
  type: "fixed",
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toDraft(discount?: AdminDiscountRecord | null): DiscountDraft {
  if (!discount) {
    return EMPTY_DRAFT;
  }

  return {
    amount: discount.amount === null ? "100" : String(discount.amount),
    appliesToAllProducts: discount.appliesToAllProducts,
    basisPoints:
      discount.basisPoints === null ? "1000" : String(discount.basisPoints),
    code: discount.code || "",
    duration: discount.duration,
    durationInMonths:
      discount.durationInMonths === null
        ? ""
        : String(discount.durationInMonths),
    endsAt: toLocalDateTimeInput(discount.endsAt),
    maxRedemptions:
      discount.maxRedemptions === null ? "" : String(discount.maxRedemptions),
    name: discount.name,
    productIds: discount.productIds,
    startsAt: toLocalDateTimeInput(discount.startsAt),
    type: discount.type,
  };
}

function formatDiscountValue(discount: AdminDiscountRecord) {
  if (discount.type === "percentage") {
    return `${(discount.basisPoints || 0) / 100}% off`;
  }

  const amount = (discount.amount || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    currency: (discount.currency || "USD").toUpperCase(),
    style: "currency",
  }).format(amount);
}

function formatDuration(discount: AdminDiscountRecord) {
  if (discount.duration === "repeating") {
    return `${discount.durationInMonths || 1} months`;
  }

  return discount.duration === "once" ? "Once" : "Forever";
}

function formatDateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function toIsoOrNull(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildPayload(draft: DiscountDraft) {
  return {
    amount: draft.type === "fixed" ? Number.parseInt(draft.amount, 10) : null,
    appliesToAllProducts: draft.appliesToAllProducts,
    basisPoints:
      draft.type === "percentage"
        ? Number.parseInt(draft.basisPoints, 10)
        : null,
    code: draft.code.trim() || null,
    duration: draft.duration,
    durationInMonths:
      draft.duration === "repeating"
        ? Number.parseInt(draft.durationInMonths, 10)
        : null,
    endsAt: toIsoOrNull(draft.endsAt),
    maxRedemptions: draft.maxRedemptions
      ? Number.parseInt(draft.maxRedemptions, 10)
      : null,
    name: draft.name.trim(),
    productIds: draft.productIds,
    startsAt: toIsoOrNull(draft.startsAt),
    type: draft.type,
  };
}

function isDraftSubmittable(draft: DiscountDraft) {
  if (!draft.name.trim()) {
    return false;
  }

  if (!draft.appliesToAllProducts && draft.productIds.length === 0) {
    return false;
  }

  if (draft.type === "fixed") {
    const amount = Number.parseInt(draft.amount, 10);
    if (!Number.isInteger(amount) || amount < 1) {
      return false;
    }
  }

  if (draft.type === "percentage") {
    const basisPoints = Number.parseInt(draft.basisPoints, 10);
    if (
      !Number.isInteger(basisPoints) ||
      basisPoints < 1 ||
      basisPoints > 10_000
    ) {
      return false;
    }
  }

  if (draft.duration === "repeating") {
    const months = Number.parseInt(draft.durationInMonths, 10);
    if (!Number.isInteger(months) || months < 1) {
      return false;
    }
  }

  return true;
}

function isDraftDirty(
  baseline: AdminDiscountRecord | null,
  draft: DiscountDraft
) {
  if (!baseline) {
    return true;
  }

  const comparison = toDraft(baseline);
  return JSON.stringify(comparison) !== JSON.stringify(draft);
}

function toggleTargetId(draft: DiscountDraft, productId: string) {
  return draft.productIds.includes(productId)
    ? draft.productIds.filter((id) => id !== productId)
    : [...draft.productIds, productId];
}

export function AdminDiscountManager() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<{
    action: "expire" | "delete";
    id: string;
  } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(
    null
  );
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DRAFT);

  const discountsQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/admin/pricing/discounts");
      if (!response.ok) {
        throw new Error("Failed to load discounts");
      }

      return (await response.json()) as DiscountStatePayload;
    },
    queryKey: ["admin-pricing-discounts"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const selectedDiscount = useMemo(() => {
    if (!selectedDiscountId) {
      return null;
    }

    return (
      discountsQuery.data?.discounts.find(
        (discount) => discount.id === selectedDiscountId
      ) || null
    );
  }, [discountsQuery.data?.discounts, selectedDiscountId]);

  const sortedDiscounts = useMemo(
    () =>
      [...(discountsQuery.data?.discounts || [])].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
    [discountsQuery.data?.discounts]
  );

  const saveMutation = useMutation({
    mutationFn: async (args: {
      discountId?: string;
      payload: ReturnType<typeof buildPayload>;
    }) => {
      const response = await apiFetch(
        args.discountId
          ? `/api/admin/pricing/discounts/${args.discountId}`
          : "/api/admin/pricing/discounts",
        {
          body: JSON.stringify(args.payload),
          headers: { "Content-Type": "application/json" },
          method: args.discountId ? "PATCH" : "POST",
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        discount?: AdminDiscountRecord;
        error?: string;
      };

      if (!response.ok || !payload.discount) {
        throw new Error(payload.error || "Failed to save discount");
      }

      return payload.discount;
    },
    onSuccess: async (discount, args) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-pricing-discounts"],
      });
      setError("");
      setFeedback(args.discountId ? "Discount updated." : "Discount created.");
      setSelectedDiscountId(discount.id);
      setDraft(toDraft(discount));
      setIsEditorOpen(false);
    },
  });

  const expireMutation = useMutation({
    mutationFn: async (discountId: string) => {
      const response = await apiFetch(
        `/api/admin/pricing/discounts/${discountId}/expire`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        discount?: AdminDiscountRecord;
        error?: string;
      };

      if (!response.ok || !payload.discount) {
        throw new Error(payload.error || "Failed to expire discount");
      }

      return payload.discount;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-pricing-discounts"],
      });
      setError("");
      setFeedback("Discount expired.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (discountId: string) => {
      const response = await apiFetch(
        `/api/admin/pricing/discounts/${discountId}`,
        {
          method: "DELETE",
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        deleted?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Failed to delete discount");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-pricing-discounts"],
      });
      setError("");
      setFeedback("Discount deleted.");
    },
  });

  const openCreate = () => {
    setSelectedDiscountId(null);
    setDraft(EMPTY_DRAFT);
    setError("");
    setFeedback("");
    setIsEditorOpen(true);
  };

  const openEdit = (discount: AdminDiscountRecord) => {
    setSelectedDiscountId(discount.id);
    setDraft(toDraft(discount));
    setError("");
    setFeedback("");
    setIsEditorOpen(true);
  };

  const submitDisabled =
    saveMutation.isPending ||
    !isDraftSubmittable(draft) ||
    (selectedDiscount ? !isDraftDirty(selectedDiscount, draft) : false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            Discounts
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Create and manage general Polar discounts across synced plans and AI
            packs.
          </p>
        </div>
        <Button type="button" className="rounded-xl" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Discount
        </Button>
      </div>

      {feedback ? (
        <p className="bg-primary/10 text-primary rounded-lg p-3 text-sm">
          {feedback}
        </p>
      ) : null}

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </p>
      ) : null}

      {discountsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading discounts...</p>
      ) : null}

      {discountsQuery.isError ? (
        <p className="text-destructive text-sm">Failed to load discounts.</p>
      ) : null}

      {discountsQuery.data && !discountsQuery.data.polarConfigured ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Polar discount controls are unavailable until `POLAR_ACCESS_TOKEN` is
          configured.
        </div>
      ) : null}

      {!discountsQuery.isLoading && !discountsQuery.isError ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedDiscounts.length === 0 ? (
            <div className="border-border/60 bg-card/30 text-muted-foreground rounded-2xl border border-dashed p-6 text-sm">
              No discounts exist yet. Create one to start managing promo codes
              across synced billing products.
            </div>
          ) : null}

          {sortedDiscounts.map((discount) => (
            <article
              key={discount.id}
              className="border-border/60 from-card to-card/70 rounded-2xl border bg-gradient-to-b p-4 shadow-lg shadow-black/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold">
                      {discount.name}
                    </p>
                    <Badge variant={discount.isActive ? "default" : "outline"}>
                      {discount.isActive ? "Active" : "Expired"}
                    </Badge>
                    {discount.managedBy === "onboarding_offer" ? (
                      <Badge className="border-primary/30 bg-primary/10 text-primary">
                        Managed by onboarding offer
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {discount.code || "Auto-applied or unnamed code"}
                  </p>
                </div>

                <div className="border-border/60 bg-background/40 rounded-xl border px-3 py-2 text-right">
                  <p className="text-sm font-semibold">
                    {formatDiscountValue(discount)}
                  </p>
                  <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    {formatDuration(discount)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border-border/60 bg-background/35 rounded-xl border p-3">
                  <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Applies To
                  </p>
                  <p className="mt-2 text-sm">
                    {discount.appliesToAllProducts
                      ? "All synced products"
                      : discount.productNames.join(", ")}
                  </p>
                </div>
                <div className="border-border/60 bg-background/35 rounded-xl border p-3">
                  <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Redemptions
                  </p>
                  <p className="mt-2 text-sm">
                    {discount.redemptionsCount}
                    {discount.maxRedemptions
                      ? ` / ${discount.maxRedemptions}`
                      : " used"}
                  </p>
                </div>
                <div className="border-border/60 bg-background/35 rounded-xl border p-3">
                  <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Starts
                  </p>
                  <p className="mt-2 text-sm">
                    {formatDateLabel(discount.startsAt)}
                  </p>
                </div>
                <div className="border-border/60 bg-background/35 rounded-xl border p-3">
                  <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                    Ends
                  </p>
                  <p className="mt-2 text-sm">
                    {formatDateLabel(discount.endsAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => openEdit(discount)}
                >
                  <PencilLine className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={
                    expireMutation.isPending ||
                    discount.managedBy === "onboarding_offer" ||
                    !discount.isActive
                  }
                  onClick={async () => {
                    const isConfirming =
                      confirmingAction?.action === "expire" &&
                      confirmingAction.id === discount.id;
                    if (!isConfirming) {
                      setConfirmingAction({
                        action: "expire",
                        id: discount.id,
                      });
                      return;
                    }
                    setConfirmingAction(null);

                    try {
                      await expireMutation.mutateAsync(discount.id);
                    } catch (mutationError: unknown) {
                      setFeedback("");
                      setError(
                        mutationError instanceof Error
                          ? mutationError.message
                          : "Failed to expire discount"
                      );
                    }
                  }}
                >
                  <TimerReset className="h-4 w-4" />
                  {confirmingAction?.action === "expire" &&
                  confirmingAction.id === discount.id
                    ? "Confirm Expire?"
                    : "Expire"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive rounded-xl"
                  disabled={
                    deleteMutation.isPending ||
                    discount.managedBy === "onboarding_offer"
                  }
                  onClick={async () => {
                    const isConfirming =
                      confirmingAction?.action === "delete" &&
                      confirmingAction.id === discount.id;
                    if (!isConfirming) {
                      setConfirmingAction({
                        action: "delete",
                        id: discount.id,
                      });
                      return;
                    }
                    setConfirmingAction(null);

                    try {
                      await deleteMutation.mutateAsync(discount.id);
                    } catch (mutationError: unknown) {
                      setFeedback("");
                      setError(
                        mutationError instanceof Error
                          ? mutationError.message
                          : "Failed to delete discount"
                      );
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmingAction?.action === "delete" &&
                  confirmingAction.id === discount.id
                    ? "Confirm Delete?"
                    : "Delete"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <Sheet
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            setSelectedDiscountId(null);
            setDraft(EMPTY_DRAFT);
          }
        }}
      >
        <SheetContent
          side="right"
          className="border-border/70 bg-background w-full overflow-y-auto px-0 sm:max-w-3xl"
        >
          <SheetHeader className="border-border/60 space-y-3 border-b px-6 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-xl font-bold">
                {selectedDiscount ? selectedDiscount.name : "Create Discount"}
              </SheetTitle>
              {selectedDiscount ? (
                <Badge
                  variant={selectedDiscount.isActive ? "default" : "outline"}
                >
                  {selectedDiscount.isActive ? "Active" : "Expired"}
                </Badge>
              ) : null}
            </div>
            <SheetDescription>
              Create percent or fixed discounts, apply them to all synced
              products or target specific plans and AI packs, and control
              redemption windows from one place.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Name
                </p>
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Code
                </p>
                <Input
                  placeholder="Leave blank if you do not need a code"
                  value={draft.code}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Type
                </p>
                <Select
                  value={draft.type}
                  onValueChange={(value: "fixed" | "percentage") =>
                    setDraft((current) => ({
                      ...current,
                      type: value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Duration
                </p>
                <Select
                  value={draft.duration}
                  onValueChange={(value: "forever" | "once" | "repeating") =>
                    setDraft((current) => ({
                      ...current,
                      duration: value,
                      durationInMonths:
                        value === "repeating"
                          ? current.durationInMonths || "3"
                          : "",
                    }))
                  }
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                    <SelectItem value="repeating">Repeating</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.type === "fixed" ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Amount (cents)
                  </p>
                  <Input
                    type="number"
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Basis Points
                  </p>
                  <Input
                    type="number"
                    value={draft.basisPoints}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        basisPoints: event.target.value,
                      }))
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    1000 = 10%, 2500 = 25%, 10000 = 100%.
                  </p>
                </div>
              )}

              {draft.duration === "repeating" ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Duration in Months
                  </p>
                  <Input
                    type="number"
                    value={draft.durationInMonths}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        durationInMonths: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Max Redemptions
                </p>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={draft.maxRedemptions}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxRedemptions: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Starts At
                </p>
                <Input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      startsAt: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Ends At
                </p>
                <Input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      endsAt: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="border-border/60 bg-background/35 rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Product Targets</p>
                  <p className="text-muted-foreground text-xs">
                    Apply this discount everywhere or pin it to specific plans
                    and AI packs.
                  </p>
                </div>
                <div className="text-muted-foreground flex items-center gap-3 text-sm">
                  <Switch
                    checked={draft.appliesToAllProducts}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        appliesToAllProducts: checked,
                        productIds: checked ? [] : current.productIds,
                      }))
                    }
                  />
                  All synced products
                </div>
              </div>

              {draft.appliesToAllProducts ? null : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(discountsQuery.data?.targets || []).map((target) => {
                    const checked = draft.productIds.includes(target.id);

                    return (
                      <label
                        key={target.id}
                        className="border-border/60 bg-card/50 hover:border-primary/40 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setDraft((current) => ({
                              ...current,
                              productIds: toggleTargetId(current, target.id),
                            }))
                          }
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {target.label}
                            </p>
                            <Badge variant="outline" className="capitalize">
                              {target.kind}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {target.priceLabel} · {target.slug}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedDiscount?.managedBy === "onboarding_offer" ? (
              <div className="border-primary/30 bg-primary/10 text-primary rounded-xl border p-4 text-sm">
                This discount is managed by the Starter onboarding offer card.
                Use that section if you need to rotate the code.
              </div>
            ) : null}
          </div>

          <SheetFooter className="border-border/60 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setIsEditorOpen(false);
                setSelectedDiscountId(null);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Close
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={
                submitDisabled ||
                selectedDiscount?.managedBy === "onboarding_offer"
              }
              onClick={async () => {
                try {
                  await saveMutation.mutateAsync({
                    discountId: selectedDiscount?.id,
                    payload: buildPayload(draft),
                  });
                } catch (mutationError: unknown) {
                  setFeedback("");
                  setError(
                    mutationError instanceof Error
                      ? mutationError.message
                      : "Failed to save discount"
                  );
                }
              }}
            >
              {saveMutation.isPending
                ? selectedDiscount
                  ? "Saving..."
                  : "Creating..."
                : selectedDiscount
                  ? "Save Discount"
                  : "Create Discount"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

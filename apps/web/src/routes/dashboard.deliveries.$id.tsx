import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Info,
  MapPin,
  Navigation,
  Trash2,
  ExternalLink,
  Edit,
} from "lucide-react";
import { useState } from "react";

import {
  dashboardPageMainNarrowClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import {
  deleteEntryAction,
  updateEntryAction,
} from "@/components/dashboard/entry-mutations";
import { ImageViewerDialog } from "@/components/dashboard/image-viewer-dialog";
import { TripVerificationCard } from "@/components/dashboard/trip-verification-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MileageInput,
  MoneyInput,
  WholeNumberInput,
} from "@/components/ui/numeric-inputs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  formatFixed,
  parseFiniteNumber,
  roundToFractionDigits,
} from "@/lib/numeric-policy";
import type { EntryTripVerification } from "@/lib/trip-verification";
import { cn } from "@/lib/utils";

interface Delivery {
  id: string;
  source: string;
  distanceMiles?: number | string | null;
  distance_miles?: number | string | null;
  durationSeconds?: number | string | null;
  duration_seconds?: number | string | null;
  stopsCount?: number | string | null;
  stops_count?: number | string | null;
  fareAmount?: number | string | null;
  fare_amount?: number | string | null;
  bonusAmount?: number | string | null;
  bonus_amount?: number | string | null;
  tipFinalAmount?: number | string | null;
  tip_final_amount?: number | string | null;
  tipEstimatedAmount?: number | string | null;
  tip_estimated_amount?: number | string | null;
  tipStatus?: string;
  tip_status?: string;
  platformDisplayName?: string | null;
  platform_display_name?: string | null;
  platformSlug?: string;
  platform_slug?: string;
  status: string;
  screenshotUrl?: string | null;
  screenshot_url?: string | null;
  primary_media_url?: string | null;
  notes?: string | null;
  occurredAt?: string;
  occurred_at?: string;
  tripVerification?: EntryTripVerification | null;
}

interface DeliveryEditFormState {
  bonusAmount: string;
  distanceMiles: string;
  durationMinutes: string;
  fareAmount: string;
  notes: string;
  occurredAt: string;
  status: "offered" | "accepted" | "completed" | "cancelled";
  stopsCount: string;
  tipAmount: string;
  tipStatus: "none" | "pending" | "final";
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
}

const formatPlatformNameFromSlug = (slug: string) =>
  slug
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length > 1
        ? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
        : segment.toUpperCase()
    )
    .join(" ");

export const Route = createFileRoute("/dashboard/deliveries/$id")({
  component: DeliveryDetailPage,
  head: () => ({
    meta: [{ title: "Delivery Details" }],
  }),
});

function DeliveryDetailPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState("");
  const [editError, setEditError] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editState, setEditState] = useState<DeliveryEditFormState | null>(
    null
  );
  const [viewScreenshot, setViewScreenshot] = useState(false);
  const { data: delivery, isLoading: loading } = useQuery({
    enabled: !!params.id,
    queryFn: async () => {
      const response = await apiFetch(`/api/entries/${params.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch entry");
      }
      const data = await response.json();
      return data.entry as Delivery | undefined;
    },
    queryKey: ["entries", params.id],
  });

  const { mutate: deleteEntry, isPending: isDeleting } = useMutation({
    mutationFn: deleteEntryAction,
    onError: (err) => {
      console.error("Failed to delete", err);
      setDeleteError("Failed to delete entry. Please try again.");
    },
    onSuccess: () => {
      navigate({ to: "/dashboard/deliveries" });
    },
  });

  const { mutate: updateEntry, isPending: isUpdating } = useMutation({
    mutationFn: async (payload: DeliveryEditFormState) => {
      const occurredAtIso = new Date(payload.occurredAt).toISOString();
      const fareAmount = roundToFractionDigits(
        parseFiniteNumber(payload.fareAmount) ?? 0,
        2
      );
      const bonusAmount = roundToFractionDigits(
        parseFiniteNumber(payload.bonusAmount) ?? 0,
        2
      );
      const tipAmount = roundToFractionDigits(
        parseFiniteNumber(payload.tipAmount) ?? 0,
        2
      );
      const hasTip = Number.isFinite(tipAmount) && tipAmount > 0;
      const normalizedTipStatus = hasTip ? payload.tipStatus : "none";
      const computedTotal = roundToFractionDigits(
        fareAmount + bonusAmount + (hasTip ? tipAmount : 0),
        2
      );
      const parsedDistance = parseFiniteNumber(payload.distanceMiles);
      const parsedDuration = parseFiniteNumber(payload.durationMinutes);
      const parsedStops = parseFiniteNumber(payload.stopsCount);

      await updateEntryAction(params.id as string, {
        bonusAmount,
        completedAt: payload.status === "completed" ? occurredAtIso : null,
        distanceMiles:
          parsedDistance === null
            ? null
            : roundToFractionDigits(parsedDistance, 2),
        durationSeconds:
          parsedDuration === null
            ? null
            : Math.max(0, Math.trunc(parsedDuration)) * 60,
        fareAmount,
        notes: payload.notes || null,
        occurredAt: occurredAtIso,
        status: payload.status,
        stopsCount:
          parsedStops === null ? null : Math.max(0, Math.trunc(parsedStops)),
        tipEstimatedAmount:
          normalizedTipStatus === "pending" && hasTip ? tipAmount : null,
        tipFinalAmount:
          normalizedTipStatus === "final" && hasTip ? tipAmount : null,
        tipStatus: normalizedTipStatus,
        totalEstimatedAmount: computedTotal,
        totalFinalAmount:
          normalizedTipStatus === "pending" ? null : computedTotal,
      });
    },
    onError: (error) => {
      console.error("[GigStax] Update entry error:", error);
      setEditError("Failed to update delivery.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["entries"] });
      setIsEditOpen(false);
      setEditError("");
    },
  });

  const handleDelete = () => {
    setDeleteError("");
    deleteEntry(params.id as string);
  };

  const openEdit = () => {
    if (!delivery) {
      return;
    }

    const currentTipStatus = (
      delivery.tipStatus ||
      delivery.tip_status ||
      "none"
    )
      .toLowerCase()
      .trim();
    const tipStatus =
      currentTipStatus === "pending" || currentTipStatus === "final"
        ? currentTipStatus
        : "none";
    const tipAmount =
      tipStatus === "final"
        ? Number(delivery.tipFinalAmount || delivery.tip_final_amount || 0)
        : tipStatus === "pending"
          ? Number(
              delivery.tipEstimatedAmount || delivery.tip_estimated_amount || 0
            )
          : 0;
    const status = (delivery.status || "completed") as
      | "offered"
      | "accepted"
      | "completed"
      | "cancelled";

    setEditState({
      bonusAmount:
        Number(delivery.bonusAmount || delivery.bonus_amount || 0) > 0
          ? formatFixed(
              Number(delivery.bonusAmount || delivery.bonus_amount),
              2
            )
          : "",
      distanceMiles:
        Number(delivery.distanceMiles || delivery.distance_miles || 0) > 0
          ? formatFixed(
              Number(delivery.distanceMiles || delivery.distance_miles),
              2
            )
          : "",
      durationMinutes: String(
        Math.round(
          Number(delivery.durationSeconds || delivery.duration_seconds || 0) /
            60
        ) || ""
      ),
      fareAmount: formatFixed(
        Number(delivery.fareAmount || delivery.fare_amount || 0),
        2
      ),
      notes: delivery.notes || "",
      occurredAt: toDateTimeLocal(delivery.occurredAt || delivery.occurred_at),
      status,
      stopsCount: String(delivery.stopsCount || delivery.stops_count || ""),
      tipAmount: tipAmount > 0 ? tipAmount.toFixed(2) : "",
      tipStatus,
    });
    setEditError("");
    setIsEditOpen(true);
  };

  if (loading) {
    return (
      <div
        className={cn(
          dashboardPageMainNarrowClass,
          "flex justify-center py-12"
        )}
      >
        <div className="border-primary/30 border-t-primary h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className={cn(dashboardPageMainNarrowClass, "py-12 text-center")}>
        <h2 className="mb-4 text-2xl font-bold">Delivery Not Found</h2>
        <Button asChild>
          <Link to="/dashboard/deliveries">Back to Deliveries</Link>
        </Button>
      </div>
    );
  }

  const platformSlug =
    delivery.platformSlug || delivery.platform_slug || "other";
  const platformDisplayName =
    delivery.platformDisplayName ||
    delivery.platform_display_name ||
    formatPlatformNameFromSlug(platformSlug);
  const tipStatus = delivery.tipStatus || delivery.tip_status || "none";
  const fareAmount = Number(delivery.fareAmount || delivery.fare_amount || 0);
  const bonusAmount = Number(
    delivery.bonusAmount || delivery.bonus_amount || 0
  );
  const tipFinalAmount = Number(
    delivery.tipFinalAmount || delivery.tip_final_amount || 0
  );
  const tipEstimatedAmount = Number(
    delivery.tipEstimatedAmount || delivery.tip_estimated_amount || 0
  );
  const distanceMiles = Number(
    delivery.distanceMiles || delivery.distance_miles || 0
  );
  const durationSeconds = Number(
    delivery.durationSeconds || delivery.duration_seconds || 0
  );
  const stopsCount = Number(delivery.stopsCount || delivery.stops_count || 0);
  const occurredAt = delivery.occurredAt || delivery.occurred_at;
  const screenshotUrl =
    delivery.screenshotUrl ||
    delivery.screenshot_url ||
    delivery.primary_media_url ||
    null;
  const isTipPending = tipStatus === "pending";
  const grossTotal =
    fareAmount + bonusAmount + (tipFinalAmount || tipEstimatedAmount || 0);

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainNarrowClass} space-y-6`}>
        <Button
          variant="ghost"
          asChild
          className="mb-2 -ml-4 hover:bg-transparent"
        >
          <Link
            to="/dashboard/deliveries"
            className="text-muted-foreground hover:text-foreground flex items-center"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Deliveries
          </Link>
        </Button>

        <Card className="border-border/50 bg-card/80 overflow-hidden rounded-2xl shadow-lg backdrop-blur-md">
          <div className="border-border/50 from-primary/5 relative flex flex-col items-center justify-center border-b bg-gradient-to-b to-transparent p-8 text-center">
            <div className="absolute top-4 left-4">
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold">
                {platformDisplayName}
              </span>
            </div>
            <div className="absolute top-4 right-4">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  delivery.status === "completed"
                    ? "bg-green-500/10 text-green-500"
                    : delivery.status === "cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/10 text-amber-500"
                } capitalize`}
              >
                {delivery.status}
              </span>
            </div>

            <div className="mt-8 mb-4">
              <h1 className="text-foreground flex items-center justify-center gap-3 text-5xl font-extrabold tracking-tight">
                ${grossTotal.toFixed(2)}
              </h1>
              <p className="text-muted-foreground mt-2 font-medium">
                Gross Payout
              </p>
            </div>
          </div>

          <CardContent className="space-y-8 p-6">
            <div className="space-y-4">
              <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
                Earnings Breakdown
              </h3>
              <div className="bg-background/50 border-border/50 grid grid-cols-2 gap-4 rounded-xl border p-4 md:grid-cols-4">
                <div>
                  <div className="text-muted-foreground/70 mb-1 text-xs font-semibold tracking-wider uppercase">
                    Base Fare
                  </div>
                  <div className="text-lg font-bold">
                    ${fareAmount.toFixed(2)}
                  </div>
                </div>
                {bonusAmount > 0 ? (
                  <div>
                    <div className="text-muted-foreground/70 mb-1 text-xs font-semibold tracking-wider uppercase">
                      Bonus
                    </div>
                    <div className="text-primary text-lg font-bold">
                      +${bonusAmount.toFixed(2)}
                    </div>
                  </div>
                ) : null}
                <div
                  className={isTipPending ? "text-amber-500" : "text-green-500"}
                >
                  <div
                    className={`mb-1 text-xs font-semibold tracking-wider uppercase ${isTipPending ? "text-amber-500/70" : "text-green-500/70"}`}
                  >
                    {isTipPending ? "Est. Tip" : "Tip"}
                  </div>
                  <div className="text-lg font-bold">
                    +$
                    {(tipFinalAmount || tipEstimatedAmount || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              {isTipPending && occurredAt ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                  Tip is pending. Verify this tip about 24 hours after delivery
                  to finalize your payout.
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
                Trip Details
              </h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="border-border/50 bg-background/30 flex flex-col items-center justify-center rounded-xl border p-4">
                  <Navigation className="text-muted-foreground mb-2 h-5 w-5" />
                  <div className="text-muted-foreground/70 mb-1 text-xs font-semibold uppercase">
                    Distance
                  </div>
                  <div className="font-bold">
                    {distanceMiles > 0 ? `${distanceMiles} mi` : "--"}
                  </div>
                </div>
                <div className="border-border/50 bg-background/30 flex flex-col items-center justify-center rounded-xl border p-4">
                  <Clock className="text-muted-foreground mb-2 h-5 w-5" />
                  <div className="text-muted-foreground/70 mb-1 text-xs font-semibold uppercase">
                    Duration
                  </div>
                  <div className="font-bold">
                    {durationSeconds > 0
                      ? `${Math.round(durationSeconds / 60)} min`
                      : "--"}
                  </div>
                </div>
                <div className="border-border/50 bg-background/30 flex flex-col items-center justify-center rounded-xl border p-4">
                  <MapPin className="text-muted-foreground mb-2 h-5 w-5" />
                  <div className="text-muted-foreground/70 mb-1 text-xs font-semibold uppercase">
                    Stops
                  </div>
                  <div className="font-bold">
                    {stopsCount > 0 ? stopsCount : "--"}
                  </div>
                </div>
                <div className="border-border/50 bg-background/30 flex flex-col items-center justify-center rounded-xl border p-4 text-center">
                  <CalendarDays className="text-muted-foreground mb-2 h-5 w-5" />
                  <div className="text-muted-foreground/70 mb-1 text-xs font-semibold uppercase">
                    Date
                  </div>
                  <div className="text-sm font-bold">
                    {occurredAt
                      ? new Date(occurredAt).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })
                      : "--"}
                  </div>
                </div>
              </div>
            </div>

            <TripVerificationCard
              entryId={String(delivery.id)}
              screenshotDistanceMiles={distanceMiles > 0 ? distanceMiles : null}
              stopsCount={stopsCount > 0 ? stopsCount : null}
              tripVerification={delivery.tripVerification ?? null}
            />

            {(delivery.notes || screenshotUrl) && (
              <div className="space-y-4">
                <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
                  Additional Info
                </h3>
                <div className="space-y-3">
                  {delivery.notes && (
                    <div className="bg-secondary/20 border-secondary/30 flex items-start gap-3 rounded-xl border p-4">
                      <Info className="text-primary/70 mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <div className="text-foreground/90 leading-relaxed italic">
                          "{delivery.notes}"
                        </div>
                      </div>
                    </div>
                  )}
                  {screenshotUrl && (
                    <Button
                      variant="outline"
                      className="border-border/50 h-12 w-full rounded-xl shadow-sm"
                      onClick={() => setViewScreenshot(true)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Attached Receipt Screenshot
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="border-border/50 flex flex-col gap-4 border-t pt-6 sm:flex-row">
              {deleteError && (
                <div className="border-destructive/20 bg-destructive/10 text-destructive w-full rounded-xl border p-3 text-sm">
                  {deleteError}
                </div>
              )}
              <Button
                variant="outline"
                className="border-border/50 h-12 flex-1 rounded-xl"
                onClick={openEdit}
                disabled={isUpdating}
              >
                <Edit className="mr-2 h-4 w-4" />
                {isUpdating ? "Saving..." : "Edit Delivery"}
              </Button>
              <Button
                variant="destructive"
                className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20 h-12 flex-1 rounded-xl border"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Delivery</DialogTitle>
              <DialogDescription>
                Update base pay, tip, and trip details. Save to refresh totals.
              </DialogDescription>
            </DialogHeader>

            {editState ? (
              <form
                className="space-y-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  setEditError("");
                  updateEntry(editState);
                }}
              >
                {editError ? (
                  <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
                    {editError}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-status"
                    >
                      Status
                    </label>
                    <Select
                      value={editState.status}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                status:
                                  value as DeliveryEditFormState["status"],
                              }
                            : current
                        )
                      }
                    >
                      <SelectTrigger id="edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offered">Offered</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-occurred-at"
                    >
                      Event Date & Time
                    </label>
                    <Input
                      id="edit-occurred-at"
                      type="datetime-local"
                      value={editState.occurredAt}
                      onChange={(event) =>
                        setEditState((current) =>
                          current
                            ? { ...current, occurredAt: event.target.value }
                            : current
                        )
                      }
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-fare"
                    >
                      Base Pay
                    </label>
                    <MoneyInput
                      id="edit-fare"
                      value={editState.fareAmount}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current ? { ...current, fareAmount: value } : current
                        )
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-bonus"
                    >
                      Bonus
                    </label>
                    <MoneyInput
                      id="edit-bonus"
                      value={editState.bonusAmount}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current ? { ...current, bonusAmount: value } : current
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-tip-status"
                    >
                      Tip Status
                    </label>
                    <Select
                      value={editState.tipStatus}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                tipStatus:
                                  value as DeliveryEditFormState["tipStatus"],
                              }
                            : current
                        )
                      }
                    >
                      <SelectTrigger id="edit-tip-status">
                        <SelectValue placeholder="Tip status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Tip</SelectItem>
                        <SelectItem value="pending">Pending Tip</SelectItem>
                        <SelectItem value="final">Final Tip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-tip-amount"
                    >
                      Tip Amount
                    </label>
                    <MoneyInput
                      id="edit-tip-amount"
                      value={editState.tipAmount}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current ? { ...current, tipAmount: value } : current
                        )
                      }
                      disabled={editState.tipStatus === "none"}
                    />
                  </div>
                </div>

                <p className="text-muted-foreground text-xs">
                  Money and mileage fields allow up to 2 decimals and auto-round
                  on blur.
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-miles"
                    >
                      Miles
                    </label>
                    <MileageInput
                      id="edit-miles"
                      value={editState.distanceMiles}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current
                            ? { ...current, distanceMiles: value }
                            : current
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-duration-min"
                    >
                      Duration (Min)
                    </label>
                    <WholeNumberInput
                      id="edit-duration-min"
                      value={editState.durationMinutes}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current
                            ? {
                                ...current,
                                durationMinutes: value,
                              }
                            : current
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-semibold"
                      htmlFor="edit-stops"
                    >
                      Stops
                    </label>
                    <WholeNumberInput
                      id="edit-stops"
                      value={editState.stopsCount}
                      onValueChange={(value) =>
                        setEditState((current) =>
                          current ? { ...current, stopsCount: value } : current
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="edit-notes">
                    Notes
                  </label>
                  <Textarea
                    id="edit-notes"
                    rows={3}
                    value={editState.notes}
                    onChange={(event) =>
                      setEditState((current) =>
                        current
                          ? { ...current, notes: event.target.value }
                          : current
                      )
                    }
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(false)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>

        {screenshotUrl ? (
          <ImageViewerDialog
            open={viewScreenshot}
            onOpenChange={setViewScreenshot}
            imageUrl={screenshotUrl}
            alt="Delivery receipt screenshot"
            title="Attached receipt screenshot"
          />
        ) : null}
      </main>
    </div>
  );
}

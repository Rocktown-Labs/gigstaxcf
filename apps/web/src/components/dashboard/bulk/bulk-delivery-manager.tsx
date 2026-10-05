import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createEntryAction } from "@/components/dashboard/entry-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import {
  formatFixed,
  parseFiniteNumber,
  roundToFractionDigits,
} from "@/lib/numeric-policy";

import { BulkDraftAccordion } from "./bulk-draft-accordion";
import { BulkUploadControls } from "./bulk-upload-controls";
import { PLATFORM_OPTIONS } from "./platform-options";
import type {
  BulkDraft,
  BulkQueueItem,
  BulkStatusItem,
  EntryStatus,
  ExtractionPayload,
  PlatformOption,
  ParsedTipStatus,
} from "./types";

interface DeliveryBulkManagerProps {
  onSaved?: () => Promise<void> | void;
}

interface PlatformsApiResponse {
  availablePlatforms?: {
    colorHex: string;
    displayName: string;
    slug: string;
  }[];
  selectedPlatforms?: {
    colorHex: string;
    displayName: string;
    slug: string;
  }[];
}

const POLL_INTERVAL_MS = 2000;

const toMoneyAmount = (value: string) =>
  roundToFractionDigits(parseFiniteNumber(value) ?? 0, 2);

const todayDate = () => new Date().toISOString().slice(0, 10);

const makeLocalId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toDateTimeIso = (date: string, time: string) =>
  new Date(`${date}T${time || "12:00"}:00`).toISOString();

function asPositiveNumber(value: unknown) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeTipStatus(value: unknown): ParsedTipStatus {
  if (value === "pending" || value === "final") {
    return value;
  }

  return "none";
}

function mapQueueItemToDraft(
  queueItem: BulkQueueItem,
  selectedDate: string,
  fallbackPlatformSlug: string
): BulkDraft {
  return {
    bonusAmount: "",
    distanceMiles: "",
    durationMinutes: "",
    error: null,
    extractionId: queueItem.extractionId,
    extractionStatus: queueItem.status,
    fareAmount: "",
    id: makeLocalId(),
    isSaving: false,
    mediaUrl: queueItem.mediaUrl,
    mode: "upload",
    notes: "",
    occurredDate: selectedDate,
    occurredTime: "12:00",
    platformSlug: fallbackPlatformSlug,
    sourceFile: null,
    status: "completed",
    stopsCount: "",
    tipAmount: "",
    tipStatus: "none",
    title: queueItem.filename || `Draft ${queueItem.extractionId}`,
  };
}

function hydrateDraftFromExtraction(args: {
  draft: BulkDraft;
  fallbackPlatformSlug: string;
  parsedPayload: ExtractionPayload;
  platformOverride: string;
}) {
  const { draft, fallbackPlatformSlug, parsedPayload, platformOverride } = args;

  if (parsedPayload.entryType === "expense") {
    return {
      ...draft,
      error: "This image looks like an expense receipt. Move it to expenses.",
      extractionStatus: "failed" as const,
    };
  }

  const tipStatus = normalizeTipStatus(parsedPayload.tipStatus);
  const bonusAmount = asPositiveNumber(parsedPayload.bonusAmount);
  const distanceMiles = asPositiveNumber(parsedPayload.distanceMiles);
  const durationSeconds = asPositiveNumber(parsedPayload.durationSeconds);
  const fareAmount = asPositiveNumber(parsedPayload.fareAmount);
  const stopsCount = asPositiveNumber(parsedPayload.stopsCount);
  const tipFinalAmount = asPositiveNumber(parsedPayload.tipFinalAmount);
  const tipEstimatedAmount = asPositiveNumber(parsedPayload.tipEstimatedAmount);
  const tipValue =
    tipStatus === "final"
      ? tipFinalAmount
      : tipStatus === "pending"
        ? tipEstimatedAmount
        : (tipFinalAmount ?? tipEstimatedAmount);

  const parsedPlatform =
    typeof parsedPayload.platformSlug === "string" &&
    parsedPayload.platformSlug.length > 0
      ? parsedPayload.platformSlug
      : fallbackPlatformSlug;

  const platformSlug =
    platformOverride === "auto" ? parsedPlatform : platformOverride;

  return {
    ...draft,
    bonusAmount:
      bonusAmount === null ? draft.bonusAmount : formatFixed(bonusAmount, 2),
    distanceMiles:
      distanceMiles === null
        ? draft.distanceMiles
        : formatFixed(distanceMiles, 2),
    durationMinutes:
      durationSeconds === null
        ? draft.durationMinutes
        : String(Math.round((durationSeconds || 0) / 60)),
    error: null,
    fareAmount:
      fareAmount === null ? draft.fareAmount : formatFixed(fareAmount, 2),
    notes:
      typeof parsedPayload.notes === "string"
        ? parsedPayload.notes
        : draft.notes,
    platformSlug,
    stopsCount: stopsCount === null ? draft.stopsCount : String(stopsCount),
    tipAmount: tipValue === null ? draft.tipAmount : formatFixed(tipValue, 2),
    tipStatus,
  };
}

export function BulkDeliveryManager({ onSaved }: DeliveryBulkManagerProps) {
  const platformQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/platforms");
      if (!response.ok) {
        throw new Error("Failed to load platforms");
      }

      return (await response.json()) as PlatformsApiResponse;
    },
    queryKey: ["platform-options"],
  });

  const platformOptions = useMemo<PlatformOption[]>(() => {
    const selected = platformQuery.data?.selectedPlatforms || [];
    const available = platformQuery.data?.availablePlatforms || [];
    const source =
      selected.length > 0
        ? selected
        : available.length > 0
          ? available
          : PLATFORM_OPTIONS.map((option) => ({
              colorHex: "#22c55e",
              displayName: option.label,
              slug: option.value,
            }));

    const optionMap = new Map<string, PlatformOption>(
      PLATFORM_OPTIONS.map((option) => [option.value, option])
    );

    for (const option of source) {
      optionMap.set(option.slug, {
        colorHex: option.colorHex,
        label: option.displayName,
        value: option.slug,
      });
    }

    return [...optionMap.values()];
  }, [
    platformQuery.data?.availablePlatforms,
    platformQuery.data?.selectedPlatforms,
  ]);

  const defaultPlatformSlug = platformOptions[0]?.value || "walmart_spark";

  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [platformOverride, setPlatformOverride] = useState("auto");
  const [analyzeError, setAnalyzeError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [uploadDrafts, setUploadDrafts] = useState<BulkDraft[]>([]);
  const [openUploadItems, setOpenUploadItems] = useState<string[]>([]);
  const [isQueueing, setIsQueueing] = useState(false);

  const [manualDate, setManualDate] = useState(todayDate);
  const [manualPlatform, setManualPlatform] = useState(defaultPlatformSlug);
  const [manualDrafts, setManualDrafts] = useState<BulkDraft[]>([]);
  const [openManualItems, setOpenManualItems] = useState<string[]>([]);
  const manualDayInputId = "bulk-manual-day";
  const manualPlatformSelectId = "bulk-manual-platform";

  const { mutateAsync: createEntry } = useMutation({
    mutationFn: createEntryAction,
  });

  const hasManualPlatform =
    platformOptions.length === 0 ||
    platformOptions.some((option) => option.value === manualPlatform);
  const hasPlatformOverride =
    platformOverride === "auto" ||
    platformOptions.some((option) => option.value === platformOverride);

  // Clamp stale selections once platform options load, following the React
  // "adjust state when inputs change" pattern (guarded render-time update).
  const [clampedFrom, setClampedFrom] = useState({
    manualPlatform,
    platformOptions,
    platformOverride,
  });
  if (
    clampedFrom.manualPlatform !== manualPlatform ||
    clampedFrom.platformOptions !== platformOptions ||
    clampedFrom.platformOverride !== platformOverride
  ) {
    setClampedFrom({ manualPlatform, platformOptions, platformOverride });
    if (!hasManualPlatform) {
      setManualPlatform(defaultPlatformSlug);
    }
    if (!hasPlatformOverride) {
      setPlatformOverride("auto");
    }
  }

  const updateDraft = useCallback(
    (
      collection: "upload" | "manual",
      draftId: string,
      patch: Partial<BulkDraft>
    ) => {
      if (collection === "upload") {
        setUploadDrafts((current) =>
          current.map((item) =>
            item.id === draftId ? { ...item, ...patch } : item
          )
        );
        return;
      }

      setManualDrafts((current) =>
        current.map((item) =>
          item.id === draftId ? { ...item, ...patch } : item
        )
      );
    },
    []
  );

  const removeDraft = useCallback(
    (collection: "upload" | "manual", draftId: string) => {
      if (collection === "upload") {
        setUploadDrafts((current) =>
          current.filter((item) => item.id !== draftId)
        );
        setOpenUploadItems((current) =>
          current.filter((item) => item !== draftId)
        );
        return;
      }

      setManualDrafts((current) =>
        current.filter((item) => item.id !== draftId)
      );
      setOpenManualItems((current) =>
        current.filter((item) => item !== draftId)
      );
    },
    []
  );

  const attachMediaIfNeeded = useCallback(
    async (draft: BulkDraft, entryId: number | string | undefined) => {
      if (!draft.sourceFile || draft.extractionId || !entryId) {
        return;
      }

      const mediaForm = new FormData();
      mediaForm.append("file", draft.sourceFile);

      const mediaResponse = await apiFetch(`/api/entries/${entryId}/media`, {
        body: mediaForm,
        method: "POST",
      });

      if (!mediaResponse.ok) {
        const payload = (await mediaResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "Failed to attach screenshot.");
      }
    },
    []
  );

  const saveDraft = useCallback(
    async (collection: "upload" | "manual", draft: BulkDraft) => {
      updateDraft(collection, draft.id, { error: null, isSaving: true });

      try {
        const occurredAt = toDateTimeIso(
          draft.occurredDate,
          draft.occurredTime
        );
        const fareAmount = toMoneyAmount(draft.fareAmount);
        const bonusAmount = toMoneyAmount(draft.bonusAmount);
        const tipAmount = toMoneyAmount(draft.tipAmount);
        const hasTip = tipAmount > 0;
        const tipStatus: ParsedTipStatus = hasTip ? draft.tipStatus : "none";
        const computedTotal = roundToFractionDigits(
          fareAmount + bonusAmount + (hasTip ? tipAmount : 0),
          2
        );
        const parsedDistance = parseFiniteNumber(draft.distanceMiles);
        const parsedDuration = parseFiniteNumber(draft.durationMinutes);
        const parsedStops = parseFiniteNumber(draft.stopsCount);

        const created = await createEntry({
          bonusAmount,
          completedAt: draft.status === "completed" ? occurredAt : undefined,
          distanceMiles:
            parsedDistance === null
              ? undefined
              : roundToFractionDigits(parsedDistance, 2),
          durationSeconds:
            parsedDuration === null
              ? undefined
              : Math.max(0, Math.trunc(parsedDuration)) * 60,
          extractionId: draft.extractionId ?? undefined,
          fareAmount,
          notes: draft.notes || undefined,
          occurredAt,
          platformSlug: draft.platformSlug,
          source: draft.extractionId ? "image_ai" : "manual",
          status: draft.status,
          stopsCount:
            parsedStops === null
              ? undefined
              : Math.max(0, Math.trunc(parsedStops)),
          tipEstimatedAmount:
            tipStatus === "pending" && hasTip ? tipAmount : undefined,
          tipFinalAmount:
            tipStatus === "final" && hasTip ? tipAmount : undefined,
          tipStatus,
          totalEstimatedAmount: computedTotal,
          totalFinalAmount: tipStatus === "pending" ? undefined : computedTotal,
        });

        await attachMediaIfNeeded(draft, created?.entry?.id);

        if (onSaved) {
          await onSaved();
        }

        removeDraft(collection, draft.id);
      } catch (error) {
        console.error("[GigStax] Bulk save error:", error);
        updateDraft(collection, draft.id, {
          error:
            error instanceof Error
              ? error.message
              : "Failed to save this delivery.",
          isSaving: false,
        });
      }
    },
    [attachMediaIfNeeded, createEntry, onSaved, removeDraft, updateDraft]
  );

  const pendingExtractionIds = useMemo(() => {
    const ids = uploadDrafts
      .filter(
        (draft) =>
          (draft.extractionStatus === "pending" ||
            draft.extractionStatus === "processing") &&
          typeof draft.extractionId === "number"
      )
      .map((draft) => draft.extractionId as number);

    return [...new Set(ids)];
  }, [uploadDrafts]);

  const pollStatuses = useCallback(async () => {
    if (pendingExtractionIds.length === 0) {
      return;
    }

    const response = await apiFetch(
      `/api/entries/bulk-analyze/status?ids=${pendingExtractionIds.join(",")}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      items?: BulkStatusItem[];
    };

    const itemMap = new Map<number, BulkStatusItem>();
    for (const item of payload.items || []) {
      itemMap.set(item.extractionId, item);
    }

    setUploadDrafts((current) =>
      current.map((draft) => {
        if (!draft.extractionId) {
          return draft;
        }

        const update = itemMap.get(draft.extractionId);
        if (!update) {
          return draft;
        }

        let nextDraft: BulkDraft = {
          ...draft,
          error:
            update.status === "failed"
              ? update.errorMessage || "Analysis failed. Retry this row."
              : null,
          extractionStatus: update.status,
          mediaUrl: update.mediaUrl || draft.mediaUrl,
        };

        const transitionedToCompleted =
          draft.extractionStatus !== "completed" &&
          update.status === "completed";

        if (transitionedToCompleted && update.parsedPayload) {
          nextDraft = hydrateDraftFromExtraction({
            draft: nextDraft,
            fallbackPlatformSlug: defaultPlatformSlug,
            parsedPayload: update.parsedPayload,
            platformOverride,
          });
        }

        return nextDraft;
      })
    );
  }, [defaultPlatformSlug, pendingExtractionIds, platformOverride]);

  const pollStatusesRef = useRef(pollStatuses);

  useEffect(() => {
    pollStatusesRef.current = pollStatuses;
  }, [pollStatuses]);

  useEffect(() => {
    if (pendingExtractionIds.length === 0) {
      return;
    }

    let isCancelled = false;
    const tick = async () => {
      if (isCancelled) {
        return;
      }

      try {
        await pollStatusesRef.current();
      } catch (error) {
        console.error("[GigStax] Bulk status polling error:", error);
      }
    };

    tick().catch((error) => {
      console.error("[GigStax] Bulk status polling error:", error);
    });
    const timer = setInterval(() => {
      tick().catch((error) => {
        console.error("[GigStax] Bulk status polling error:", error);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [pendingExtractionIds.length]);

  const handleFilesChanged = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files || [])];
      setSelectedFiles(files);
      setAnalyzeError("");
      setQuotaExceeded(false);
    },
    []
  );

  const handleQueueSelected = useCallback(async () => {
    if (selectedFiles.length === 0) {
      setAnalyzeError("Choose one or more images first.");
      setQuotaExceeded(false);
      return;
    }

    setIsQueueing(true);
    setAnalyzeError("");
    setQuotaExceeded(false);

    try {
      const formData = new FormData();
      formData.append("kindHint", "entry_screenshot");
      formData.append("platformOverride", platformOverride);
      formData.append("selectedDate", selectedDate);
      for (const file of selectedFiles) {
        formData.append("files[]", file);
      }

      const response = await apiFetch("/api/entries/bulk-analyze", {
        body: formData,
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        message?: string;
        queue?: BulkQueueItem[];
      };

      if (!response.ok) {
        if (payload.code === "QUOTA_EXCEEDED") {
          setQuotaExceeded(true);
          setAnalyzeError(
            payload.message ||
              "AI credits exhausted. Upgrade or Buy Credits to continue."
          );
        } else {
          setQuotaExceeded(false);
          setAnalyzeError(payload.error || "Could not queue screenshots.");
        }
        return;
      }

      const drafts = (payload.queue || []).map((queueItem) =>
        mapQueueItemToDraft(queueItem, selectedDate, defaultPlatformSlug)
      );

      setUploadDrafts((current) => [...drafts, ...current]);
      setOpenUploadItems((current) => [
        ...drafts.map((draft) => draft.id),
        ...current,
      ]);
      setSelectedFiles([]);
      setQuotaExceeded(false);
    } catch (error) {
      setQuotaExceeded(false);
      setAnalyzeError(
        error instanceof Error ? error.message : "Could not queue screenshots."
      );
    }
    setIsQueueing(false);
  }, [defaultPlatformSlug, platformOverride, selectedDate, selectedFiles]);

  const handleRetryDraft = useCallback(
    async (draft: BulkDraft) => {
      if (!draft.extractionId) {
        return;
      }

      updateDraft("upload", draft.id, {
        error: null,
        extractionStatus: "pending",
      });

      try {
        const response = await apiFetch("/api/entries/bulk-analyze/retry", {
          body: JSON.stringify({ extractionId: draft.extractionId }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          updateDraft("upload", draft.id, {
            error: payload.error || "Retry failed.",
            extractionStatus: "failed",
          });
        }
      } catch (error) {
        updateDraft("upload", draft.id, {
          error: error instanceof Error ? error.message : "Retry failed.",
          extractionStatus: "failed",
        });
      }
    },
    [updateDraft]
  );

  const addManualDraft = useCallback(() => {
    const id = makeLocalId();
    const draft: BulkDraft = {
      bonusAmount: "",
      distanceMiles: "",
      durationMinutes: "",
      error: null,
      extractionId: null,
      extractionStatus: "completed",
      fareAmount: "",
      id,
      isSaving: false,
      mediaUrl: null,
      mode: "manual",
      notes: "",
      occurredDate: manualDate,
      occurredTime: "12:00",
      platformSlug: manualPlatform,
      sourceFile: null,
      status: "completed" as EntryStatus,
      stopsCount: "",
      tipAmount: "",
      tipStatus: "final",
      title: `Manual Entry ${manualDrafts.length + 1}`,
    };

    setManualDrafts((current) => [draft, ...current]);
    setOpenManualItems((current) => [id, ...current]);
  }, [manualDate, manualDrafts.length, manualPlatform]);

  const isAnySaving =
    uploadDrafts.some((draft) => draft.isSaving) ||
    manualDrafts.some((draft) => draft.isSaving);

  return (
    <div className="border-border/50 bg-card space-y-6 rounded-2xl border p-5 sm:p-6">
      <div className="space-y-1">
        <h3 className="text-xl font-bold tracking-tight">
          Bulk Delivery Tools
        </h3>
        <p className="text-muted-foreground text-sm">
          Queue a day of screenshots or add manual batches. Each row opens in an
          accordion card and closes after save.
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-5">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="upload">Screenshot Batch</TabsTrigger>
          <TabsTrigger value="manual">Manual Batch</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <BulkUploadControls
            analyzeError={analyzeError}
            isQueueing={isQueueing}
            onAnalyze={handleQueueSelected}
            onClearSelection={() => setSelectedFiles([])}
            onFilesChanged={handleFilesChanged}
            onPlatformOverrideChanged={setPlatformOverride}
            onSelectedDateChanged={setSelectedDate}
            platformOptions={platformOptions}
            platformOverride={platformOverride}
            selectedDate={selectedDate}
            selectedFilesCount={selectedFiles.length}
            showUpgradeOrCreditsCta={quotaExceeded}
          />

          <BulkDraftAccordion
            drafts={uploadDrafts}
            emptyMessage="Queue screenshots to create editable delivery cards."
            onChangeDraft={(draftId, patch) =>
              updateDraft("upload", draftId, patch)
            }
            onOpenItemsChange={setOpenUploadItems}
            onRemoveDraft={(draftId) => removeDraft("upload", draftId)}
            onRetryDraft={handleRetryDraft}
            onSaveDraft={(draft) => {
              saveDraft("upload", draft).catch((error) => {
                console.error("[GigStax] Bulk upload save error:", error);
              });
            }}
            platformOptions={platformOptions}
            openItems={openUploadItems}
          />
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor={manualDayInputId}
                className="text-sm font-semibold"
              >
                Day
              </label>
              <Input
                id={manualDayInputId}
                type="date"
                value={manualDate}
                onChange={(event) => setManualDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor={manualPlatformSelectId}
                className="text-sm font-semibold"
              >
                Platform
              </label>
              <Select value={manualPlatform} onValueChange={setManualPlatform}>
                <SelectTrigger id={manualPlatformSelectId}>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((platform) => (
                    <SelectItem key={platform.value} value={platform.value}>
                      {platform.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addManualDraft} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Entry Card
              </Button>
            </div>
          </div>

          <BulkDraftAccordion
            drafts={manualDrafts}
            emptyMessage="Add manual cards for quick multi-app batch entry."
            onChangeDraft={(draftId, patch) =>
              updateDraft("manual", draftId, patch)
            }
            onOpenItemsChange={setOpenManualItems}
            onRemoveDraft={(draftId) => removeDraft("manual", draftId)}
            onSaveDraft={(draft) => {
              saveDraft("manual", draft).catch((error) => {
                console.error("[GigStax] Manual batch save error:", error);
              });
            }}
            platformOptions={platformOptions}
            openItems={openManualItems}
          />
        </TabsContent>
      </Tabs>

      {(isQueueing || isAnySaving) && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Working on your batch...
        </div>
      )}
    </div>
  );
}

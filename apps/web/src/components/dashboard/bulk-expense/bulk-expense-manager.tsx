import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createExpenseAction } from "@/components/dashboard/expense-mutations";
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

import { EXPENSE_CATEGORY_OPTIONS } from "./category-options";
import { ExpenseBulkDraftAccordion } from "./expense-bulk-draft-accordion";
import { ExpenseBulkUploadControls } from "./expense-bulk-upload-controls";
import type {
  ExpenseBulkDraft,
  ExpenseBulkQueueItem,
  ExpenseBulkStatusItem,
  ExpenseCategory,
  ExpenseExtractionPayload,
} from "./types";

interface BulkExpenseManagerProps {
  onSaved?: () => Promise<void> | void;
}

const POLL_INTERVAL_MS = 2000;

const todayDate = () => new Date().toISOString().slice(0, 10);

const makeLocalId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toDateTimeIso = (date: string) =>
  new Date(`${date}T12:00:00`).toISOString();

function asPositiveNumber(value: unknown) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  const category = typeof value === "string" ? value.toLowerCase() : "";
  const supported = new Set(EXPENSE_CATEGORY_OPTIONS.map((item) => item.value));
  if (supported.has(category as ExpenseCategory)) {
    return category as ExpenseCategory;
  }

  return "other";
}

function mapQueueItemToDraft(
  queueItem: ExpenseBulkQueueItem,
  selectedDate: string,
  fallbackCategory: ExpenseCategory
): ExpenseBulkDraft {
  return {
    amount: "",
    category: fallbackCategory,
    error: null,
    extractionId: queueItem.extractionId,
    extractionStatus: queueItem.status,
    id: makeLocalId(),
    incurredDate: selectedDate,
    isSaving: false,
    isTypeMismatch: false,
    mediaId: queueItem.mediaId,
    mediaUrl: queueItem.mediaUrl,
    merchant: "",
    mode: "upload",
    notes: "",
    title: queueItem.filename || `Receipt ${queueItem.extractionId}`,
  };
}

function hydrateDraftFromExtraction(args: {
  categoryOverride: ExpenseCategory | "auto";
  draft: ExpenseBulkDraft;
  parsedPayload: ExpenseExtractionPayload;
}) {
  const { categoryOverride, draft, parsedPayload } = args;

  if (parsedPayload.entryType === "earning") {
    return {
      ...draft,
      error:
        "This image looks like a trip screenshot. Log it from Trips instead.",
      extractionStatus: "failed" as const,
      isTypeMismatch: true,
    };
  }

  const extractedAmount = asPositiveNumber(parsedPayload.expenseAmount);
  const extractedCategory = normalizeExpenseCategory(
    parsedPayload.expenseCategory
  );

  return {
    ...draft,
    amount:
      extractedAmount === null ? draft.amount : formatFixed(extractedAmount, 2),
    category:
      categoryOverride === "auto" ? extractedCategory : categoryOverride,
    error: null,
    isTypeMismatch: false,
    notes:
      typeof parsedPayload.notes === "string"
        ? parsedPayload.notes
        : draft.notes,
  };
}

export function BulkExpenseManager({ onSaved }: BulkExpenseManagerProps) {
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [categoryOverride, setCategoryOverride] = useState<
    ExpenseCategory | "auto"
  >("auto");
  const [analyzeError, setAnalyzeError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [uploadDrafts, setUploadDrafts] = useState<ExpenseBulkDraft[]>([]);
  const [openUploadItems, setOpenUploadItems] = useState<string[]>([]);
  const [isQueueing, setIsQueueing] = useState(false);

  const [manualDate, setManualDate] = useState(todayDate);
  const [manualCategory, setManualCategory] = useState<ExpenseCategory>("fuel");
  const [manualDrafts, setManualDrafts] = useState<ExpenseBulkDraft[]>([]);
  const [openManualItems, setOpenManualItems] = useState<string[]>([]);

  const manualDayInputId = "expense-bulk-manual-day";
  const manualCategorySelectId = "expense-bulk-manual-category";

  const { mutateAsync: createExpense } = useMutation({
    mutationFn: createExpenseAction,
  });

  const updateDraft = useCallback(
    (
      collection: "upload" | "manual",
      draftId: string,
      patch: Partial<ExpenseBulkDraft>
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
    async (draft: ExpenseBulkDraft, expenseId: number | string | undefined) => {
      if (!draft.mediaId || !expenseId) {
        return;
      }

      const mediaForm = new FormData();
      mediaForm.append("mediaId", String(draft.mediaId));

      const mediaResponse = await apiFetch(`/api/expenses/${expenseId}/media`, {
        body: mediaForm,
        method: "POST",
      });

      if (!mediaResponse.ok) {
        const payload = (await mediaResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "Failed to attach receipt.");
      }
    },
    []
  );

  const saveDraft = useCallback(
    async (collection: "upload" | "manual", draft: ExpenseBulkDraft) => {
      updateDraft(collection, draft.id, { error: null, isSaving: true });

      const amount = roundToFractionDigits(
        parseFiniteNumber(draft.amount) ?? 0,
        2
      );
      if (amount <= 0) {
        updateDraft(collection, draft.id, {
          error: "Amount must be greater than zero.",
          isSaving: false,
        });
        return;
      }

      try {
        const created = await createExpense({
          amount,
          category: draft.category,
          incurredAt: toDateTimeIso(draft.incurredDate),
          merchant: draft.merchant || undefined,
          notes: draft.notes || undefined,
        });

        await attachMediaIfNeeded(draft, created?.expense?.id);

        if (onSaved) {
          await onSaved();
        }

        removeDraft(collection, draft.id);
      } catch (error) {
        console.error("[GigStax] Bulk expense save error:", error);
        updateDraft(collection, draft.id, {
          error:
            error instanceof Error
              ? error.message
              : "Failed to save this expense.",
          isSaving: false,
        });
      }
    },
    [attachMediaIfNeeded, createExpense, onSaved, removeDraft, updateDraft]
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
      `/api/expenses/bulk-analyze/status?ids=${pendingExtractionIds.join(",")}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      items?: ExpenseBulkStatusItem[];
    };

    const itemMap = new Map<number, ExpenseBulkStatusItem>();
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

        let nextDraft: ExpenseBulkDraft = {
          ...draft,
          error:
            update.status === "failed"
              ? update.errorMessage || "Analysis failed. Retry this row."
              : null,
          extractionStatus: update.status,
          isTypeMismatch:
            update.status === "failed" ? draft.isTypeMismatch : false,
          mediaUrl: update.mediaUrl || draft.mediaUrl,
        };

        const transitionedToCompleted =
          draft.extractionStatus !== "completed" &&
          update.status === "completed";

        if (transitionedToCompleted && update.parsedPayload) {
          nextDraft = hydrateDraftFromExtraction({
            categoryOverride,
            draft: nextDraft,
            parsedPayload: update.parsedPayload,
          });
        }

        return nextDraft;
      })
    );
  }, [categoryOverride, pendingExtractionIds]);

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
        console.error("[GigStax] Expense bulk status polling error:", error);
      }
    };

    tick().catch((error) => {
      console.error("[GigStax] Expense bulk status polling error:", error);
    });
    const timer = setInterval(() => {
      tick().catch((error) => {
        console.error("[GigStax] Expense bulk status polling error:", error);
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
      setAnalyzeError("Choose one or more receipt images first.");
      setQuotaExceeded(false);
      return;
    }

    setIsQueueing(true);
    setAnalyzeError("");
    setQuotaExceeded(false);

    try {
      const formData = new FormData();
      formData.append("kindHint", "expense_receipt");
      formData.append("categoryOverride", categoryOverride);
      formData.append("selectedDate", selectedDate);
      for (const file of selectedFiles) {
        formData.append("files[]", file);
      }

      const response = await apiFetch("/api/expenses/bulk-analyze", {
        body: formData,
        method: "POST",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        message?: string;
        queue?: ExpenseBulkQueueItem[];
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
          setAnalyzeError(payload.error || "Could not queue receipts.");
        }
        return;
      }

      const fallbackCategory =
        categoryOverride === "auto" ? "other" : categoryOverride;
      const drafts = (payload.queue || []).map((queueItem) =>
        mapQueueItemToDraft(queueItem, selectedDate, fallbackCategory)
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
        error instanceof Error ? error.message : "Could not queue receipts."
      );
    }
    setIsQueueing(false);
  }, [categoryOverride, selectedDate, selectedFiles]);

  const handleRetryDraft = useCallback(
    async (draft: ExpenseBulkDraft) => {
      if (!draft.extractionId) {
        return;
      }

      updateDraft("upload", draft.id, {
        error: null,
        extractionStatus: "pending",
        isTypeMismatch: false,
      });

      try {
        const response = await apiFetch("/api/expenses/bulk-analyze/retry", {
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
          return;
        }
        updateDraft("upload", draft.id, { extractionStatus: "pending" });
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
    const draft: ExpenseBulkDraft = {
      amount: "",
      category: manualCategory,
      error: null,
      extractionId: null,
      extractionStatus: "completed",
      id,
      incurredDate: manualDate,
      isSaving: false,
      isTypeMismatch: false,
      mediaId: null,
      mediaUrl: null,
      merchant: "",
      mode: "manual",
      notes: "",
      title: `Manual Expense ${manualDrafts.length + 1}`,
    };

    setManualDrafts((current) => [draft, ...current]);
    setOpenManualItems((current) => [id, ...current]);
  }, [manualCategory, manualDate, manualDrafts.length]);

  const isAnySaving =
    uploadDrafts.some((draft) => draft.isSaving) ||
    manualDrafts.some((draft) => draft.isSaving);

  return (
    <div className="border-border/50 bg-card space-y-6 rounded-2xl border p-5 sm:p-6">
      <div className="space-y-1">
        <h3 className="text-xl font-bold tracking-tight">Bulk Expense Tools</h3>
        <p className="text-muted-foreground text-sm">
          Queue receipt screenshots or add manual expense cards. Each card saves
          independently so you can fix only what needs attention.
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-5">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="upload">Screenshot Batch</TabsTrigger>
          <TabsTrigger value="manual">Manual Batch</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <ExpenseBulkUploadControls
            analyzeError={analyzeError}
            categoryOverride={categoryOverride}
            isQueueing={isQueueing}
            onAnalyze={handleQueueSelected}
            onCategoryOverrideChanged={setCategoryOverride}
            onClearSelection={() => setSelectedFiles([])}
            onFilesChanged={handleFilesChanged}
            onSelectedDateChanged={setSelectedDate}
            selectedDate={selectedDate}
            selectedFilesCount={selectedFiles.length}
            showUpgradeOrCreditsCta={quotaExceeded}
          />

          <ExpenseBulkDraftAccordion
            drafts={uploadDrafts}
            emptyMessage="Queue receipts to create editable expense cards."
            onChangeDraft={(draftId, patch) =>
              updateDraft("upload", draftId, patch)
            }
            onOpenItemsChange={setOpenUploadItems}
            onRemoveDraft={(draftId) => removeDraft("upload", draftId)}
            onRetryDraft={handleRetryDraft}
            onSaveDraft={(draft) => {
              saveDraft("upload", draft).catch((error) => {
                console.error("[GigStax] Expense upload save error:", error);
              });
            }}
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
                Incurred Day
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
                htmlFor={manualCategorySelectId}
                className="text-sm font-semibold"
              >
                Default Category
              </label>
              <Select
                value={manualCategory}
                onValueChange={(value) =>
                  setManualCategory(value as ExpenseCategory)
                }
              >
                <SelectTrigger id={manualCategorySelectId}>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addManualDraft} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Expense Card
              </Button>
            </div>
          </div>

          <ExpenseBulkDraftAccordion
            drafts={manualDrafts}
            emptyMessage="Add manual cards for fast day-by-day expense logging."
            onChangeDraft={(draftId, patch) =>
              updateDraft("manual", draftId, patch)
            }
            onOpenItemsChange={setOpenManualItems}
            onRemoveDraft={(draftId) => removeDraft("manual", draftId)}
            onSaveDraft={(draft) => {
              saveDraft("manual", draft).catch((error) => {
                console.error("[GigStax] Manual expense save error:", error);
              });
            }}
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

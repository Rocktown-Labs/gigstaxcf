import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import { BulkDraftSkeleton } from "@/components/dashboard/bulk/bulk-draft-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/numeric-inputs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { EXPENSE_CATEGORY_OPTIONS } from "./category-options";
import type { ExpenseBulkDraft } from "./types";

interface ExpenseBulkDraftRowProps {
  draft: ExpenseBulkDraft;
  onChange: (patch: Partial<ExpenseBulkDraft>) => void;
  onRemove: () => void;
  onRetry?: () => void;
  onSave: () => void;
}

const statusMeta = {
  completed: {
    label: "Ready",
    tone: "text-primary",
  },
  failed: {
    label: "Needs Fix",
    tone: "text-destructive",
  },
  pending: {
    label: "Queued",
    tone: "text-amber-500",
  },
  processing: {
    label: "Processing",
    tone: "text-amber-500",
  },
} as const;

export function ExpenseBulkDraftRow({
  draft,
  onChange,
  onRemove,
  onRetry,
  onSave,
}: ExpenseBulkDraftRowProps) {
  const idPrefix = `bulk-expense-draft-${draft.id}`;
  const dayInputId = `${idPrefix}-day`;
  const categoryInputId = `${idPrefix}-category`;
  const amountInputId = `${idPrefix}-amount`;
  const merchantInputId = `${idPrefix}-merchant`;
  const notesInputId = `${idPrefix}-notes`;

  if (draft.extractionStatus === "pending") {
    return <BulkDraftSkeleton label="Queued" />;
  }

  if (draft.extractionStatus === "processing") {
    return <BulkDraftSkeleton label="Processing" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {draft.mode === "upload" ? "Receipt draft" : "Manual draft"}
          </span>
          <span
            className={`bg-secondary/40 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta[draft.extractionStatus].tone}`}
          >
            {statusMeta[draft.extractionStatus].label}
          </span>
        </div>

        {draft.mediaUrl ? (
          <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
            <a href={draft.mediaUrl} target="_blank" rel="noreferrer">
              Open Receipt
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={dayInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Incurred Day
          </label>
          <Input
            id={dayInputId}
            type="date"
            value={draft.incurredDate}
            onChange={(event) => onChange({ incurredDate: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={categoryInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Category
          </label>
          <Select
            value={draft.category}
            onValueChange={(value) =>
              onChange({ category: value as ExpenseBulkDraft["category"] })
            }
          >
            <SelectTrigger id={categoryInputId}>
              <SelectValue placeholder="Category" />
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={amountInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Amount
          </label>
          <MoneyInput
            id={amountInputId}
            value={draft.amount}
            onValueChange={(value) => onChange({ amount: value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={merchantInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Merchant
          </label>
          <Input
            id={merchantInputId}
            value={draft.merchant}
            onChange={(event) => onChange({ merchant: event.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={notesInputId}
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Notes
        </label>
        <Textarea
          id={notesInputId}
          rows={2}
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Optional notes"
        />
      </div>

      {draft.error ? (
        <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{draft.error}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {draft.extractionStatus === "failed" && onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Remove
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={draft.isSaving || !draft.amount || draft.isTypeMismatch}
        >
          {draft.isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save Expense
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

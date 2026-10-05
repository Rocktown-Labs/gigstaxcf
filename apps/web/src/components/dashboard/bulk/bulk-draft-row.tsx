import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

import { BulkDraftSkeleton } from "./bulk-draft-skeleton";
import type { BulkDraft, PlatformOption } from "./types";

interface BulkDraftRowProps {
  draft: BulkDraft;
  onChange: (patch: Partial<BulkDraft>) => void;
  platformOptions: PlatformOption[];
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

export function BulkDraftRow({
  draft,
  onChange,
  platformOptions,
  onRemove,
  onRetry,
  onSave,
}: BulkDraftRowProps) {
  const idPrefix = `bulk-draft-${draft.id}`;
  const platformInputId = `${idPrefix}-platform`;
  const statusInputId = `${idPrefix}-status`;
  const dayInputId = `${idPrefix}-day`;
  const timeInputId = `${idPrefix}-time`;
  const fareInputId = `${idPrefix}-fare`;
  const bonusInputId = `${idPrefix}-bonus`;
  const tipStatusInputId = `${idPrefix}-tip-status`;
  const tipAmountInputId = `${idPrefix}-tip-amount`;
  const milesInputId = `${idPrefix}-miles`;
  const durationInputId = `${idPrefix}-duration`;
  const stopsInputId = `${idPrefix}-stops`;
  const notesInputId = `${idPrefix}-notes`;

  if (draft.extractionStatus === "pending") {
    return <BulkDraftSkeleton label="Queued" />;
  }

  if (draft.extractionStatus === "processing") {
    return <BulkDraftSkeleton label="Processing" />;
  }

  const resolvedPlatformOptions = platformOptions.some(
    (platform) => platform.value === draft.platformSlug
  )
    ? platformOptions
    : [
        ...platformOptions,
        {
          label: draft.platformSlug
            .replaceAll("_", " ")
            .replaceAll(/\b\w/gu, (character) => character.toUpperCase()),
          value: draft.platformSlug,
        },
      ];

  const platformLabel =
    resolvedPlatformOptions.find(
      (platform) => platform.value === draft.platformSlug
    )?.label || draft.platformSlug;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {draft.mode === "upload" ? "Screenshot draft" : "Manual draft"}
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
              Open Image
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={platformInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Platform
          </label>
          <Select
            value={draft.platformSlug}
            onValueChange={(value) => onChange({ platformSlug: value })}
          >
            <SelectTrigger id={platformInputId}>
              <SelectValue placeholder={platformLabel} />
            </SelectTrigger>
            <SelectContent>
              {resolvedPlatformOptions.map((platform) => (
                <SelectItem key={platform.value} value={platform.value}>
                  {platform.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label
            htmlFor={statusInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Status
          </label>
          <Select
            value={draft.status}
            onValueChange={(value) =>
              onChange({ status: value as BulkDraft["status"] })
            }
          >
            <SelectTrigger id={statusInputId}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={dayInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Day
          </label>
          <Input
            id={dayInputId}
            type="date"
            value={draft.occurredDate}
            onChange={(event) => onChange({ occurredDate: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={timeInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Time
          </label>
          <Input
            id={timeInputId}
            type="time"
            value={draft.occurredTime}
            onChange={(event) => onChange({ occurredTime: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={fareInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Base Pay
          </label>
          <MoneyInput
            id={fareInputId}
            value={draft.fareAmount}
            onValueChange={(value) => onChange({ fareAmount: value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={bonusInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Bonus
          </label>
          <MoneyInput
            id={bonusInputId}
            value={draft.bonusAmount}
            onValueChange={(value) => onChange({ bonusAmount: value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor={tipStatusInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Tip Status
          </label>
          <Select
            value={draft.tipStatus}
            onValueChange={(value) =>
              onChange({ tipStatus: value as BulkDraft["tipStatus"] })
            }
          >
            <SelectTrigger id={tipStatusInputId}>
              <SelectValue placeholder="Tip status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Tip</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="final">Final</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label
            htmlFor={tipAmountInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Tip Amount
          </label>
          <MoneyInput
            id={tipAmountInputId}
            value={draft.tipAmount}
            onValueChange={(value) => onChange({ tipAmount: value })}
            placeholder="0.00"
            disabled={draft.tipStatus === "none"}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Money and mileage fields allow up to 2 decimals and auto-round on blur.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label
            htmlFor={milesInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Miles
          </label>
          <MileageInput
            id={milesInputId}
            value={draft.distanceMiles}
            onValueChange={(value) => onChange({ distanceMiles: value })}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={durationInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Duration (min)
          </label>
          <WholeNumberInput
            id={durationInputId}
            value={draft.durationMinutes}
            onValueChange={(value) => onChange({ durationMinutes: value })}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor={stopsInputId}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Stops
          </label>
          <WholeNumberInput
            id={stopsInputId}
            value={draft.stopsCount}
            onValueChange={(value) => onChange({ stopsCount: value })}
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
          disabled={draft.isSaving || !draft.fareAmount}
        >
          {draft.isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save Entry
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

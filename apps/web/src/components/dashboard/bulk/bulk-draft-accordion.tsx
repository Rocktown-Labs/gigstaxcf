import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { BulkDraftRow } from "./bulk-draft-row";
import type { BulkDraft, PlatformOption } from "./types";

interface BulkDraftAccordionProps {
  drafts: BulkDraft[];
  emptyMessage: string;
  onChangeDraft: (draftId: string, patch: Partial<BulkDraft>) => void;
  onOpenItemsChange: (items: string[]) => void;
  platformOptions: PlatformOption[];
  onRemoveDraft: (draftId: string) => void;
  onRetryDraft?: (draft: BulkDraft) => void;
  onSaveDraft: (draft: BulkDraft) => void;
  openItems: string[];
}

function statusSummaryLabel(status: BulkDraft["extractionStatus"]) {
  if (status === "pending") {
    return "Queued";
  }

  if (status === "processing") {
    return "Processing";
  }

  if (status === "failed") {
    return "Needs Fix";
  }

  return "Ready";
}

export function BulkDraftAccordion({
  drafts,
  emptyMessage,
  onChangeDraft,
  onOpenItemsChange,
  platformOptions,
  onRemoveDraft,
  onRetryDraft,
  onSaveDraft,
  openItems,
}: BulkDraftAccordionProps) {
  if (drafts.length === 0) {
    return (
      <div className="border-border/60 text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Accordion
      type="multiple"
      value={openItems}
      onValueChange={onOpenItemsChange}
      className="border-border/50 rounded-xl border px-4"
    >
      {drafts.map((draft) => (
        <AccordionItem key={draft.id} value={draft.id}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex w-full items-center justify-between pr-3">
              <span className="font-medium">{draft.title}</span>
              <span className="text-muted-foreground text-xs">
                {statusSummaryLabel(draft.extractionStatus)}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <BulkDraftRow
              draft={draft}
              onChange={(patch) => onChangeDraft(draft.id, patch)}
              platformOptions={platformOptions}
              onRemove={() => onRemoveDraft(draft.id)}
              onRetry={
                onRetryDraft
                  ? () => {
                      onRetryDraft(draft);
                    }
                  : undefined
              }
              onSave={() => onSaveDraft(draft)}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

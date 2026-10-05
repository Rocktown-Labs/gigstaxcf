import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { ExpenseBulkDraftRow } from "./expense-bulk-draft-row";
import type { ExpenseBulkDraft } from "./types";

interface ExpenseBulkDraftAccordionProps {
  drafts: ExpenseBulkDraft[];
  emptyMessage: string;
  onChangeDraft: (draftId: string, patch: Partial<ExpenseBulkDraft>) => void;
  onOpenItemsChange: (items: string[]) => void;
  onRemoveDraft: (draftId: string) => void;
  onRetryDraft?: (draft: ExpenseBulkDraft) => void;
  onSaveDraft: (draft: ExpenseBulkDraft) => void;
  openItems: string[];
}

function statusSummaryLabel(status: ExpenseBulkDraft["extractionStatus"]) {
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

export function ExpenseBulkDraftAccordion({
  drafts,
  emptyMessage,
  onChangeDraft,
  onOpenItemsChange,
  onRemoveDraft,
  onRetryDraft,
  onSaveDraft,
  openItems,
}: ExpenseBulkDraftAccordionProps) {
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
            <ExpenseBulkDraftRow
              draft={draft}
              onChange={(patch) => onChangeDraft(draft.id, patch)}
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

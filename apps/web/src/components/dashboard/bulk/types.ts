export type ParsedTipStatus = "none" | "pending" | "final";
export type EntryStatus = "offered" | "accepted" | "completed" | "cancelled";
export type ExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";
export type BulkDraftMode = "upload" | "manual";

export interface PlatformOption {
  colorHex?: string;
  label: string;
  value: string;
}

export interface ExtractionPayload {
  bonusAmount?: number | null;
  distanceMiles?: number | null;
  durationSeconds?: number | null;
  entryType?: "earning" | "expense";
  expenseAmount?: number | null;
  expenseCategory?: string | null;
  fareAmount?: number | null;
  notes?: string | null;
  platformSlug?: string | null;
  stopsCount?: number | null;
  tipEstimatedAmount?: number | null;
  tipFinalAmount?: number | null;
  tipStatus?: ParsedTipStatus;
  totalEstimatedAmount?: number | null;
  totalFinalAmount?: number | null;
}

export interface BulkQueueItem {
  draftId: string;
  extractionId: number;
  filename: string;
  mediaId: number;
  mediaUrl: string;
  status: ExtractionStatus;
}

export interface BulkStatusItem {
  errorMessage: string | null;
  extractionId: number;
  mediaUrl: string;
  parsedPayload: ExtractionPayload | null;
  status: ExtractionStatus;
  updatedAt: string;
  workflowRunId: string | null;
}

export interface BulkDraft {
  bonusAmount: string;
  distanceMiles: string;
  durationMinutes: string;
  error: string | null;
  extractionId: number | null;
  extractionStatus: ExtractionStatus;
  fareAmount: string;
  id: string;
  isSaving: boolean;
  mediaUrl: string | null;
  mode: BulkDraftMode;
  notes: string;
  occurredDate: string;
  occurredTime: string;
  platformSlug: string;
  sourceFile: File | null;
  status: EntryStatus;
  stopsCount: string;
  tipAmount: string;
  tipStatus: ParsedTipStatus;
  title: string;
}

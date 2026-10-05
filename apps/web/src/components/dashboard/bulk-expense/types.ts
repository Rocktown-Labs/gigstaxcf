export type ExpenseCategory =
  | "fuel"
  | "maintenance"
  | "tolls"
  | "parking"
  | "supplies"
  | "phone"
  | "other";

export type ExpenseExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type ExpenseBulkDraftMode = "upload" | "manual";

export interface ExpenseExtractionPayload {
  entryType?: "earning" | "expense";
  expenseAmount?: number | null;
  expenseCategory?: string | null;
  notes?: string | null;
}

export interface ExpenseBulkQueueItem {
  draftId: string;
  extractionId: number;
  filename: string;
  mediaId: number;
  mediaUrl: string;
  status: ExpenseExtractionStatus;
}

export interface ExpenseBulkStatusItem {
  errorMessage: string | null;
  extractionId: number;
  mediaUrl: string;
  parsedPayload: ExpenseExtractionPayload | null;
  status: ExpenseExtractionStatus;
  updatedAt: string;
  workflowRunId: string | null;
}

export interface ExpenseBulkDraft {
  amount: string;
  category: ExpenseCategory;
  error: string | null;
  extractionId: number | null;
  extractionStatus: ExpenseExtractionStatus;
  id: string;
  incurredDate: string;
  isTypeMismatch: boolean;
  isSaving: boolean;
  mediaId: number | null;
  mediaUrl: string | null;
  merchant: string;
  mode: ExpenseBulkDraftMode;
  notes: string;
  title: string;
}

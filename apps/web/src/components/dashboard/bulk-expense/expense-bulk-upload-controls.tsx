import { Link } from "@tanstack/react-router";
import { Loader2, ScanLine } from "lucide-react";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EXPENSE_CATEGORY_OPTIONS } from "./category-options";
import type { ExpenseCategory } from "./types";

interface ExpenseBulkUploadControlsProps {
  analyzeError: string;
  categoryOverride: ExpenseCategory | "auto";
  isQueueing: boolean;
  onAnalyze: () => void;
  onCategoryOverrideChanged: (value: ExpenseCategory | "auto") => void;
  onClearSelection: () => void;
  onFilesChanged: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectedDateChanged: (value: string) => void;
  selectedDate: string;
  selectedFilesCount: number;
  showUpgradeOrCreditsCta?: boolean;
}

export function ExpenseBulkUploadControls({
  analyzeError,
  categoryOverride,
  isQueueing,
  onAnalyze,
  onCategoryOverrideChanged,
  onClearSelection,
  onFilesChanged,
  onSelectedDateChanged,
  selectedDate,
  selectedFilesCount,
  showUpgradeOrCreditsCta = false,
}: ExpenseBulkUploadControlsProps) {
  const dayInputId = "expense-bulk-upload-day";
  const categorySelectId = "expense-bulk-upload-category";
  const filesInputId = "expense-bulk-upload-files";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor={dayInputId} className="text-sm font-semibold">
            Incurred Day
          </label>
          <Input
            id={dayInputId}
            type="date"
            value={selectedDate}
            onChange={(event) => onSelectedDateChanged(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={categorySelectId} className="text-sm font-semibold">
            Category Override
          </label>
          <Select
            value={categoryOverride}
            onValueChange={(value) =>
              onCategoryOverrideChanged(value as ExpenseCategory | "auto")
            }
          >
            <SelectTrigger id={categorySelectId}>
              <SelectValue placeholder="Auto detect category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto Detect from Receipt</SelectItem>
              {EXPENSE_CATEGORY_OPTIONS.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor={filesInputId} className="text-sm font-semibold">
            Receipt Screenshots
          </label>
          <Input
            id={filesInputId}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesChanged}
          />
        </div>
      </div>

      {analyzeError ? (
        <div className="border-destructive/20 bg-destructive/10 text-destructive space-y-3 rounded-xl border p-3 text-sm">
          <p>{analyzeError}</p>
          {showUpgradeOrCreditsCta ? (
            <Button type="button" variant="outline" asChild>
              <Link to="/dashboard/billing">Upgrade or Buy Credits</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={onAnalyze}
          disabled={selectedFilesCount === 0 || isQueueing}
        >
          {isQueueing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Queueing...
            </>
          ) : (
            <>
              <ScanLine className="mr-2 h-4 w-4" />
              Queue {selectedFilesCount > 0 ? selectedFilesCount : ""} Receipt
              {selectedFilesCount === 1 ? "" : "s"}
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onClearSelection}
          disabled={selectedFilesCount === 0 || isQueueing}
        >
          Clear Selection
        </Button>
      </div>
    </div>
  );
}

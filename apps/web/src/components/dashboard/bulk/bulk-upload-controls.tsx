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

import type { PlatformOption } from "./types";

interface BulkUploadControlsProps {
  analyzeError: string;
  isQueueing: boolean;
  onAnalyze: () => void;
  onClearSelection: () => void;
  onFilesChanged: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlatformOverrideChanged: (value: string) => void;
  onSelectedDateChanged: (value: string) => void;
  platformOptions: PlatformOption[];
  platformOverride: string;
  selectedDate: string;
  selectedFilesCount: number;
  showUpgradeOrCreditsCta?: boolean;
}

export function BulkUploadControls({
  analyzeError,
  isQueueing,
  onAnalyze,
  onClearSelection,
  onFilesChanged,
  onPlatformOverrideChanged,
  onSelectedDateChanged,
  platformOptions,
  platformOverride,
  selectedDate,
  selectedFilesCount,
  showUpgradeOrCreditsCta = false,
}: BulkUploadControlsProps) {
  const dayInputId = "bulk-upload-day";
  const platformSelectId = "bulk-upload-platform";
  const filesInputId = "bulk-upload-files";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor={dayInputId} className="text-sm font-semibold">
            Day
          </label>
          <Input
            id={dayInputId}
            type="date"
            value={selectedDate}
            onChange={(event) => onSelectedDateChanged(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={platformSelectId} className="text-sm font-semibold">
            Platform Override
          </label>
          <Select
            value={platformOverride}
            onValueChange={onPlatformOverrideChanged}
          >
            <SelectTrigger id={platformSelectId}>
              <SelectValue placeholder="Auto detect platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto Detect from Image</SelectItem>
              {platformOptions.map((platform) => (
                <SelectItem key={platform.value} value={platform.value}>
                  {platform.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor={filesInputId} className="text-sm font-semibold">
            Screenshots
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
              Queue {selectedFilesCount > 0 ? selectedFilesCount : ""}{" "}
              Screenshot
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

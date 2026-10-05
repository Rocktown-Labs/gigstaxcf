import { Link } from "@tanstack/react-router";
import { CalendarDays, Lock, MoreHorizontal } from "lucide-react";

import { ResponsiveDataCards } from "@/components/dashboard/responsive-data-cards";
import { ResponsiveDataCardsSkeleton } from "@/components/dashboard/responsive-data-cards-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  StubCadence,
  StubFieldKey,
  StubSnapshot,
} from "@/lib/stubs/types";
import { cn } from "@/lib/utils";

interface IncomeStubHistoryRow {
  anchorDate: string;
  cadence: StubCadence;
  fieldKeys: StubFieldKey[];
  lockedAt: string | null;
  periodEnd: string;
  periodStart: string;
  publicId: string;
  revision: number;
  snapshot: StubSnapshot;
  status: "draft" | "locked";
}

interface StubHistoryTableProps {
  emptyMessage: string;
  isLoading?: boolean;
  lockPendingId?: string | null;
  onLock?: (publicId: string) => void | Promise<void>;
  stubs: IncomeStubHistoryRow[];
  totalCount?: number;
}

const CADENCE_LABELS: Record<StubCadence, string> = {
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  weekly: "Weekly",
};

export function StubHistoryTable({
  emptyMessage,
  isLoading = false,
  lockPendingId = null,
  onLock,
  stubs,
  totalCount,
}: StubHistoryTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <ResponsiveDataCardsSkeleton className="xl:hidden" cards={3} />
        <div className="border-border bg-card hidden rounded-2xl border xl:block">
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_value, index) => (
              <div
                key={index}
                className="bg-muted/60 h-10 animate-pulse rounded-md"
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (stubs.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  const displayCount = totalCount ?? stubs.length;

  return (
    <div className="space-y-3">
      <ResponsiveDataCards
        className="xl:hidden"
        items={stubs}
        getKey={(stub) => stub.publicId}
        renderCard={(stub) => {
          const lockDisabled = lockPendingId === stub.publicId;

          return (
            <article className="border-border bg-card rounded-2xl border p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-muted-foreground font-mono text-xs">
                  {stub.publicId}
                </p>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    stub.status === "locked"
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-amber-400/40 bg-amber-100 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-200"
                  )}
                >
                  {stub.status}
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                <p>
                  Cadence:{" "}
                  <span className="font-semibold">
                    {CADENCE_LABELS[stub.cadence]}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Window: {stub.periodStart} to {stub.periodEnd}
                </p>
                <p className="text-muted-foreground">
                  Revision: v{stub.revision}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/dashboard/stubs/$id"
                    params={{ id: stub.publicId }}
                  >
                    View
                  </Link>
                </Button>
                {stub.status === "draft" ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={lockDisabled}
                    onClick={() => onLock?.(stub.publicId)}
                  >
                    <Lock className="mr-1 h-3.5 w-3.5" />
                    Lock
                  </Button>
                ) : null}
              </div>
            </article>
          );
        }}
      />

      <div className="border-border bg-card hidden overflow-x-auto rounded-2xl border xl:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Generated stub history</caption>
          <thead className="bg-muted text-foreground text-left">
            <tr>
              <th className="p-3 font-semibold">Stub ID</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Cadence</th>
              <th className="p-3 font-semibold">Window</th>
              <th className="p-3 font-semibold">Revision</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stubs.map((stub) => {
              const lockDisabled = lockPendingId === stub.publicId;

              return (
                <tr
                  key={stub.publicId}
                  className="border-border hover:bg-muted/40 border-t transition-colors"
                >
                  <td className="p-3 font-mono text-xs">{stub.publicId}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        stub.status === "locked"
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-amber-400/40 bg-amber-100 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-200"
                      )}
                    >
                      {stub.status}
                    </span>
                  </td>
                  <td className="p-3">{CADENCE_LABELS[stub.cadence]}</td>
                  <td className="p-3">
                    {stub.periodStart} to {stub.periodEnd}
                  </td>
                  <td className="p-3">v{stub.revision}</td>
                  <td className="p-3">
                    <div className="hidden justify-end gap-2 2xl:flex">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/dashboard/stubs/$id"
                          params={{ id: stub.publicId }}
                        >
                          View
                        </Link>
                      </Button>
                      {stub.status === "draft" ? (
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          disabled={lockDisabled}
                          onClick={() => onLock?.(stub.publicId)}
                        >
                          <Lock className="mr-1 h-3.5 w-3.5" />
                          Lock
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex justify-end 2xl:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={`Actions for ${stub.publicId}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem asChild>
                            <Link
                              to="/dashboard/stubs/$id"
                              params={{ id: stub.publicId }}
                            >
                              View
                            </Link>
                          </DropdownMenuItem>
                          {stub.status === "draft" ? (
                            <DropdownMenuItem
                              disabled={lockDisabled}
                              onSelect={() => onLock?.(stub.publicId)}
                            >
                              <Lock className="mr-2 h-4 w-4" />
                              Lock
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-border/50 bg-card/30 text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
        <CalendarDays className="h-3.5 w-3.5" />
        {displayCount} record{displayCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  dashboardPageMainWideClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { StubHistoryTable } from "@/components/dashboard/stub-history-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type {
  StubCadence,
  StubFieldKey,
  StubSnapshot,
} from "@/lib/stubs/types";

interface StubVerificationProfile {
  address: string;
  email: string;
  issuerName: string;
  legalName: string;
  phone: string;
}

interface StubProfileRecord {
  autoGenerateEnabled: boolean;
  defaultFieldKeys: StubFieldKey[];
  primaryCadence: StubCadence;
  verificationProfile: StubVerificationProfile;
}

interface IncomeStubRecord {
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

interface StubsListResponse {
  defaults: Record<
    StubCadence,
    {
      anchorDate: string;
      period: {
        endDate: string;
        startDate: string;
      };
    }
  >;
  profile: StubProfileRecord;
  stubs: IncomeStubRecord[];
}

const EMPTY_STUBS: IncomeStubRecord[] = [];

const getErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error || "Request failed";
};

const HISTORY_PAGE_SIZE = 10;

const stubsHistorySearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/dashboard/stubs/history")({
  component: StubHistoryPage,
  validateSearch: (search) => stubsHistorySearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Stub History" }],
  }),
});

function StubHistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/stubs/history" });
  const queryClient = useQueryClient();
  const [lockPendingId, setLockPendingId] = useState<string | null>(null);
  const page = search.page ?? 1;

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      navigate({
        search: (prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (key === "page") {
              next.page = value
                ? Math.max(1, Number.parseInt(value, 10) || 1)
                : undefined;
            }
          }
          return next;
        },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate]
  );

  const stubsQuery = useQuery<StubsListResponse>({
    queryFn: async () => {
      const response = await apiFetch("/api/stubs");
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return (await response.json()) as StubsListResponse;
    },
    queryKey: ["stubs", "all"],
  });

  const lockMutation = useMutation({
    mutationFn: async (publicId: string) => {
      const response = await apiFetch(`/api/stubs/${publicId}/lock`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stubs"] });
    },
  });

  const handleLockStub = async (publicId: string) => {
    setLockPendingId(publicId);
    try {
      await lockMutation.mutateAsync(publicId);
    } catch (error) {
      setLockPendingId(null);
      throw error;
    }
    setLockPendingId(null);
  };

  const listError =
    stubsQuery.error instanceof Error ? stubsQuery.error.message : null;
  const historyStubs = stubsQuery.data?.stubs ?? EMPTY_STUBS;
  const totalPages = Math.max(
    1,
    Math.ceil(historyStubs.length / HISTORY_PAGE_SIZE)
  );
  const clampedPage = Math.min(totalPages, Math.max(1, page));
  const paginatedStubs = useMemo(() => {
    const startIndex = (clampedPage - 1) * HISTORY_PAGE_SIZE;
    return historyStubs.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [clampedPage, historyStubs]);

  useEffect(() => {
    if (clampedPage !== page) {
      updateSearchParams({
        page: clampedPage > 1 ? String(clampedPage) : null,
      });
    }
  }, [clampedPage, page, updateSearchParams]);

  const startItem =
    historyStubs.length === 0 ? 0 : (clampedPage - 1) * HISTORY_PAGE_SIZE + 1;
  const endItem = Math.min(
    clampedPage * HISTORY_PAGE_SIZE,
    historyStubs.length
  );

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainWideClass} space-y-6`}>
        <Button variant="ghost" asChild className="-ml-2 w-fit">
          <Link to="/dashboard/stubs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stub Suite
          </Link>
        </Button>

        <Card className="border-border bg-card/95 rounded-3xl shadow-lg">
          <CardHeader>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-xl">
                <History className="text-primary h-5 w-5" />
                Stub History
              </CardTitle>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Showing {startItem}-{endItem} of {historyStubs.length}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {listError ? (
              <p className="text-destructive text-sm">
                Failed to load history: {listError}
              </p>
            ) : (
              <>
                <StubHistoryTable
                  stubs={paginatedStubs}
                  totalCount={historyStubs.length}
                  lockPendingId={lockPendingId}
                  onLock={handleLockStub}
                  isLoading={stubsQuery.isLoading}
                  emptyMessage="No saved stubs yet."
                />
                <DashboardPaginationControls
                  page={clampedPage}
                  totalPages={totalPages}
                  onPageChange={(nextPage) =>
                    updateSearchParams({
                      page: nextPage > 1 ? String(nextPage) : null,
                    })
                  }
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText, Lock } from "lucide-react";

import {
  dashboardPageMainComfortableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { StubDocument } from "@/components/dashboard/stub-document";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, apiUrl } from "@/lib/api";
import type { StubSnapshot } from "@/lib/stubs/types";
import { cn } from "@/lib/utils";

interface IncomeStubRecord {
  lockedAt: string | null;
  publicId: string;
  revision: number;
  snapshot: StubSnapshot;
  status: "draft" | "locked";
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="border-border/60 bg-background/40 rounded-xl border p-3">
    <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
      {label}
    </p>
    <p className="mt-1 font-medium capitalize">{value}</p>
  </div>
);

export const Route = createFileRoute("/dashboard/stubs/$id")({
  component: StubDetailPage,
  head: () => ({
    meta: [{ title: "Stub Details" }],
  }),
});

function StubDetailPage() {
  const params = Route.useParams();
  const queryClient = useQueryClient();

  const stubQuery = useQuery<{ stub: IncomeStubRecord }>({
    enabled: Boolean(params.id),
    queryFn: async () => {
      const response = await apiFetch(`/api/stubs/${params.id}`);
      if (!response.ok) {
        throw new Error("Failed to load stub");
      }

      return (await response.json()) as { stub: IncomeStubRecord };
    },
    queryKey: ["stub", params.id],
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/stubs/${params.id}/lock`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to lock stub");
      }

      return (await response.json()) as { stub: IncomeStubRecord };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stub", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["stubs"] });
    },
  });

  const stub = stubQuery.data?.stub || null;

  if (stubQuery.isLoading) {
    return (
      <div className={cn(dashboardPageMainComfortableClass, "py-10")}>
        <div className="border-primary/20 border-t-primary h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    );
  }

  if (!stub) {
    return (
      <div className={cn(dashboardPageMainComfortableClass, "py-10")}>
        <h2 className="text-2xl font-bold">Stub not found</h2>
        <Button asChild className="mt-4">
          <Link to="/dashboard/stubs">Back to stubs</Link>
        </Button>
      </div>
    );
  }

  const handleDownloadPdf = async () => {
    if (stub.status === "draft") {
      await lockMutation.mutateAsync();
    }

    window.location.assign(apiUrl(`/api/stubs/${stub.publicId}/pdf`));
  };

  const handleDownloadCsv = async () => {
    if (stub.status === "draft") {
      await lockMutation.mutateAsync();
    }

    window.location.assign(apiUrl(`/api/stubs/${stub.publicId}/csv`));
  };
  const handleLockStub = () => lockMutation.mutate();

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainComfortableClass} space-y-6`}>
        <Button variant="ghost" asChild className="-ml-2">
          <Link to="/dashboard/stubs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Stub Suite
          </Link>
        </Button>

        <Card className="border-border/50 bg-card/90 rounded-2xl">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl">Stub {stub.publicId}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {stub.status === "draft" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLockStub}
                  disabled={lockMutation.isPending}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Lock Stub
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPdf}
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadCsv}
              >
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <Meta label="Status" value={stub.status} />
              <Meta label="Revision" value={`v${stub.revision}`} />
              <Meta
                label="Period"
                value={`${stub.snapshot.period.startDate} to ${stub.snapshot.period.endDate}`}
              />
              <Meta
                label="Locked At"
                value={
                  stub.lockedAt
                    ? new Date(stub.lockedAt).toLocaleString()
                    : "Draft"
                }
              />
            </div>
            <StubDocument snapshot={stub.snapshot} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { AdminSubpageHeader } from "@/components/dashboard/admin/admin-subpage-header";
import { AdminUsersPageClient } from "@/components/dashboard/admin/admin-users-page-client";
import {
  dashboardPageMainComfortableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";

const adminUsersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/dashboard/admin/users")({
  component: RouteComponent,
  validateSearch: (search) => adminUsersSearchSchema.parse(search),
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin Users" }],
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/admin/users" });

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

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainComfortableClass} space-y-6`}>
        <AdminSubpageHeader
          title="Admin Users"
          description="Manage role assignments and inspect account status."
        />
        <AdminUsersPageClient
          onSearchParamsChange={updateSearchParams}
          page={search.page ?? 1}
        />
      </main>
    </div>
  );
}

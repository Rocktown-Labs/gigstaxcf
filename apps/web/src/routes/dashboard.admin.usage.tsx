import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminSubpageHeader } from "@/components/dashboard/admin/admin-subpage-header";
import { AdminUsagePageClient } from "@/components/dashboard/admin/admin-usage-page-client";
import {
  dashboardPageMainComfortableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";

export const Route = createFileRoute("/dashboard/admin/usage")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin Usage" }],
  }),
});

function RouteComponent() {
  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainComfortableClass} space-y-6`}>
        <AdminSubpageHeader
          title="Admin Usage"
          description="Track cross-app meter volume, cost, and user usage health from one operations console."
        />

        <AdminUsagePageClient />
      </main>
    </div>
  );
}

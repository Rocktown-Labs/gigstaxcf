import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminPricingPageClient } from "@/components/dashboard/admin/admin-pricing-page-client";
import { AdminSubpageHeader } from "@/components/dashboard/admin/admin-subpage-header";
import {
  dashboardPageMainComfortableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";

export const Route = createFileRoute("/dashboard/admin/pricing")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin Pricing" }],
  }),
});

function RouteComponent() {
  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainComfortableClass} space-y-6`}>
        <AdminSubpageHeader
          title="Admin Pricing"
          description="Control plan pricing, credit packs, quotas, and Polar sync from inside GigStax."
        />

        <AdminPricingPageClient />
      </main>
    </div>
  );
}

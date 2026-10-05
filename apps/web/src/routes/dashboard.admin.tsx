import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import {
  dashboardPageMainReadableClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/dashboard/admin")({
  component: AdminDashboardPage,
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin" }],
  }),
});

interface AdminOverviewResponse {
  stats: {
    activePaidSubscriptions: number;
    adminUsers: number;
    onboardedUsers: number;
    totalUsers: number;
  };
}

// The legacy page queried the DB directly server-side; the ported page uses
// the equivalent GET /api/admin/overview endpoint.
function AdminDashboardPage() {
  const overviewQuery = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/admin/overview");
      if (!response.ok) {
        throw new Error("Failed to load admin overview");
      }

      return (await response.json()) as AdminOverviewResponse;
    },
    queryKey: ["admin-overview"],
  });

  const stats = overviewQuery.data?.stats ?? {
    activePaidSubscriptions: 0,
    adminUsers: 0,
    onboardedUsers: 0,
    totalUsers: 0,
  };

  return (
    <div className={dashboardPageOuterClass}>
      <main className={`${dashboardPageMainReadableClass} space-y-6`}>
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">
            Manage users, pricing catalog, and usage operations.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalUsers}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm">
                Onboarded
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.onboardedUsers}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm">
                Active Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {stats.activePaidSubscriptions}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm">
                Admin Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.adminUsers}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Button asChild className="rounded-xl">
            <Link to="/dashboard/admin/users">Manage Users</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/dashboard/admin/pricing">Manage Pricing</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/dashboard/admin/usage">Usage Analytics</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

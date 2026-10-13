import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DashboardLayoutClient } from "@/components/dashboard/dashboard-layout-client";
import { apiFetch } from "@/lib/api";

export interface DashboardUser {
  createdAt: string;
  currencyCode: string | null;
  email: string;
  id: number;
  isOnboarded: boolean;
  locationText: string | null;
  name: string;
  onboardedAt: string | null;
  role: string;
  timezone: string | null;
  weekStartsOn: string | null;
}

interface DashboardUserResponse {
  user?: DashboardUser;
}

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: DashboardLayout,
  beforeLoad: async () => {
    // Ported from `requireDashboardAccess`: every dashboard route renders
    // inside this layout and shares the guarded user context.
    const response = await apiFetch("/api/user");

    if (response.status === 401) {
      throw redirect({ to: "/login" });
    }

    if (!response.ok) {
      throw redirect({ to: "/login" });
    }

    const payload = (await response.json()) as DashboardUserResponse;
    const { user } = payload;

    if (!user) {
      throw redirect({ to: "/login" });
    }

    if (!user.isOnboarded) {
      throw redirect({ to: "/onboarding" });
    }

    return { user };
  },
});

function DashboardLayout() {
  return (
    <DashboardLayoutClient>
      <Outlet />
    </DashboardLayoutClient>
  );
}

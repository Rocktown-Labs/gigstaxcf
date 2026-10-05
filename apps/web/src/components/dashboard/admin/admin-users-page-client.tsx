import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { DashboardPaginationControls } from "@/components/dashboard/dashboard-pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";

interface AdminUserRow {
  createdAt: string;
  email: string;
  id: number;
  isOnboarded: boolean;
  name: string;
  role: "admin" | "driver";
  subscriptionBillingInterval: "month" | "year" | null;
  subscriptionPlanTier: "free" | "starter" | "driver" | "pro_driver" | null;
  subscriptionStatus: string | null;
}

interface AdminUserGrowthPoint {
  date: string;
  label: string;
  newUsers: number;
  onboardedUsers: number;
  paidUsers: number;
}

interface AdminUsersListResponse {
  pagination?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  summary?: {
    activePaidUsers: number;
    adminUsers: number;
    onboardedUsers: number;
    totalUsers: number;
  };
  userGrowth?: AdminUserGrowthPoint[];
  users?: AdminUserRow[];
}

const USERS_PAGE_SIZE = 10;

interface AdminUsersPageClientProps {
  onSearchParamsChange: (updates: Record<string, string | null>) => void;
  page: number;
}

const userGrowthChartConfig = {
  newUsers: {
    color: "#3b82f6",
    label: "New Users",
  },
  onboardedUsers: {
    color: "#22c55e",
    label: "Onboarded Users",
  },
  paidUsers: {
    color: "#f59e0b",
    label: "Paid Users",
  },
} satisfies ChartConfig;

export function AdminUsersPageClient({
  onSearchParamsChange,
  page,
}: AdminUsersPageClientProps) {
  const queryClient = useQueryClient();

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      onSearchParamsChange(updates);
    },
    [onSearchParamsChange]
  );

  const usersQuery = useQuery({
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(USERS_PAGE_SIZE),
      });

      const response = await apiFetch(`/api/admin/users?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load users");
      }

      return (await response.json()) as AdminUsersListResponse;
    },
    queryKey: ["admin-users", page],
  });

  const roleMutation = useMutation({
    mutationFn: async (args: { role: "admin" | "driver"; userId: number }) => {
      const response = await apiFetch(`/api/admin/users/${args.userId}/role`, {
        body: JSON.stringify({ role: args.role }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to update role");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const users = usersQuery.data?.users ?? [];
  const userGrowth = usersQuery.data?.userGrowth ?? [];
  const pagination = usersQuery.data?.pagination ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    page,
    pageSize: USERS_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  };
  const summary = usersQuery.data?.summary ?? {
    activePaidUsers: 0,
    adminUsers: 0,
    onboardedUsers: 0,
    totalUsers: 0,
  };

  useEffect(() => {
    if (pagination.page !== page) {
      updateSearchParams({ page: String(pagination.page) });
    }
  }, [page, pagination.page, updateSearchParams]);

  const startItem =
    pagination.totalItems === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalUsers}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">
              Onboarded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.onboardedUsers}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">
              Active Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.activePaidUsers}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">
              Admin Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.adminUsers}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle>User Growth (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading chart...</p>
          ) : null}
          {usersQuery.isError ? (
            <p className="text-destructive text-sm">
              Failed to load user growth data.
            </p>
          ) : null}

          {!usersQuery.isLoading && !usersQuery.isError ? (
            <ChartContainer
              config={userGrowthChartConfig}
              className="h-[280px] w-full"
            >
              <AreaChart
                accessibilityLayer
                data={userGrowth}
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value, name) => (
                        <span className="font-medium">
                          {name}: {Number(value).toLocaleString()}
                        </span>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <defs>
                  <linearGradient id="fillNewUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-newUsers)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-newUsers)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient
                    id="fillOnboardedUsers"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-onboardedUsers)"
                      stopOpacity={0.75}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-onboardedUsers)"
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                  <linearGradient
                    id="fillPaidUsers"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-paidUsers)"
                      stopOpacity={0.7}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-paidUsers)"
                      stopOpacity={0.06}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="newUsers"
                  type="monotone"
                  fill="url(#fillNewUsers)"
                  stroke="var(--color-newUsers)"
                  fillOpacity={1}
                  strokeWidth={2}
                />
                <Area
                  dataKey="onboardedUsers"
                  type="monotone"
                  fill="url(#fillOnboardedUsers)"
                  stroke="var(--color-onboardedUsers)"
                  fillOpacity={1}
                  strokeWidth={2}
                />
                <Area
                  dataKey="paidUsers"
                  type="monotone"
                  fill="url(#fillPaidUsers)"
                  stroke="var(--color-paidUsers)"
                  fillOpacity={1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {usersQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading users...</p>
          ) : null}
          {usersQuery.isError ? (
            <p className="text-destructive text-sm">Failed to load users.</p>
          ) : null}

          {!usersQuery.isLoading && !usersQuery.isError ? (
            <>
              <div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
                <p>
                  Showing {startItem}-{endItem} of {pagination.totalItems}
                </p>
                <p>
                  {pagination.totalItems} user
                  {pagination.totalItems === 1 ? "" : "s"}
                </p>
              </div>

              <div className="border-border/50 overflow-x-auto rounded-xl border">
                <table className="min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-border/50 bg-background/80 text-muted-foreground border-b text-left">
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Plan</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Onboarded</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-border/40 border-b">
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {user.email}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {user.subscriptionPlanTier || "free"}
                          {user.subscriptionBillingInterval
                            ? ` (${user.subscriptionBillingInterval})`
                            : ""}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {user.subscriptionStatus || "free"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {user.isOnboarded ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Select
                            value={user.role}
                            onValueChange={(value) => {
                              roleMutation.mutate({
                                role: value === "admin" ? "admin" : "driver",
                                userId: user.id,
                              });
                            }}
                            disabled={roleMutation.isPending}
                          >
                            <SelectTrigger
                              aria-label={`Change role for ${user.email}`}
                              className="h-9 w-[130px]"
                            >
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="driver">Driver</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DashboardPaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(nextPage) => {
                  updateSearchParams({ page: String(nextPage) });
                }}
              />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

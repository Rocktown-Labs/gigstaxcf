import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { NotificationsPageClient } from "@/components/dashboard/notifications-page-client";

const notificationsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  tripPage: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/dashboard/notifications")({
  component: RouteComponent,
  validateSearch: (search) => notificationsSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Notifications" }],
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/notifications" });

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      navigate({
        search: (prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (key !== "page" && key !== "tripPage") {
              continue;
            }

            const pageNumber = value
              ? Math.max(1, Number.parseInt(value, 10) || 1)
              : undefined;
            next[key] = pageNumber;
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
    <NotificationsPageClient
      onSearchParamsChange={updateSearchParams}
      page={search.page ?? 1}
      tripPage={search.tripPage ?? 1}
    />
  );
}

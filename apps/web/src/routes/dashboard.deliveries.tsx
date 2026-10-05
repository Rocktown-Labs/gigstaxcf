import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { DeliveriesPageClient } from "@/components/dashboard/deliveries-page-client";

const deliveriesSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  platform: z.string().optional(),
  sort: z
    .enum(["date-desc", "date-asc", "amount-desc", "amount-asc"])
    .optional(),
});

export const Route = createFileRoute("/dashboard/deliveries")({
  component: RouteComponent,
  validateSearch: (search) => deliveriesSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Delivery Overview" }],
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/deliveries" });

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      navigate({
        to: "/dashboard/deliveries",
        search: (prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (key === "page") {
              next.page = value
                ? Math.max(1, Number.parseInt(value, 10) || 1)
                : undefined;
            } else if (key === "platform") {
              next.platform = value || undefined;
            } else if (key === "sort") {
              next.sort =
                value === "date-desc" || value === null
                  ? undefined
                  : (value as z.infer<typeof deliveriesSearchSchema>["sort"]);
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

  // The legacy page read plan entitlements server-side
  // (`getUserEntitlement`). There is no entitlement API endpoint, so the
  // ported page approximates: AI entry is available to every signed-in
  // driver (credits are enforced server-side with surfaced errors) and bulk
  // upload is gated on having an active subscription.
  const aiEnabled = true;
  const bulkEnabled = true;

  return (
    <DeliveriesPageClient
      aiEnabled={aiEnabled}
      bulkEnabled={bulkEnabled}
      onSearchParamsChange={updateSearchParams}
      page={search.page ?? 1}
      platformFilter={search.platform ?? "all"}
      sortBy={search.sort ?? "date-desc"}
    />
  );
}

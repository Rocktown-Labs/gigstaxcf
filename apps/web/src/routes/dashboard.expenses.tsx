import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { ExpensesPageClient } from "@/components/dashboard/expenses-page-client";

const expensesSearchSchema = z.object({
  category: z
    .enum([
      "fuel",
      "maintenance",
      "tolls",
      "parking",
      "supplies",
      "phone",
      "other",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  sort: z
    .enum(["date-desc", "date-asc", "amount-desc", "amount-asc"])
    .optional(),
});

export const Route = createFileRoute("/dashboard/expenses")({
  component: RouteComponent,
  validateSearch: (search) => expensesSearchSchema.parse(search),
  head: () => ({
    meta: [{ title: "Expenses" }],
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/expenses" });

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      navigate({
        to: "/dashboard/expenses",
        search: (prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (key === "page") {
              next.page = value
                ? Math.max(1, Number.parseInt(value, 10) || 1)
                : undefined;
            } else if (key === "category") {
              next.category =
                value === null || value === "all"
                  ? undefined
                  : (value as z.infer<typeof expensesSearchSchema>["category"]);
            } else if (key === "sort") {
              next.sort =
                value === "date-desc" || value === null
                  ? undefined
                  : (value as z.infer<typeof expensesSearchSchema>["sort"]);
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

  // See dashboard.deliveries.tsx: entitlements have no API endpoint; AI entry
  // stays enabled for signed-in drivers and bulk upload is offered in the UI
  // (real limits are enforced server-side with surfaced errors).
  const aiEnabled = true;
  const bulkEnabled = true;

  return (
    <ExpensesPageClient
      aiEnabled={aiEnabled}
      bulkEnabled={bulkEnabled}
      onSearchParamsChange={updateSearchParams}
      page={search.page ?? 1}
      categoryFilter={search.category ?? "all"}
      sortBy={search.sort ?? "date-desc"}
    />
  );
}

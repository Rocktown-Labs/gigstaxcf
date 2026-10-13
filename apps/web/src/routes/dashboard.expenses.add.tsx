import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/expenses/add")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/expenses" });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/add")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/deliveries" });
  },
});

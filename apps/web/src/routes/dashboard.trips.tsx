import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/trips")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/deliveries" });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/history/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/deliveries/$id",
      params: { id: params.id },
    });
  },
});

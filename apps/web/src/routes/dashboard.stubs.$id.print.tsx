import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/stubs/$id/print")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/stubs/$id",
      params: { id: params.id },
    });
  },
});

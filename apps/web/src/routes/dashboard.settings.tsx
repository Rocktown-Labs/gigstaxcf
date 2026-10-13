import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageClient } from "@/components/dashboard/settings-page-client";

export const Route = createFileRoute("/dashboard/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Settings" }],
  }),
});

function RouteComponent() {
  return <SettingsPageClient />;
}

import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { authClient } from "@/lib/auth-client";

const onboardingSearchSchema = z.object({
  checkout: z.enum(["success"]).optional(),
});

export const Route = createFileRoute("/onboarding")({
  component: RouteComponent,
  validateSearch: (search) => onboardingSearchSchema.parse(search),
  beforeLoad: async () => {
    // Ported from `requireOnboardingAccess`.
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }

    const isOnboarded = Boolean(
      (session.data.user as { isOnboarded?: boolean }).isOnboarded
    );
    if (isOnboarded) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Onboarding" },
      {
        name: "description",
        content: "Configure your GigStax profile, platforms, and plan.",
      },
    ],
  }),
});

function RouteComponent() {
  const { checkout } = Route.useSearch();

  return (
    <div className="bg-background min-h-screen px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <OnboardingForm checkoutSuccess={checkout === "success"} />
      </div>
    </div>
  );
}

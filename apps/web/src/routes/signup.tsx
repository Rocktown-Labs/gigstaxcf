import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: RouteComponent,
  beforeLoad: async () => {
    // Ported from `redirectAuthenticatedFromAuthPages`.
    const session = await authClient.getSession();
    if (session.data) {
      const isOnboarded = Boolean(
        (session.data.user as { isOnboarded?: boolean }).isOnboarded
      );
      throw redirect({
        to: isOnboarded ? "/dashboard" : "/onboarding",
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign Up" },
      {
        name: "description",
        content:
          "Create your GigStax account to start tracking delivery profit.",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}

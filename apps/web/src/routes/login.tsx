import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
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
      { title: "Log In" },
      {
        name: "description",
        content: "Sign in to access your GigStax dashboard.",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}

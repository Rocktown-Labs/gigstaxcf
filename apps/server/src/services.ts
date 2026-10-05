import { createAuth as createConfiguredAuth } from "@gigstaxcf/auth";

import { ResetPasswordEmail } from "@/emails";
import { renderEmailTemplate } from "@/emails/render-email";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/services/email";
import { resolvePolarCheckoutProducts } from "@/lib/services/polar-checkout-config";

import { ENV } from "./env.server";

export type AuthInstance = ReturnType<typeof createConfiguredAuth>;

let authPromise: Promise<AuthInstance> | null = null;

/** Memoized better-auth instance (stateless config + shared db client). */
export function getAuth(): Promise<AuthInstance> {
  authPromise ??= createAuth();
  return authPromise;
}

export async function createAuth(): Promise<AuthInstance> {
  const polarProducts = await resolvePolarCheckoutProducts();

  return createConfiguredAuth(
    {
      ...ENV,
      polarProducts,
      sendResetPasswordEmail: async ({ url, user }) => {
        const rendered = await renderEmailTemplate(
          ResetPasswordEmail({ resetUrl: url })
        );
        await sendEmail({
          category: "transactional",
          html: rendered.html,
          idempotencyKey: `reset-password:${user.email}:${url}`,
          subject: "Reset your GigStax password",
          text: rendered.text,
          to: user.email,
        });
      },
    },
    { database: db }
  );
}

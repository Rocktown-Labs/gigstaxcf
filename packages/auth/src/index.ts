import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import type { Database } from "@gigstaxcf/db";
import * as schema from "@gigstaxcf/db/schema/auth";
import { polar, checkout, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";

import { createPolarClient } from "./lib/payments";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  POLAR_ACCESS_TOKEN: string;
  POLAR_SUCCESS_URL: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      ...desktopOrigins,
      "gigstaxcf://",
      "exp://",
      "http://localhost:8081",
    ],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      polar({
        client: createPolarClient(env),
        createCustomerOnSignUp: true,
        use: [
          checkout({
            products: [{ productId: "your-product-id", slug: "pro" }],
            successUrl: env.POLAR_SUCCESS_URL,
            authenticatedUsersOnly: true,
          }),
          portal(),
        ],
      }),
      expo(),
    ],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import type { Database } from "@gigstaxcf/db";
import * as schema from "@gigstaxcf/db/schema/auth";
import { polar, checkout, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";

import { createPolarClient } from "./lib/payments";

export interface AuthConfig {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  POLAR_ACCESS_TOKEN: string;
  POLAR_SUCCESS_URL: string;
}

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = []
) {
  return betterAuth({
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      polar({
        client: createPolarClient(env),
        createCustomerOnSignUp: true,
        use: [
          checkout({
            authenticatedUsersOnly: true,
            products: [{ productId: "your-product-id", slug: "pro" }],
            successUrl: env.POLAR_SUCCESS_URL,
          }),
          portal(),
        ],
      }),
      expo(),
    ],
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      env.CORS_ORIGIN,
      ...desktopOrigins,
      "gigstaxcf://",
      "exp://",
      "http://localhost:8081",
    ],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];

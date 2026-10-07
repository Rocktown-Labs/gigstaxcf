import { OpenAPIHono } from "@hono/zod-openapi";
import { initLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createAuthMiddleware } from "evlog/better-auth";
import type { BetterAuthInstance } from "evlog/better-auth";
import { evlog } from "evlog/hono";
import type { EvlogVariables } from "evlog/hono";
import { cors } from "hono/cors";
import notFound from "stoker/middlewares/not-found";
import onError from "stoker/middlewares/on-error";
import defaultHook from "stoker/openapi/default-hook";

import { ENV } from "./env.server";
import { apiRoutes } from "./routes";
import { getAuth } from "./services";

initLogger({
  env: { service: "gigstaxcf-server" },
});

const identifyUser = createAuthMiddleware(
  (await getAuth()) as BetterAuthInstance,
  {
    exclude: ["/api/auth/**"],
    maskEmail: true,
  }
);

const app = new OpenAPIHono<EvlogVariables>({ defaultHook });

app.use(evlog({ drain: createAxiomDrain() }));
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  return next();
});

app.use(
  "/*",
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    origin: ENV.CORS_ORIGIN,
  })
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const auth = await getAuth();
  return auth.handler(c.req.raw);
});

const nativeAppUrl = "gigstaxcf://";
const allowedNativeProtocols = new Set([
  "exp:",
  new URL(nativeAppUrl).protocol,
]);

app.get("/polar/success", (c) => {
  const requestUrl = new URL(c.req.url);
  const returnUrl = requestUrl.searchParams.get("returnUrl") || nativeAppUrl;

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(returnUrl);
  } catch {
    return c.text("Invalid return URL", 400);
  }

  if (!allowedNativeProtocols.has(redirectUrl.protocol)) {
    return c.text("Invalid return URL", 400);
  }

  return c.redirect(redirectUrl.toString(), 302);
});

app.get("/", (c) => c.text("OK"));

app.route("/api", apiRoutes);

app.doc("/openapi", {
  info: {
    title: "Gigstax API",
    version: "0.1.0",
  },
  openapi: "3.1.0",
});

app.notFound(notFound);
app.onError(onError);

// Cloudflare Workflow hosted by this worker (bound as PROCESS_EXTRACTION
// via Alchemy; driven by apps/server/src/lib/services/bulk-extraction.ts).
export { ProcessExtractionWorkflow } from "@/lib/workflows/process-extraction";

export default app;

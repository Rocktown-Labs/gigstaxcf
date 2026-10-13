import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import { z } from "zod";

import { applyLifecycleUnsubscribeToken } from "@/lib/services/email-unsubscribe";

const htmlResponse = (status: 200 | 400) => ({
  description:
    status === 200 ? "Unsubscribed confirmation page" : "Invalid link page",
  content: { "text/html": { schema: z.string() } },
});

const unsubscribeRoute = createRoute({
  method: "get",
  path: "/u/unsubscribe",
  tags: ["Email"],
  summary: "Public one-click unsubscribe page",
  description: "Applies a lifecycle unsubscribe token, no session required.",
  request: {
    query: z.object({ token: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.OK]: htmlResponse(200),
    [HttpStatusCodes.BAD_REQUEST]: htmlResponse(400),
  },
});

function htmlPage(content: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GigStax Email Preferences</title>
    <style>
      body {
        background: #f5f7fb;
        color: #0f172a;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 32px 16px;
      }
      .card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        margin: 0 auto;
        max-width: 560px;
        padding: 24px;
      }
      a { color: #0f766e; }
    </style>
  </head>
  <body>
    <main class="card">
      ${content}
    </main>
  </body>
</html>`;
}

export const publicUnsubscribeRoutes = new OpenAPIHono({ defaultHook }).openapi(
  unsubscribeRoute,
  async (c) => {
    const { token } = c.req.valid("query");
    if (!token) {
      return c.html(
        htmlPage(
          "<h1>Missing unsubscribe token</h1><p>This link is invalid.</p>"
        ),
        HttpStatusCodes.BAD_REQUEST
      );
    }

    const payload = await applyLifecycleUnsubscribeToken(token);
    if (!payload) {
      return c.html(
        htmlPage(
          "<h1>Unsubscribe link expired</h1><p>Open dashboard settings to manage preferences manually.</p>"
        ),
        HttpStatusCodes.BAD_REQUEST
      );
    }

    return c.html(
      htmlPage(
        `<h1>You are unsubscribed</h1><p>Your <strong>${payload.category.replaceAll("_", " ")}</strong> lifecycle emails have been turned off.</p><p><a href="/dashboard/settings">Open settings</a> to adjust preferences any time.</p>`
      )
    );
  }
);

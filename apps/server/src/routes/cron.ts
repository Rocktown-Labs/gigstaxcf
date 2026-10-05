import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z } from "zod";

import { logger } from "@/lib/logging/logger";
import { serverEnv } from "@/lib/server-env";
import {
  listUsersForLifecycleHour,
  runLifecycleEmailPassForUser,
} from "@/lib/services/email-lifecycle";

import { errorObjectSchema } from "./schemas";

const DISPATCH_BATCH_SIZE = 25;

const emailLifecycleRoute = createRoute({
  method: "get",
  path: "/cron/email-lifecycle",
  tags: ["Cron"],
  summary: "Run lifecycle email passes for eligible users",
  description:
    "Protected by a Bearer token matching CRON_SECRET. Runs the lifecycle email pass for each user due this hour, in batches.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ dispatched: z.number(), eligibleUsers: z.number() }),
      "Lifecycle dispatch result"
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      errorObjectSchema,
      "Unauthorized"
    ),
  },
});

function isAuthorized(request: Request) {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7) === secret
    : false;
}

export const cronRoutes = new OpenAPIHono({ defaultHook }).openapi(
  emailLifecycleRoute,
  async (c) => {
    if (!isAuthorized(c.req.raw)) {
      return c.json({ error: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const userIds = await listUsersForLifecycleHour();
    let dispatched = 0;

    for (let index = 0; index < userIds.length; index += DISPATCH_BATCH_SIZE) {
      const batch = userIds.slice(index, index + DISPATCH_BATCH_SIZE);
      // Batches run sequentially on purpose (ported from the gigstax cron
      // route) to bound concurrent email sending.
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(async (userId) => {
          await runLifecycleEmailPassForUser(userId);
        })
      );
      dispatched += batch.length;
    }

    logger.info({ dispatched }, "lifecycle_email_dispatch_completed");
    return c.json(
      {
        dispatched,
        eligibleUsers: userIds.length,
      },
      HttpStatusCodes.OK
    );
  }
);

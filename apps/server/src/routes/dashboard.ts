import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import createMessageObjectSchema from "stoker/openapi/schemas/create-message-object";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import { getDashboardData } from "@/lib/services/dashboard";

const dashboardRoute = createRoute({
  method: "get",
  path: "/dashboard",
  tags: ["Dashboard"],
  summary: "Aggregated dashboard data for the current user",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ dashboard: z.unknown() }),
      "Dashboard data"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("User not found"),
      "User not found"
    ),
  },
});

export const dashboardRoutes = new OpenAPIHono({ defaultHook }).openapi(
  dashboardRoute,
  async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const data = await getDashboardData(session.userId);
    if (!data) {
      return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    return c.json({ dashboard: data }, HttpStatusCodes.OK);
  }
);

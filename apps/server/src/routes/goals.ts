import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z, ZodError } from "zod";

import { requireSession } from "@/lib/api";
import { logger } from "@/lib/logging/logger";
import { createGoalForUser, listGoalsForUser } from "@/lib/services/goals";

const listRoute = createRoute({
  method: "get",
  path: "/goals",
  tags: ["Goals"],
  summary: "List weekly earnings goals",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ goals: z.array(z.unknown()), weekStartsOn: z.string() }),
      "Goals with the user's week start preference"
    ),
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/goals",
  tags: ["Goals"],
  summary: "Create or update the weekly earnings goal",
  description:
    "Accepts the canonical payload (`targetAmount`, `periodStartDate`, `timezone`) or the legacy payload (`weeklyTarget`, `startDate`).",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ goal: z.unknown(), weekStartsOn: z.string() }),
      "Saved goal"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ details: z.unknown().optional(), error: z.string() }),
      "Validation failed"
    ),
  },
});

export const goalsRoutes = new OpenAPIHono({ defaultHook })
  .openapi(listRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const result = await listGoalsForUser(session.userId);

    return c.json(result, HttpStatusCodes.OK);
  })
  .openapi(createRoute_, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const body = await c.req.raw.json().catch(() => ({}));

    try {
      const result = await createGoalForUser(session.userId, body);

      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          { details: error, error: "Validation failed" },
          HttpStatusCodes.BAD_REQUEST
        );
      }

      logger.error({ error }, "create_goal_failed");
      throw error;
    }
  });

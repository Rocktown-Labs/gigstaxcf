import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import {
  createUserCustomPlatform,
  getUserPlatformState,
} from "@/lib/services/platforms";

const platformDto = z.object({
  colorHex: z.string(),
  displayName: z.string(),
  slug: z.string(),
});

const createPlatformSchema = z.object({
  colorHex: z
    .string()
    .regex(/^#(?<hex>[0-9a-fA-F]{6})$/u, "Invalid color")
    .optional(),
  displayName: z.string().trim().min(2).max(60),
});

const listRoute = createRoute({
  method: "get",
  path: "/platforms",
  tags: ["Platforms"],
  summary: "List available and selected platforms",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        availablePlatforms: z.array(z.unknown()),
        selectedPlatforms: z.array(z.unknown()),
      }),
      "Platform options for the user"
    ),
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/platforms",
  tags: ["Platforms"],
  summary: "Create a custom platform",
  request: {
    body: jsonContentRequired(createPlatformSchema, "Platform to create"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ platform: platformDto }),
      "Existing platform with the same display name"
    ),
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({ platform: platformDto }),
      "Created platform"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createPlatformSchema),
      "Validation failed"
    ),
  },
});

export const platformsRoutes = new OpenAPIHono({ defaultHook })
  .openapi(listRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const state = await getUserPlatformState(session.userId);

    return c.json(
      {
        availablePlatforms: state.availablePlatforms,
        selectedPlatforms: state.selectedPlatforms,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(createRoute_, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const parsed = c.req.valid("json");

    const displayName = parsed.displayName.trim();
    const existingState = await getUserPlatformState(session.userId);
    const existing = existingState.availablePlatforms.find(
      (platform) =>
        platform.displayName.toLowerCase() === displayName.toLowerCase()
    );

    if (existing) {
      return c.json(
        {
          platform: {
            colorHex: existing.colorHex,
            displayName: existing.displayName,
            slug: existing.slug,
          },
        },
        HttpStatusCodes.OK
      );
    }

    const created = await createUserCustomPlatform({
      colorHex: parsed.colorHex ?? "#22c55e",
      displayName,
      userId: session.userId,
    });

    return c.json(
      {
        platform: {
          colorHex: created.colorHex,
          displayName: created.displayName,
          slug: created.slug,
        },
      },
      HttpStatusCodes.CREATED
    );
  });

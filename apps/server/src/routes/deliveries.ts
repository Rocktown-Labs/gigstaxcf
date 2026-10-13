import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import {
  createEntryForUser,
  listEntriesForUser,
  mapEntryToLegacyDelivery,
} from "@/lib/services/entries";
import { createMediaAsset, linkMediaToEntry } from "@/lib/services/media";
import { deliverySchema } from "@/lib/validations";

const listRoute = createRoute({
  method: "get",
  path: "/deliveries",
  tags: ["Deliveries"],
  summary: "List deliveries (legacy shape)",
  request: {
    query: z.object({
      endDate: z.string().optional(),
      startDate: z.string().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ deliveries: z.array(z.unknown()) }),
      "Legacy deliveries list"
    ),
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/deliveries",
  tags: ["Deliveries"],
  summary: "Create a delivery (legacy shape)",
  request: {
    body: jsonContentRequired(deliverySchema, "Delivery to create"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ delivery: z.unknown() }),
      "Created delivery"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(deliverySchema),
      "Validation failed"
    ),
  },
});

export const deliveriesRoutes = new OpenAPIHono({ defaultHook })
  .openapi(listRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    const entries = await listEntriesForUser(session.userId, {
      endDate: query.endDate,
      limit: 100,
      startDate: query.startDate,
      status: "completed",
    });

    return c.json(
      {
        deliveries: entries.map((entry) => mapEntryToLegacyDelivery(entry)),
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(createRoute_, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const validatedData = c.req.valid("json");

    const occurredAt = validatedData.deliveredAt || new Date().toISOString();

    const entry = await createEntryForUser(session.userId, {
      bonusAmount: 0,
      completedAt: occurredAt,
      distanceMiles: validatedData.miles,
      earningsExtras: {},
      fareAmount: validatedData.deliveryFee,
      notes: validatedData.notes,
      occurredAt,
      platformMetadata: {
        legacyRoute: "deliveries",
      },
      platformSlug: "walmart_spark",
      source: validatedData.screenshotUrl ? "image_ai" : "manual",
      status: "completed",
      tipFinalAmount: validatedData.tip,
      tipStatus: validatedData.tip > 0 ? "final" : "none",
      totalEstimatedAmount: validatedData.estimatedTotal,
      totalFinalAmount: validatedData.estimatedTotal,
    });

    let screenshotUrl: string | null = null;
    if (validatedData.screenshotUrl) {
      const media = await createMediaAsset({
        kind: "entry_screenshot",
        storageProvider: "external",
        storageUrl: validatedData.screenshotUrl,
        userId: session.userId,
      });

      await linkMediaToEntry(Number(entry.id), Number(media.id), true);
      ({ screenshotUrl } = validatedData);
    }

    const delivery = mapEntryToLegacyDelivery({
      ...entry,
      platform_slug: "walmart_spark",
      primary_media_url: screenshotUrl,
    });

    return c.json({ delivery }, HttpStatusCodes.OK);
  });

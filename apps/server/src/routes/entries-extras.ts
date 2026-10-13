import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z } from "zod";

import { requireIdParam, requireSession } from "@/lib/api";
import { attachEntryMediaForUser } from "@/lib/services/entries";
import {
  listTripVerificationQueueForUser,
  TRIP_VERIFICATION_TABLES_MISSING_MESSAGE,
  upsertEntryTripVerificationForUser,
} from "@/lib/services/trip-verifications";
import { upsertTripVerificationSchema } from "@/lib/validations";

import { IdParamsSchema } from "./schemas";

const DEFAULT_QUEUE_PAGE = 1;
const DEFAULT_QUEUE_PAGE_SIZE = 10;

const attachMedia = createRoute({
  method: "post",
  path: "/entries/{id}/media",
  tags: ["Entries"],
  summary: "Attach media to an entry",
  description:
    "Multipart upload of a screenshot, or a reference to existing media (mediaId/url form field).",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ media: z.unknown() }),
      "Attached media"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ error: z.string() }),
      "Invalid request"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ error: z.string() }),
      "Entry or media not found"
    ),
  },
});

const putTripVerification = createRoute({
  method: "put",
  path: "/entries/{id}/trip-verification",
  tags: ["Entries"],
  summary: "Save trip verification for an entry",
  request: {
    params: IdParamsSchema,
    body: jsonContentRequired(
      upsertTripVerificationSchema,
      "Trip verification details"
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ tripVerification: z.unknown() }),
      "Saved trip verification"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ error: z.string() }),
      "Entry not found"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      z.object({ error: z.string() }),
      "Trip verification tables missing"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(upsertTripVerificationSchema),
      "Validation failed"
    ),
  },
});

const tripVerificationQueue = createRoute({
  method: "get",
  path: "/entries/trip-verification-queue",
  tags: ["Entries"],
  summary: "List entries needing trip verification",
  request: {
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ entries: z.array(z.unknown()), pagination: z.unknown() }),
      "Trip verification queue page"
    ),
  },
});

const formDataPart = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

const parsePositiveInteger = (value: string | null, fallback: number) => {
  if (value === null || value === "") {
    return fallback;
  }

  if (!/^\d+$/u.test(value)) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const entriesExtrasRoutes = new OpenAPIHono({ defaultHook })
  .openapi(attachMedia, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);

    const formData = await c.req.raw.formData();
    const fileValue = formData.get("file");
    const outcome = await attachEntryMediaForUser({
      entryId: id,
      file: fileValue instanceof File ? fileValue : null,
      mediaIdParam: formDataPart(formData, "mediaId"),
      url: formDataPart(formData, "url"),
      userId: session.userId,
    });

    if ("error" in outcome) {
      if (outcome.error === "entry_not_found") {
        return c.json({ error: "Entry not found" }, HttpStatusCodes.NOT_FOUND);
      }
      if (outcome.error === "invalid_media_id") {
        return c.json(
          { error: "Invalid media id" },
          HttpStatusCodes.BAD_REQUEST
        );
      }
      if (outcome.error === "media_not_found") {
        return c.json({ error: "Media not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json(
        { error: "Provide mediaId, file, or url" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    return c.json({ media: outcome.media }, HttpStatusCodes.OK);
  })
  .openapi(putTripVerification, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);
    const body = c.req.valid("json");

    try {
      const tripVerification = await upsertEntryTripVerificationForUser(
        session.userId,
        id,
        body
      );

      return c.json({ tripVerification }, HttpStatusCodes.OK);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Entry not found or unauthorized"
      ) {
        return c.json({ error: "Entry not found" }, HttpStatusCodes.NOT_FOUND);
      }

      if (
        error instanceof Error &&
        error.message === TRIP_VERIFICATION_TABLES_MISSING_MESSAGE
      ) {
        return c.json(
          { error: TRIP_VERIFICATION_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(tripVerificationQueue, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    const page = parsePositiveInteger(query.page ?? null, DEFAULT_QUEUE_PAGE);
    const pageSize = parsePositiveInteger(
      query.pageSize ?? null,
      DEFAULT_QUEUE_PAGE_SIZE
    );

    const response = await listTripVerificationQueueForUser({
      page,
      pageSize,
      userId: session.userId,
    });

    return c.json(response, HttpStatusCodes.OK);
  });

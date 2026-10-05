import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z } from "zod";

import { requireIdParam, requireSession } from "@/lib/api";
import {
  deleteMediaAssetForUser,
  deleteMediaObject,
  getMediaAssetForUser,
  getMediaBytes,
} from "@/lib/services/media";

import { errorObjectSchema, IdParamsSchema } from "./schemas";

const getMedia = createRoute({
  method: "get",
  path: "/media/{id}",
  tags: ["Media"],
  summary: "Stream a private media asset",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: {
      description: "Media bytes",
      content: { "application/octet-stream": { schema: z.unknown() } },
    },
    [HttpStatusCodes.NOT_MODIFIED]: {
      description: "Not modified (matching If-None-Match)",
      content: { "application/octet-stream": { schema: z.unknown() } },
    },
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Media does not support private delivery"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "Media not found"
    ),
  },
});

const deleteMedia = createRoute({
  method: "delete",
  path: "/media/{id}",
  tags: ["Media"],
  summary: "Delete a media asset",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ deleted: z.boolean() }),
      "Media deleted"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "Media not found"
    ),
  },
});

export const mediaRoutes = new OpenAPIHono({ defaultHook })
  .openapi(getMedia, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);

    const media = await getMediaAssetForUser(session.userId, id);
    if (!media) {
      return c.json({ error: "Media not found" }, HttpStatusCodes.NOT_FOUND);
    }

    if (!media.storageKey) {
      return c.json(
        { error: "Media does not support private delivery" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    const etag = media.sha256 ? `"${media.sha256}"` : null;
    const ifNoneMatch = c.req.raw.headers.get("if-none-match");
    if (etag && ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        headers: {
          "Cache-Control": "private, no-cache",
          ETag: etag,
        },
        status: 304,
      });
    }

    const object = await getMediaBytes(media.storageKey);
    if (!object) {
      return c.json({ error: "Media not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const headers: Record<string, string> = {
      "Cache-Control": "private, no-cache",
      "Content-Type":
        object.mimeType || media.mimeType || "application/octet-stream",
    };
    if (etag) {
      headers.ETag = etag;
    }

    return c.body(object.bytes, HttpStatusCodes.OK, headers);
  })
  .openapi(deleteMedia, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);

    const media = await getMediaAssetForUser(session.userId, id);
    if (!media) {
      return c.json({ error: "Media not found" }, HttpStatusCodes.NOT_FOUND);
    }

    await deleteMediaObject(media.storageKey);
    await deleteMediaAssetForUser(session.userId, id);

    return c.json({ deleted: true }, HttpStatusCodes.OK);
  });

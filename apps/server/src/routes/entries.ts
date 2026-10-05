import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import createMessageObjectSchema from "stoker/openapi/schemas/create-message-object";
import { z } from "zod";

import { requireIdParam, requireSession } from "@/lib/api";
import { parsePaginationParams } from "@/lib/pagination";
import {
  createEntryForUser,
  deleteEntryForUser,
  getEffectiveTip,
  getEffectiveTotal,
  getEntryForUser,
  listEntriesPageForUser,
  updateEntryForUser,
} from "@/lib/services/entries";
import {
  createEntrySchema,
  entryListSortSchema,
  entryStatusSchema,
  patchEntrySchema,
  tipStatusSchema,
} from "@/lib/validations";

import { IdParamsSchema } from "./schemas";

const listRoute = createRoute({
  method: "get",
  path: "/entries",
  tags: ["Entries"],
  summary: "List earnings entries",
  request: {
    query: z.object({
      endDate: z.string().optional(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
      platform: z.string().optional(),
      sort: entryListSortSchema.optional(),
      startDate: z.string().optional(),
      status: entryStatusSchema.optional(),
      tipStatus: tipStatusSchema.optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        entries: z.array(z.unknown()),
        pagination: z.unknown(),
        summary: z.unknown(),
      }),
      "Entries page"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid query parameters"),
      "Invalid query parameters"
    ),
  },
});

const createPost = createRoute({
  method: "post",
  path: "/entries",
  tags: ["Entries"],
  summary: "Create an earnings entry",
  request: { body: jsonContentRequired(createEntrySchema, "Entry to create") },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ entry: z.unknown() }),
      "Created entry"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createEntrySchema),
      "Validation failed"
    ),
  },
});

const detailRoute = createRoute({
  method: "get",
  path: "/entries/{id}",
  tags: ["Entries"],
  summary: "Get an entry",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ entry: z.unknown() }),
      "Entry"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema("Entry not found"),
      "Entry not found"
    ),
  },
});

const patchOne = createRoute({
  method: "patch",
  path: "/entries/{id}",
  tags: ["Entries"],
  summary: "Update an entry",
  request: {
    params: IdParamsSchema,
    body: jsonContentRequired(patchEntrySchema, "Entry updates"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ entry: z.unknown() }),
      "Entry"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(patchEntrySchema),
      "Validation failed"
    ),
  },
});

const deleteOne = createRoute({
  method: "delete",
  path: "/entries/{id}",
  tags: ["Entries"],
  summary: "Delete an entry",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema("Entry deleted"),
      "Entry deleted"
    ),
  },
});

export const entriesRoutes = new OpenAPIHono({ defaultHook })
  .openapi(listRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    const parsedPagination = parsePaginationParams({
      defaultPageSize: 500,
      maxPageSize: 500,
      pageParam: query.page ?? null,
      pageSizeParam: query.pageSize ?? null,
    });
    if ("error" in parsedPagination) {
      return c.json(
        { message: parsedPagination.error },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    const payload = await listEntriesPageForUser(session.userId, {
      endDate: query.endDate,
      page: parsedPagination.pagination.page,
      pageSize: parsedPagination.pagination.pageSize,
      platformSlug: query.platform,
      sort: query.sort,
      startDate: query.startDate,
      status: query.status ?? null,
      tipStatus: query.tipStatus ?? null,
    });

    return c.json(
      {
        entries: payload.entries.map((entry) => ({
          ...entry,
          effective_tip: getEffectiveTip(entry),
          effective_total: getEffectiveTotal(entry),
        })),
        pagination: payload.pagination,
        summary: payload.summary,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(createPost, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const body = c.req.valid("json");
    const entry = await createEntryForUser(session.userId, body);

    return c.json(
      {
        entry: {
          ...entry,
          effective_tip: getEffectiveTip(entry),
          effective_total: getEffectiveTotal(entry),
        },
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(detailRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);
    const entry = await getEntryForUser(session.userId, id);
    if (!entry) {
      return c.json({ message: "Entry not found" }, HttpStatusCodes.NOT_FOUND);
    }

    return c.json(
      {
        entry: {
          ...entry,
          effective_tip: getEffectiveTip(entry),
          effective_total: getEffectiveTotal(entry),
        },
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(patchOne, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);
    const body = c.req.valid("json");
    const entry = await updateEntryForUser(session.userId, id, body);

    return c.json(
      {
        entry: {
          ...entry,
          effective_tip: getEffectiveTip(entry),
          effective_total: getEffectiveTotal(entry),
        },
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(deleteOne, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);
    await deleteEntryForUser(session.userId, id);

    return c.json({ message: "Entry deleted" }, HttpStatusCodes.OK);
  });

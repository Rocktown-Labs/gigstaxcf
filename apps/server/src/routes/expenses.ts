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
  attachExpenseMediaForUser,
  createExpenseForUser,
  deleteExpenseForUser,
  getExpenseForUser,
  listExpensesPageForUser,
} from "@/lib/services/expenses";
import {
  createExpenseSchema,
  entryListSortSchema,
  expenseCategorySchema,
} from "@/lib/validations";

import { IdParamsSchema } from "./schemas";

const listRoute = createRoute({
  method: "get",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "List expenses",
  request: {
    query: z.object({
      category: expenseCategorySchema.optional(),
      endDate: z.string().optional(),
      page: z.string().optional(),
      pageSize: z.string().optional(),
      sort: entryListSortSchema.optional(),
      startDate: z.string().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        expenses: z.array(z.unknown()),
        pagination: z.unknown(),
        summary: z.unknown(),
      }),
      "Expenses page"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid query parameters"),
      "Invalid query parameters"
    ),
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "Create an expense",
  request: {
    body: jsonContentRequired(createExpenseSchema, "Expense to create"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ expense: z.unknown() }),
      "Created expense"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      z.object({ error: z.string() }),
      "Invalid platform slug or linked entry"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createExpenseSchema),
      "Validation failed"
    ),
  },
});

const detailRoute = createRoute({
  method: "get",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Get an expense",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ expense: z.unknown() }),
      "Expense"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ error: z.string() }),
      "Expense not found"
    ),
  },
});

const deleteOne = createRoute({
  method: "delete",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Delete an expense",
  request: { params: IdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema("Expense deleted"),
      "Expense deleted"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      z.object({ error: z.string() }),
      "Expense not found"
    ),
  },
});

const attachMedia = createRoute({
  method: "post",
  path: "/expenses/{id}/media",
  tags: ["Expenses"],
  summary: "Attach media to an expense",
  description:
    "Multipart upload of a receipt image, or a reference to existing media (mediaId/url form field).",
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
      "Expense or media not found"
    ),
  },
});

const formDataPart = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

export const expensesRoutes = new OpenAPIHono({ defaultHook })
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

    const payload = await listExpensesPageForUser(session.userId, {
      category: query.category ?? null,
      endDate: query.endDate,
      page: parsedPagination.pagination.page,
      pageSize: parsedPagination.pagination.pageSize,
      sort: query.sort,
      startDate: query.startDate,
    });

    return c.json(
      {
        expenses: payload.expenses,
        pagination: payload.pagination,
        summary: payload.summary,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(createRoute_, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const body = c.req.valid("json");

    try {
      const expense = await createExpenseForUser(session.userId, body);

      return c.json({ expense }, HttpStatusCodes.OK);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Unknown platform:") ||
          error.message === "Entry not found for expense link")
      ) {
        return c.json({ error: error.message }, HttpStatusCodes.BAD_REQUEST);
      }

      throw error;
    }
  })
  .openapi(detailRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);
    const expense = await getExpenseForUser(session.userId, id);
    if (!expense) {
      return c.json({ error: "Expense not found" }, HttpStatusCodes.NOT_FOUND);
    }

    return c.json({ expense }, HttpStatusCodes.OK);
  })
  .openapi(deleteOne, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);

    try {
      await deleteExpenseForUser(session.userId, id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Expense not found or unauthorized"
      ) {
        return c.json(
          { error: "Expense not found" },
          HttpStatusCodes.NOT_FOUND
        );
      }

      throw error;
    }

    return c.json({ message: "Expense deleted" }, HttpStatusCodes.OK);
  })
  .openapi(attachMedia, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const id = requireIdParam(c.req.valid("param").id);

    const formData = await c.req.raw.formData();
    const fileValue = formData.get("file");
    const outcome = await attachExpenseMediaForUser({
      expenseId: id,
      file: fileValue instanceof File ? fileValue : null,
      mediaIdParam: formDataPart(formData, "mediaId"),
      url: formDataPart(formData, "url"),
      userId: session.userId,
    });

    if ("error" in outcome) {
      if (outcome.error === "expense_not_found") {
        return c.json(
          { error: "Expense not found" },
          HttpStatusCodes.NOT_FOUND
        );
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
  });

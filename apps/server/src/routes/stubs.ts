import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import {
  backfillPrimaryCadenceForUser,
  buildStubCsv,
  buildStubExportBaseName,
  buildStubPdfBytes,
  buildStubPreviewForUser,
  getOrCreateStubProfile,
  getStubByPublicId,
  isStubTablesMissingError,
  listStubsForUser,
  lockStubByPublicId,
  STUB_TABLES_MISSING_MESSAGE,
  updateStubProfileForUser,
  upsertDraftStubForUser,
} from "@/lib/services/stubs";
import {
  stubGenerateSchema,
  stubPreviewSchema,
  stubProfilePatchSchema,
} from "@/lib/validations";

import { errorObjectSchema, PublicIdParamsSchema } from "./schemas";

const stubTablesMissingResponse = jsonContent(
  errorObjectSchema,
  "Stub tables missing (run migrations)"
);

const notFoundResponse = jsonContent(errorObjectSchema, "Stub not found");

const listRoute = createRoute({
  method: "get",
  path: "/stubs",
  tags: ["Stubs"],
  summary: "List income stubs",
  request: {
    query: z.object({ limit: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Stubs list payload"),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/stubs",
  tags: ["Stubs"],
  summary: "Generate (upsert) a draft income stub",
  request: {
    body: jsonContentRequired(stubGenerateSchema, "Stub generation options"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ stub: z.unknown() }),
      "Generated stub"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(stubGenerateSchema),
      "Validation failed"
    ),
  },
});

const previewRoute = createRoute({
  method: "post",
  path: "/stubs/preview",
  tags: ["Stubs"],
  summary: "Preview a stub without saving",
  request: {
    body: jsonContentRequired(stubPreviewSchema, "Stub preview options"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Stub preview"),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(stubPreviewSchema),
      "Validation failed"
    ),
  },
});

const getProfileRoute = createRoute({
  method: "get",
  path: "/stubs/profile",
  tags: ["Stubs"],
  summary: "Get the user's stub profile",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ profile: z.unknown() }),
      "Stub profile"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

const patchProfileRoute = createRoute({
  method: "patch",
  path: "/stubs/profile",
  tags: ["Stubs"],
  summary: "Update the user's stub profile",
  request: {
    body: jsonContentRequired(stubProfilePatchSchema, "Profile patch"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ profile: z.unknown() }),
      "Updated stub profile"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(stubProfilePatchSchema),
      "Validation failed"
    ),
  },
});

const getStubRoute = createRoute({
  method: "get",
  path: "/stubs/{id}",
  tags: ["Stubs"],
  summary: "Get a stub by public id",
  request: { params: PublicIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ stub: z.unknown() }),
      "Stub record"
    ),
    [HttpStatusCodes.NOT_FOUND]: notFoundResponse,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

const lockStubRoute = createRoute({
  method: "post",
  path: "/stubs/{id}/lock",
  tags: ["Stubs"],
  summary: "Lock a stub",
  request: { params: PublicIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ stub: z.unknown() }),
      "Locked stub"
    ),
    [HttpStatusCodes.NOT_FOUND]: notFoundResponse,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

const csvRoute = createRoute({
  method: "get",
  path: "/stubs/{id}/csv",
  tags: ["Stubs"],
  summary: "Download a stub as CSV",
  request: { params: PublicIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: {
      description: "Stub CSV download",
      content: { "text/csv": { schema: z.string() } },
    },
    [HttpStatusCodes.NOT_FOUND]: notFoundResponse,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

const pdfRoute = createRoute({
  method: "get",
  path: "/stubs/{id}/pdf",
  tags: ["Stubs"],
  summary: "Download a stub as PDF",
  request: { params: PublicIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: {
      description: "Stub PDF download",
      content: { "application/pdf": { schema: z.unknown() } },
    },
    [HttpStatusCodes.NOT_FOUND]: notFoundResponse,
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: stubTablesMissingResponse,
  },
});

export const stubsRoutes = new OpenAPIHono({ defaultHook })
  .openapi(listRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    const rawLimit = query.limit ?? null;
    const parsedLimit = rawLimit ? Number(rawLimit) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.trunc(parsedLimit)
      : undefined;

    try {
      const payload = await listStubsForUser({
        limit,
        userId: session.userId,
      });

      return c.json(payload, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(createRoute_, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const parsed = c.req.valid("json");

    try {
      await backfillPrimaryCadenceForUser(session.userId);

      const stub = await upsertDraftStubForUser({
        anchorDate: parsed.anchorDate,
        cadence: parsed.cadence,
        fieldKeys: parsed.fieldKeys,
        source: "manual",
        userId: session.userId,
      });

      return c.json({ stub }, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(previewRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const parsed = c.req.valid("json");

    try {
      const preview = await buildStubPreviewForUser({
        anchorDate: parsed.anchorDate,
        cadence: parsed.cadence,
        fieldKeys: parsed.fieldKeys,
        userId: session.userId,
      });

      return c.json(preview, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(getProfileRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    try {
      const profile = await getOrCreateStubProfile(session.userId);

      return c.json({ profile }, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(patchProfileRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const parsed = c.req.valid("json");

    try {
      const profile = await updateStubProfileForUser({
        patch: parsed,
        userId: session.userId,
      });

      return c.json({ profile }, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(getStubRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const { id } = c.req.valid("param");

    try {
      const stub = await getStubByPublicId({
        publicId: id,
        userId: session.userId,
      });

      if (!stub) {
        return c.json({ error: "Stub not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json({ stub }, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(lockStubRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const { id } = c.req.valid("param");

    try {
      const stub = await lockStubByPublicId({
        publicId: id,
        userId: session.userId,
      });

      if (!stub) {
        return c.json({ error: "Stub not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json({ stub }, HttpStatusCodes.OK);
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(csvRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const { id } = c.req.valid("param");

    try {
      const stub = await lockStubByPublicId({
        publicId: id,
        userId: session.userId,
      });

      if (!stub) {
        return c.json({ error: "Stub not found" }, HttpStatusCodes.NOT_FOUND);
      }

      const csv = buildStubCsv(stub);
      const exportBaseName = buildStubExportBaseName(stub);

      return c.body(csv, HttpStatusCodes.OK, {
        "Content-Disposition": `attachment; filename="${exportBaseName}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      });
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  })
  .openapi(pdfRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const { id } = c.req.valid("param");

    try {
      const stub = await lockStubByPublicId({
        publicId: id,
        userId: session.userId,
      });

      if (!stub) {
        return c.json({ error: "Stub not found" }, HttpStatusCodes.NOT_FOUND);
      }

      const pdfBytes = buildStubPdfBytes(stub);
      const exportBaseName = buildStubExportBaseName(stub);
      const pdfArrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      ) as ArrayBuffer;

      return c.body(pdfArrayBuffer, HttpStatusCodes.OK, {
        "Content-Disposition": `attachment; filename="${exportBaseName}.pdf"`,
        "Content-Type": "application/pdf",
      });
    } catch (error) {
      if (isStubTablesMissingError(error)) {
        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }

      throw error;
    }
  });

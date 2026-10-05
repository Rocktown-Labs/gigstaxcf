import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import { logger } from "@/lib/logging/logger";
import { recordAiUsageEvent } from "@/lib/services/ai-usage";
import {
  createAndQueueExtractionFromFile,
  listBulkExtractionStatuses,
  retryBulkExtraction,
} from "@/lib/services/bulk-extraction";
import type {
  BulkQueueItemDto,
  BulkStatusItemDto,
} from "@/lib/services/bulk-extraction";
import { ANALYZE_MODEL, ANALYZE_PROVIDER } from "@/lib/services/extraction";
import { trackPolarUsage } from "@/lib/services/polar-usage";
import {
  assertCanAnalyzeImage,
  assertCanBulkUpload,
  isUsageLimitError,
  toUsageLimitResponse,
} from "@/lib/services/usage-limits";

import { errorObjectSchema } from "./schemas";

const MAX_FILES_PER_REQUEST = 30;
const MAX_PARALLEL_UPLOADS = 4;

async function runWithConcurrency<TItem, TResult>(args: {
  items: TItem[];
  limit: number;
  worker: (item: TItem, index: number) => Promise<TResult>;
}) {
  const outputs = Array.from({ length: args.items.length }) as TResult[];
  let cursor = 0;

  const workers = Array.from({
    length: Math.min(args.limit, args.items.length),
  })
    .fill(null)
    .map(async () => {
      while (cursor < args.items.length) {
        const index = cursor;
        cursor += 1;
        const item = args.items[index];
        if (item !== undefined) {
          // Sequential awaits per worker are the concurrency limit itself.
          // eslint-disable-next-line no-await-in-loop
          outputs[index] = await args.worker(item, index);
        }
      }
    });

  await Promise.all(workers);
  return outputs;
}

function collectFiles(formData: FormData) {
  const values = [...formData.getAll("files[]"), ...formData.getAll("files")];

  const files = values.filter((value): value is File => value instanceof File);
  return files.filter((file) => file.size > 0);
}

function parseExtractionIds(idsParam: string | null) {
  if (!idsParam) {
    return [] as number[];
  }

  const unique = new Set<number>();
  for (const value of idsParam.split(",")) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      unique.add(parsed);
    }
  }

  return [...unique].slice(0, 200);
}

type BulkQueueOutcome =
  | { body: { code: string; message: string }; status: 403 }
  | { body: { error: string }; status: 400 }
  | { body: { details: string; error: string }; status: 500 }
  | { body: { queue: BulkQueueItemDto[] }; status: 202 };

async function queueBulkAnalysis(args: {
  endpoint: string;
  formData: FormData;
  kindHint: "expense_receipt" | null;
  userId: number;
}): Promise<BulkQueueOutcome> {
  const files = collectFiles(args.formData);
  if (files.length === 0) {
    return {
      body: { error: "Upload at least one image file" },
      status: 400,
    };
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return {
      body: {
        error: `Bulk upload supports up to ${MAX_FILES_PER_REQUEST} files per request.`,
      },
      status: 400,
    };
  }

  try {
    await assertCanBulkUpload({
      batchCount: 1,
      imageCount: files.length,
      userId: args.userId,
    });
    await assertCanAnalyzeImage({
      requestedUnits: files.length,
      userId: args.userId,
    });
  } catch (error) {
    if (!isUsageLimitError(error)) {
      throw error;
    }

    const meterKey =
      error.code === "FEATURE_NOT_INCLUDED"
        ? "bulk_upload_batches"
        : "ai_extract_credits";
    const units = meterKey === "ai_extract_credits" ? files.length : 1;

    await recordAiUsageEvent({
      endpoint: args.endpoint,
      estimatedCostUsd: 0,
      feature: "bulk_image_analysis",
      metadata: {
        code: error.code,
        filesCount: files.length,
        ...(args.kindHint ? { kindHint: args.kindHint } : {}),
      },
      meterKey,
      model: ANALYZE_MODEL,
      provider: ANALYZE_PROVIDER,
      status: "blocked",
      units,
      userId: args.userId,
    });

    return { body: toUsageLimitResponse(error), status: 403 };
  }

  try {
    const queue = await runWithConcurrency({
      items: files,
      limit: MAX_PARALLEL_UPLOADS,
      worker: (file) =>
        createAndQueueExtractionFromFile({
          file,
          mediaKind: args.kindHint ?? undefined,
          userId: args.userId,
        }),
    });

    await recordAiUsageEvent({
      endpoint: args.endpoint,
      estimatedCostUsd: 0,
      feature: "bulk_upload_action",
      metadata: {
        extractionIds: queue.map((item) => item.extractionId),
        filesCount: files.length,
        ...(args.kindHint ? { kindHint: args.kindHint } : {}),
      },
      meterKey: "bulk_upload_batches",
      model: ANALYZE_MODEL,
      provider: ANALYZE_PROVIDER,
      status: "success",
      units: 1,
      userId: args.userId,
    });
    try {
      await trackPolarUsage({
        metadata: {
          endpoint: args.endpoint,
          filesCount: files.length,
          ...(args.kindHint ? { kind: args.kindHint } : {}),
        },
        meterKey: "bulk_upload_batches",
        units: 1,
        userId: args.userId,
      });
    } catch (error) {
      logger.error({ error }, "polar_usage_track_failed_bulk");
    }

    return { body: { queue }, status: 202 };
  } catch (error) {
    logger.error({ error }, "bulk_analyze_failed");
    return {
      body: {
        details: error instanceof Error ? error.message : "Unknown error",
        error: "Failed to queue bulk analysis",
      },
      status: 500,
    };
  }
}

type BulkRetryOutcome =
  | {
      body: {
        extractionId: number;
        status: "pending";
        workflowRunId: string | null;
      };
      status: 200;
    }
  | { body: { code: string; message: string }; status: 403 }
  | { body: { error: string }; status: 400 }
  | { body: { error: string }; status: 404 }
  | { body: { details: string; error: string }; status: 500 };

async function retryBulkAnalysis(args: {
  endpoint: string;
  expectedMediaKind: "expense_receipt" | null;
  request: Request;
  userId: number;
}): Promise<BulkRetryOutcome> {
  try {
    await assertCanBulkUpload({
      batchCount: 1,
      imageCount: 1,
      userId: args.userId,
    });
    await assertCanAnalyzeImage({
      requestedUnits: 1,
      userId: args.userId,
    });
  } catch (error) {
    if (!isUsageLimitError(error)) {
      throw error;
    }

    const meterKey =
      error.code === "FEATURE_NOT_INCLUDED"
        ? "bulk_upload_batches"
        : "ai_extract_credits";
    await recordAiUsageEvent({
      endpoint: args.endpoint,
      estimatedCostUsd: 0,
      feature: "bulk_image_analysis",
      metadata: {
        code: error.code,
        ...(args.expectedMediaKind ? { kindHint: args.expectedMediaKind } : {}),
      },
      meterKey,
      model: ANALYZE_MODEL,
      provider: ANALYZE_PROVIDER,
      status: "blocked",
      units: 1,
      userId: args.userId,
    });

    return { body: toUsageLimitResponse(error), status: 403 };
  }

  const body = (await args.request.json().catch(() => ({}))) as {
    extractionId?: number | string;
  };
  const extractionId = Number.parseInt(String(body.extractionId ?? ""), 10);
  if (!Number.isFinite(extractionId) || extractionId <= 0) {
    return { body: { error: "Invalid extraction id" }, status: 400 };
  }

  try {
    const result = await retryBulkExtraction({
      expectedMediaKind: args.expectedMediaKind ?? undefined,
      extractionId,
      userId: args.userId,
    });

    return {
      body: {
        extractionId: result.extractionId,
        status: "pending",
        workflowRunId: result.workflowRunId,
      },
      status: 200,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Extraction not found" &&
      args.expectedMediaKind
    ) {
      return { body: { error: "Extraction not found" }, status: 404 };
    }

    if (
      error instanceof Error &&
      error.message === "Extraction kind mismatch" &&
      args.expectedMediaKind
    ) {
      return {
        body: { error: "Extraction does not belong to expense uploads" },
        status: 400,
      };
    }

    logger.error({ error }, "bulk_retry_failed");
    return {
      body: {
        details: error instanceof Error ? error.message : "Unknown error",
        error: "Failed to retry bulk analysis",
      },
      status: 500,
    };
  }
}

const usageLimitResponse = jsonContent(
  z.object({ code: z.string(), message: z.string() }),
  "Usage limit reached"
);

const queueResponse = jsonContent(
  z.object({ queue: z.array(z.unknown()) }),
  "Queued extraction jobs"
);

const bulkErrorResponse = jsonContent(
  z.object({ details: z.string().optional(), error: z.string() }),
  "Bulk analysis error"
);

const entriesBulkAnalyze = createRoute({
  method: "post",
  path: "/entries/bulk-analyze",
  tags: ["Bulk Analysis"],
  summary: "Queue bulk screenshot analysis for entries",
  description: "Multipart upload with one or more `files[]`/`files` images.",
  responses: {
    [HttpStatusCodes.ACCEPTED]: queueResponse,
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Invalid upload"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const entriesBulkStatus = createRoute({
  method: "get",
  path: "/entries/bulk-analyze/status",
  tags: ["Bulk Analysis"],
  summary: "Bulk analysis status for entries",
  request: {
    query: z.object({ ids: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ items: z.array(z.unknown()) }),
      "Extraction statuses"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const entriesBulkRetry = createRoute({
  method: "post",
  path: "/entries/bulk-analyze/retry",
  tags: ["Bulk Analysis"],
  summary: "Retry an entry extraction",
  description:
    "Body is `{ extractionId }` (number or numeric string); validated leniently like the legacy route.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        extractionId: z.number(),
        status: z.string(),
        workflowRunId: z.unknown().nullable(),
      }),
      "Retried extraction"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Invalid extraction id"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const expensesBulkAnalyze = createRoute({
  method: "post",
  path: "/expenses/bulk-analyze",
  tags: ["Bulk Analysis"],
  summary: "Queue bulk receipt analysis for expenses",
  description: "Multipart upload with one or more `files[]`/`files` images.",
  responses: {
    [HttpStatusCodes.ACCEPTED]: queueResponse,
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Invalid upload"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const expensesBulkStatus = createRoute({
  method: "get",
  path: "/expenses/bulk-analyze/status",
  tags: ["Bulk Analysis"],
  summary: "Bulk analysis status for expense receipts",
  request: {
    query: z.object({ ids: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ items: z.array(z.unknown()) }),
      "Extraction statuses"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const expensesBulkRetry = createRoute({
  method: "post",
  path: "/expenses/bulk-analyze/retry",
  tags: ["Bulk Analysis"],
  summary: "Retry an expense receipt extraction",
  description:
    "Body is `{ extractionId }` (number or numeric string); validated leniently like the legacy route.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        extractionId: z.number(),
        status: z.string(),
        workflowRunId: z.unknown().nullable(),
      }),
      "Retried extraction"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Invalid extraction id or upload kind"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "Extraction not found"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: bulkErrorResponse,
  },
});

const fetchStatuses = async (args: {
  expectedMediaKind: "expense_receipt" | null;
  idsParam: string | null;
  userId: number;
}): Promise<{ items: BulkStatusItemDto[] }> => {
  const ids = parseExtractionIds(args.idsParam);
  if (ids.length === 0) {
    return { items: [] };
  }

  const items = await listBulkExtractionStatuses({
    expectedMediaKind: args.expectedMediaKind ?? undefined,
    extractionIds: ids,
    userId: args.userId,
  });

  return { items };
};

export const bulkAnalyzeRoutes = new OpenAPIHono({ defaultHook })
  .openapi(entriesBulkAnalyze, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const outcome = await queueBulkAnalysis({
      endpoint: "/api/entries/bulk-analyze",
      formData: await c.req.raw.formData(),
      kindHint: null,
      userId: session.userId,
    });

    switch (outcome.status) {
      case 400: {
        return c.json(outcome.body, HttpStatusCodes.BAD_REQUEST);
      }
      case 403: {
        return c.json(outcome.body, HttpStatusCodes.FORBIDDEN);
      }
      case 500: {
        return c.json(outcome.body, HttpStatusCodes.INTERNAL_SERVER_ERROR);
      }
      default: {
        return c.json(outcome.body, HttpStatusCodes.ACCEPTED);
      }
    }
  })
  .openapi(entriesBulkStatus, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    try {
      const result = await fetchStatuses({
        expectedMediaKind: null,
        idsParam: query.ids ?? null,
        userId: session.userId,
      });

      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "bulk_status_failed");
      return c.json(
        {
          details: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to fetch bulk analysis status",
        },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(entriesBulkRetry, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const outcome = await retryBulkAnalysis({
      endpoint: "/api/entries/bulk-analyze/retry",
      expectedMediaKind: null,
      request: c.req.raw,
      userId: session.userId,
    });

    switch (outcome.status) {
      case 200: {
        return c.json(outcome.body, HttpStatusCodes.OK);
      }
      case 400: {
        return c.json(outcome.body, HttpStatusCodes.BAD_REQUEST);
      }
      case 403: {
        return c.json(outcome.body, HttpStatusCodes.FORBIDDEN);
      }
      default: {
        return c.json(outcome.body, HttpStatusCodes.INTERNAL_SERVER_ERROR);
      }
    }
  })
  .openapi(expensesBulkAnalyze, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const outcome = await queueBulkAnalysis({
      endpoint: "/api/expenses/bulk-analyze",
      formData: await c.req.raw.formData(),
      kindHint: "expense_receipt",
      userId: session.userId,
    });

    switch (outcome.status) {
      case 400: {
        return c.json(outcome.body, HttpStatusCodes.BAD_REQUEST);
      }
      case 403: {
        return c.json(outcome.body, HttpStatusCodes.FORBIDDEN);
      }
      case 500: {
        return c.json(outcome.body, HttpStatusCodes.INTERNAL_SERVER_ERROR);
      }
      default: {
        return c.json(outcome.body, HttpStatusCodes.ACCEPTED);
      }
    }
  })
  .openapi(expensesBulkStatus, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const query = c.req.valid("query");

    try {
      const result = await fetchStatuses({
        expectedMediaKind: "expense_receipt",
        idsParam: query.ids ?? null,
        userId: session.userId,
      });

      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "expense_bulk_status_failed");
      return c.json(
        {
          details: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to fetch bulk analysis status",
        },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(expensesBulkRetry, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const outcome = await retryBulkAnalysis({
      endpoint: "/api/expenses/bulk-analyze/retry",
      expectedMediaKind: "expense_receipt",
      request: c.req.raw,
      userId: session.userId,
    });

    switch (outcome.status) {
      case 200: {
        return c.json(outcome.body, HttpStatusCodes.OK);
      }
      case 400: {
        return c.json(outcome.body, HttpStatusCodes.BAD_REQUEST);
      }
      case 403: {
        return c.json(outcome.body, HttpStatusCodes.FORBIDDEN);
      }
      case 404: {
        return c.json(outcome.body, HttpStatusCodes.NOT_FOUND);
      }
      default: {
        return c.json(outcome.body, HttpStatusCodes.INTERNAL_SERVER_ERROR);
      }
    }
  });

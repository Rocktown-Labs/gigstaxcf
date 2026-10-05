import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import { logger } from "@/lib/logging/logger";
import { estimateAiCostUsd, recordAiUsageEvent } from "@/lib/services/ai-usage";
import { analyzeImageAndStore } from "@/lib/services/analyze-image";
import type { AnalyzeMediaKind } from "@/lib/services/analyze-image";
import { ANALYZE_MODEL, ANALYZE_PROVIDER } from "@/lib/services/extraction";
import { trackPolarUsage } from "@/lib/services/polar-usage";
import {
  assertCanAnalyzeImage,
  isUsageLimitError,
  toUsageLimitResponse,
} from "@/lib/services/usage-limits";

import { errorObjectSchema } from "./schemas";

type AnalyzeOutcome =
  | { body: unknown; status: 200 }
  | { body: { code: string; message: string }; status: 403 }
  | { body: { error: string }; status: 400 }
  | {
      body: { details: string; error: string };
      status: 500;
    };

async function runSingleImageAnalysis(args: {
  endpoint: string;
  file: File | null;
  kindHintParam: string | File | null;
  userId: number;
}): Promise<AnalyzeOutcome> {
  if (!args.file) {
    return { body: { error: "No file provided" }, status: 400 };
  }

  const mediaKind: AnalyzeMediaKind =
    args.kindHintParam === "expense_receipt"
      ? "expense_receipt"
      : "entry_screenshot";

  try {
    await assertCanAnalyzeImage({
      requestedUnits: 1,
      userId: args.userId,
    });
  } catch (error) {
    if (!isUsageLimitError(error)) {
      throw error;
    }

    await recordAiUsageEvent({
      endpoint: args.endpoint,
      estimatedCostUsd: 0,
      feature: "single_image_analysis",
      metadata: {
        code: error.code,
        ...(args.kindHintParam ? { kindHint: mediaKind } : {}),
      },
      meterKey: "ai_extract_credits",
      model: ANALYZE_MODEL,
      provider: ANALYZE_PROVIDER,
      status: "blocked",
      units: 1,
      userId: args.userId,
    });

    return { body: toUsageLimitResponse(error), status: 403 };
  }

  try {
    const result = await analyzeImageAndStore(
      args.userId,
      args.file,
      mediaKind
    );
    await recordAiUsageEvent({
      completionTokens: result.usage.completionTokens,
      endpoint: args.endpoint,
      estimatedCostUsd: estimateAiCostUsd({
        completionTokens: result.usage.completionTokens,
        promptTokens: result.usage.promptTokens,
      }),
      feature: "single_image_analysis",
      metadata: {
        extractionId: result.extraction.id,
        ...(args.kindHintParam ? { kindHint: mediaKind } : {}),
        mediaId: result.media.id,
      },
      meterKey: "ai_extract_credits",
      model: ANALYZE_MODEL,
      promptTokens: result.usage.promptTokens,
      provider: ANALYZE_PROVIDER,
      status: "success",
      totalTokens: result.usage.totalTokens,
      units: 1,
      userId: args.userId,
    });
    try {
      await trackPolarUsage({
        metadata: {
          endpoint: args.endpoint,
          extractionId: result.extraction.id,
          ...(args.kindHintParam ? { kind: mediaKind } : {}),
        },
        meterKey: "ai_extract_credits",
        units: 1,
        userId: args.userId,
      });
    } catch (error) {
      logger.error({ err: error }, "polar_usage_track_failed_single");
    }

    return { body: result.data, status: 200 };
  } catch (error) {
    logger.error({ err: error }, "analyze_image_failed");
    await recordAiUsageEvent({
      endpoint: args.endpoint,
      estimatedCostUsd: 0,
      feature: "single_image_analysis",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      model: ANALYZE_MODEL,
      provider: ANALYZE_PROVIDER,
      status: "failed",
      userId: args.userId,
    });

    return {
      body: {
        details: error instanceof Error ? error.message : "Unknown error",
        error: "Failed to analyze image",
      },
      status: 500,
    };
  }
}

const usageLimitResponse = jsonContent(
  z.object({ code: z.string(), message: z.string() }),
  "Usage limit reached"
);

const analyzeErrorResponse = jsonContent(
  z.object({ details: z.string().optional(), error: z.string() }),
  "Analysis error"
);

const analyzeImage = createRoute({
  method: "post",
  path: "/analyze-image",
  tags: ["Analyze"],
  summary: "Analyze a single image",
  description:
    "Multipart upload with a `file` image and optional `kindHint` (`expense_receipt`).",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Parsed extraction payload"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "No file provided"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: analyzeErrorResponse,
  },
});

const analyzeScreenshot = createRoute({
  method: "post",
  path: "/analyze-screenshot",
  tags: ["Analyze"],
  summary: "Analyze a single screenshot (legacy alias)",
  description: "Multipart upload with a `file` image.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Parsed extraction payload"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "No file provided"
    ),
    [HttpStatusCodes.FORBIDDEN]: usageLimitResponse,
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: analyzeErrorResponse,
  },
});

export const analyzeRoutes = new OpenAPIHono({ defaultHook })
  .openapi(analyzeImage, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const formData = await c.req.raw.formData();

    const outcome = await runSingleImageAnalysis({
      endpoint: "/api/analyze-image",
      file:
        formData.get("file") instanceof File
          ? (formData.get("file") as File)
          : null,
      kindHintParam: formData.get("kindHint"),
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
  .openapi(analyzeScreenshot, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const formData = await c.req.raw.formData();

    const outcome = await runSingleImageAnalysis({
      endpoint: "/api/analyze-screenshot",
      file:
        formData.get("file") instanceof File
          ? (formData.get("file") as File)
          : null,
      kindHintParam: null,
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
  });

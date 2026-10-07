import { aiExtractions, mediaAssets } from "@gigstaxcf/db/schema";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { serverEnv } from "@/lib/server-env";
import { estimateAiCostUsd, recordAiUsageEvent } from "@/lib/services/ai-usage";
import {
  ANALYZE_MODEL,
  ANALYZE_PROMPT_VERSION,
  ANALYZE_PROVIDER,
  analyzeImageFromDataUrl,
  analyzeImageFromRemoteUrl,
} from "@/lib/services/extraction";
import type { NormalizedExtractionPayload } from "@/lib/services/extraction";
import {
  bytesToBase64,
  getMediaBytes,
  R2_MEDIA_PROVIDER,
} from "@/lib/services/media";
import { trackPolarUsage } from "@/lib/services/polar-usage";

export interface ProcessExtractionParams {
  extractionId: number;
  userId: number;
}

interface ExtractionMediaContext {
  extractionId: number;
  mediaId: number;
  mediaKind: "entry_screenshot" | "expense_receipt";
  storageProvider: string;
  mediaUrl: string;
  storageKey: string | null;
  mimeType: string | null;
  userId: number;
}

const LEGACY_VERCEL_BLOB_PROVIDER = "vercel_blob";
const PRIVATE_VERCEL_BLOB_PROVIDER = "vercel_blob_private";
const PUBLIC_VERCEL_BLOB_PROVIDER = "vercel_blob_public";

const getPrivateBlobReadToken = () =>
  serverEnv.BLOB_PRIVATE_READ_WRITE_TOKEN ||
  serverEnv.BLOB_READ_WRITE_TOKEN ||
  null;

/**
 * Durable extraction pipeline, migrated from the Vercel `workflow` package
 * to Cloudflare Workflows. Steps retry independently; a failed analysis
 * after retries records the failure in the DB (matching the original
 * semantics) instead of erroring the instance forever.
 */
export class ProcessExtractionWorkflow extends WorkflowEntrypoint<
  Env,
  ProcessExtractionParams
> {
  // Workflow entrypoint: steps run via module-level helpers, so `this`
  // is intentionally unused (kept non-static for the Workflows runtime).
  // oxlint-disable-next-line class-methods-use-this
  async run(event: WorkflowEvent<ProcessExtractionParams>, step: WorkflowStep) {
    const input = event.payload;

    await step.do("mark-processing", () => markExtractionAsProcessing(input));

    try {
      const context = await step.do(
        "load-context",
        { retries: { backoff: "exponential", delay: 5, limit: 3 } },
        () => loadExtractionContext(input)
      );

      const analyzed = await step.do(
        "analyze-media",
        { retries: { backoff: "exponential", delay: 10, limit: 3 } },
        () => analyzeExtractionMedia(context)
      );

      await step.do("record-usage", () =>
        recordExtractionUsage({
          completionTokens: analyzed.usage.completionTokens,
          endpoint: "/api/entries/bulk-analyze",
          feature: "bulk_image_analysis",
          model: ANALYZE_MODEL,
          promptTokens: analyzed.usage.promptTokens,
          provider: ANALYZE_PROVIDER,
          status: "success",
          totalTokens: analyzed.usage.totalTokens,
          userId: input.userId,
        })
      );

      await step.do("mark-completed", () =>
        markExtractionAsCompleted({
          extractionId: input.extractionId,
          model: ANALYZE_MODEL,
          parsedPayload: analyzed.normalized,
          promptVersion: ANALYZE_PROMPT_VERSION,
          provider: ANALYZE_PROVIDER,
          rawResponse: analyzed.rawResponse,
        })
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Extraction failed unexpectedly";

      await step.do("record-failed-usage", () =>
        recordExtractionUsage({
          endpoint: "/api/entries/bulk-analyze",
          feature: "bulk_image_analysis",
          metadata: {
            error: message,
            extractionId: input.extractionId,
          },
          model: ANALYZE_MODEL,
          provider: ANALYZE_PROVIDER,
          status: "failed",
          userId: input.userId,
        })
      );

      await step.do("mark-failed", () =>
        markExtractionAsFailed({
          errorMessage: message,
          extractionId: input.extractionId,
          userId: input.userId,
        })
      );
    }
  }
}

async function markExtractionAsProcessing(input: ProcessExtractionParams) {
  const [row] = await db
    .update(aiExtractions)
    .set({
      completedAt: null,
      errorMessage: null,
      startedAt: new Date(),
      status: "processing",
    })
    .where(
      and(
        eq(aiExtractions.id, input.extractionId),
        eq(aiExtractions.userId, input.userId)
      )
    )
    .returning({ id: aiExtractions.id });

  if (!row) {
    throw new Error("Extraction was not found for this user");
  }
}

async function loadExtractionContext(
  input: ProcessExtractionParams
): Promise<ExtractionMediaContext> {
  const [row] = await db
    .select({
      extractionId: aiExtractions.id,
      mediaId: mediaAssets.id,
      mediaKind: mediaAssets.kind,
      mediaUrl: mediaAssets.storageUrl,
      mimeType: mediaAssets.mimeType,
      storageKey: mediaAssets.storageKey,
      storageProvider: mediaAssets.storageProvider,
      userId: aiExtractions.userId,
    })
    .from(aiExtractions)
    .innerJoin(mediaAssets, eq(aiExtractions.mediaId, mediaAssets.id))
    .where(
      and(
        eq(aiExtractions.id, input.extractionId),
        eq(aiExtractions.userId, input.userId)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error("Extraction media was not found");
  }

  return row;
}

async function analyzeExtractionMedia(context: ExtractionMediaContext) {
  if (context.storageProvider === R2_MEDIA_PROVIDER) {
    const stored = await getMediaBytes(context.storageKey);
    if (!stored) {
      throw new Error("Stored media object was not found in R2");
    }
    const dataUrl = `data:${stored.mimeType || context.mimeType || "image/png"};base64,${bytesToBase64(stored.bytes)}`;
    return await analyzeImageFromDataUrl(dataUrl);
  }

  const analyzePrivateBlobMedia = async (token: string) => {
    const response = await fetch(context.mediaUrl, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch private media: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const resolvedMimeType =
      response.headers.get("content-type") || context.mimeType || "image/png";
    const dataUrl = `data:${resolvedMimeType};base64,${buffer.toString("base64")}`;

    return await analyzeImageFromDataUrl(dataUrl);
  };

  if (context.storageProvider === PRIVATE_VERCEL_BLOB_PROVIDER) {
    const token = getPrivateBlobReadToken();
    if (!token) {
      throw new Error(
        "BLOB_PRIVATE_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN is required for private media"
      );
    }

    return await analyzePrivateBlobMedia(token);
  }

  if (context.storageProvider === LEGACY_VERCEL_BLOB_PROVIDER) {
    const token = getPrivateBlobReadToken();
    if (token) {
      try {
        return await analyzePrivateBlobMedia(token);
      } catch (error) {
        logger.warn(
          { err: error, extractionId: context.extractionId },
          "legacy_private_media_fetch_failed"
        );
      }
    }

    return await analyzeImageFromRemoteUrl(context.mediaUrl, context.mimeType);
  }

  if (context.storageProvider === PUBLIC_VERCEL_BLOB_PROVIDER) {
    return await analyzeImageFromRemoteUrl(context.mediaUrl, context.mimeType);
  }

  return await analyzeImageFromRemoteUrl(context.mediaUrl, context.mimeType);
}

async function markExtractionAsCompleted(args: {
  extractionId: number;
  model: string;
  parsedPayload: NormalizedExtractionPayload;
  promptVersion: string;
  provider: string;
  rawResponse: string;
}) {
  await db
    .update(aiExtractions)
    .set({
      completedAt: new Date(),
      errorMessage: null,
      model: args.model,
      parsedPayload: args.parsedPayload,
      promptVersion: args.promptVersion,
      provider: args.provider,
      rawResponse: args.rawResponse,
      status: "completed",
    })
    .where(eq(aiExtractions.id, args.extractionId));
}

async function markExtractionAsFailed(args: {
  errorMessage: string;
  extractionId: number;
  userId: number;
}) {
  await db
    .update(aiExtractions)
    .set({
      completedAt: new Date(),
      errorMessage: args.errorMessage,
      status: "failed",
    })
    .where(
      and(
        eq(aiExtractions.id, args.extractionId),
        eq(aiExtractions.userId, args.userId)
      )
    );
}

async function recordExtractionUsage(args: {
  completionTokens?: number | null;
  endpoint: string;
  feature: string;
  metadata?: Record<string, unknown>;
  model: string;
  promptTokens?: number | null;
  provider: string;
  status: "success" | "failed" | "blocked";
  totalTokens?: number | null;
  userId: number;
}) {
  await recordAiUsageEvent({
    completionTokens: args.completionTokens ?? null,
    endpoint: args.endpoint,
    estimatedCostUsd: estimateAiCostUsd({
      completionTokens: args.completionTokens ?? null,
      promptTokens: args.promptTokens ?? null,
    }),
    feature: args.feature,
    metadata: args.metadata,
    meterKey: "ai_extract_credits",
    model: args.model,
    promptTokens: args.promptTokens ?? null,
    provider: args.provider,
    status: args.status,
    totalTokens: args.totalTokens ?? null,
    units: 1,
    userId: args.userId,
  });

  if (args.status === "success" || args.status === "failed") {
    try {
      await trackPolarUsage({
        metadata: {
          endpoint: args.endpoint,
          status: args.status,
        },
        meterKey: "ai_extract_credits",
        units: 1,
        userId: args.userId,
      });
    } catch (error) {
      logger.error({ error }, "polar_usage_track_failed_workflow");
    }
  }
}

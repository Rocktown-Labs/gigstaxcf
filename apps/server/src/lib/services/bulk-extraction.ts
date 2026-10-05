import { aiExtractions, mediaAssets } from "@gigstaxcf/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import type { NormalizedExtractionPayload } from "@/lib/services/extraction";
import {
  ANALYZE_MODEL,
  ANALYZE_PROMPT_VERSION,
  ANALYZE_PROVIDER,
} from "@/lib/services/extraction";
import {
  createMediaAsset,
  resolveMediaAssetUrl,
  uploadFileToBlob,
} from "@/lib/services/media";
import { processExtractionWorkflow } from "@/lib/workflows/process-extraction";

export interface BulkQueueItemDto {
  draftId: string;
  extractionId: number;
  filename: string;
  mediaId: number;
  mediaUrl: string;
  status: "pending" | "processing" | "completed" | "failed";
}

export interface BulkStatusItemDto {
  errorMessage: string | null;
  extractionId: number;
  mediaUrl: string;
  parsedPayload: NormalizedExtractionPayload | null;
  status: "pending" | "processing" | "completed" | "failed";
  updatedAt: string;
  workflowRunId: string | null;
}

export async function createAndQueueExtractionFromFile(args: {
  file: File;
  mediaKind?: "entry_screenshot" | "expense_receipt";
  userId: number;
}) {
  const mediaKind = args.mediaKind ?? "entry_screenshot";

  const upload = await uploadFileToBlob(args.file, {
    kind: mediaKind,
    userId: args.userId,
  });

  const media = await createMediaAsset({
    byteSize: upload.byteSize,
    kind: mediaKind,
    mimeType: upload.mimeType,
    sha256: upload.sha256,
    storageKey: upload.blob.pathname,
    storageProvider: upload.storageProvider,
    storageUrl: upload.blob.url,
    userId: args.userId,
  });

  const [extraction] = await db
    .insert(aiExtractions)
    .values({
      applied: false,
      mediaId: media.id,
      model: ANALYZE_MODEL,
      parsedPayload: null,
      promptVersion: ANALYZE_PROMPT_VERSION,
      provider: ANALYZE_PROVIDER,
      rawResponse: "",
      status: "pending",
      userId: args.userId,
      workflowRunId: null,
    })
    .returning({
      id: aiExtractions.id,
      status: aiExtractions.status,
    });

  if (!extraction) {
    throw new Error("Failed to create extraction queue item");
  }

  await processExtractionWorkflow({
    extractionId: extraction.id,
    userId: args.userId,
  });

  const filename = args.file.name || `upload-${extraction.id}.png`;

  return {
    draftId: `${extraction.id}`,
    extractionId: extraction.id,
    filename,
    mediaId: media.id,
    mediaUrl: resolveMediaAssetUrl(media),
    status: extraction.status,
  } satisfies BulkQueueItemDto;
}

export async function listBulkExtractionStatuses(args: {
  expectedMediaKind?: "entry_screenshot" | "expense_receipt";
  extractionIds: number[];
  userId: number;
}) {
  if (args.extractionIds.length === 0) {
    return [] as BulkStatusItemDto[];
  }

  const rows = await db
    .select({
      completedAt: aiExtractions.completedAt,
      createdAt: aiExtractions.createdAt,
      errorMessage: aiExtractions.errorMessage,
      extractionId: aiExtractions.id,
      mediaId: mediaAssets.id,
      mediaKind: mediaAssets.kind,
      mediaUrl: mediaAssets.storageUrl,
      parsedPayload: aiExtractions.parsedPayload,
      startedAt: aiExtractions.startedAt,
      status: aiExtractions.status,
      storageProvider: mediaAssets.storageProvider,
      workflowRunId: aiExtractions.workflowRunId,
    })
    .from(aiExtractions)
    .innerJoin(mediaAssets, eq(aiExtractions.mediaId, mediaAssets.id))
    .where(
      and(
        eq(aiExtractions.userId, args.userId),
        inArray(aiExtractions.id, args.extractionIds)
      )
    )
    .orderBy(desc(aiExtractions.createdAt));

  const filteredRows = args.expectedMediaKind
    ? rows.filter((row) => row.mediaKind === args.expectedMediaKind)
    : rows;

  return filteredRows.map((row) => {
    const updatedAt =
      row.completedAt ?? row.startedAt ?? row.createdAt ?? new Date();

    return {
      errorMessage: row.errorMessage,
      extractionId: row.extractionId,
      mediaUrl: resolveMediaAssetUrl({
        id: row.mediaId,
        storageProvider: row.storageProvider,
        storageUrl: row.mediaUrl,
      }),
      parsedPayload: row.parsedPayload ?? null,
      status: row.status,
      updatedAt: updatedAt.toISOString(),
      workflowRunId: row.workflowRunId,
    } satisfies BulkStatusItemDto;
  });
}

export async function retryBulkExtraction(args: {
  expectedMediaKind?: "entry_screenshot" | "expense_receipt";
  extractionId: number;
  userId: number;
}) {
  const [existing] = await db
    .select({
      id: aiExtractions.id,
      mediaKind: mediaAssets.kind,
    })
    .from(aiExtractions)
    .innerJoin(mediaAssets, eq(aiExtractions.mediaId, mediaAssets.id))
    .where(
      and(
        eq(aiExtractions.id, args.extractionId),
        eq(aiExtractions.userId, args.userId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("Extraction not found");
  }
  if (args.expectedMediaKind && existing.mediaKind !== args.expectedMediaKind) {
    throw new Error("Extraction kind mismatch");
  }

  await db
    .update(aiExtractions)
    .set({
      completedAt: null,
      errorMessage: null,
      parsedPayload: null,
      rawResponse: "",
      startedAt: null,
      status: "pending",
    })
    .where(eq(aiExtractions.id, args.extractionId));

  await processExtractionWorkflow({
    extractionId: args.extractionId,
    userId: args.userId,
  });

  return { extractionId: args.extractionId, workflowRunId: null };
}

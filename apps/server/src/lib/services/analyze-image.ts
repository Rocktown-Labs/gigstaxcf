import { aiExtractions } from "@gigstaxcf/db/schema";

import { db } from "@/lib/db";
import {
  ANALYZE_MODEL,
  ANALYZE_PROMPT_VERSION,
  ANALYZE_PROVIDER,
  analyzeImageFromDataUrl,
} from "@/lib/services/extraction";
import {
  bytesToBase64,
  createMediaAsset,
  resolveMediaAssetUrl,
  uploadFileToBlob,
} from "@/lib/services/media";

export type AnalyzeMediaKind = "entry_screenshot" | "expense_receipt";

export async function analyzeImageAndStore(
  userId: number,
  file: File,
  mediaKind: AnalyzeMediaKind = "entry_screenshot"
) {
  const upload = await uploadFileToBlob(file, {
    kind: mediaKind,
    userId,
  });

  const media = await createMediaAsset({
    byteSize: upload.byteSize,
    kind: mediaKind,
    mimeType: upload.mimeType,
    sha256: upload.sha256,
    storageKey: upload.blob.pathname,
    storageProvider: upload.storageProvider,
    storageUrl: upload.blob.url,
    userId,
  });

  const dataUrl = `data:${file.type};base64,${bytesToBase64(upload.buffer)}`;
  const startedAt = new Date();
  const { normalized, rawResponse, usage } =
    await analyzeImageFromDataUrl(dataUrl);

  const [extraction] = await db
    .insert(aiExtractions)
    .values({
      applied: false,
      completedAt: new Date(),
      mediaId: media.id,
      model: ANALYZE_MODEL,
      parsedPayload: normalized,
      promptVersion: ANALYZE_PROMPT_VERSION,
      provider: ANALYZE_PROVIDER,
      rawResponse,
      startedAt,
      status: "completed",
      userId,
    })
    .returning();

  if (!extraction) {
    throw new Error("Failed to save extraction record");
  }

  return {
    data: {
      ...normalized,
      deliveryFee: normalized.fareAmount,
      estimatedTotal:
        normalized.totalEstimatedAmount ?? normalized.totalFinalAmount,
      extractionId: extraction.id,
      mediaId: media.id,
      mediaUrl: resolveMediaAssetUrl(media),
      miles: normalized.distanceMiles,
      occurredAt: null,
      screenshotUrl: resolveMediaAssetUrl(media),
      tip: normalized.tipFinalAmount ?? normalized.tipEstimatedAmount ?? 0,
    },
    extraction,
    media,
    usage,
  };
}

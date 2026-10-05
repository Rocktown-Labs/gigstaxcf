import { consumePackCreditsAtomic } from "@/lib/services/credit-balances";
import { getUserEntitlement } from "@/lib/services/entitlements";

export type UsageLimitErrorCode = "FEATURE_NOT_INCLUDED" | "QUOTA_EXCEEDED";

export class UsageLimitError extends Error {
  code: UsageLimitErrorCode;
  readonly name = "UsageLimitError";
  status: number;

  constructor(code: UsageLimitErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = 403;
  }
}

export function isUsageLimitError(error: unknown): error is UsageLimitError {
  return error instanceof UsageLimitError;
}

export function toUsageLimitResponse(error: UsageLimitError) {
  return {
    code: error.code,
    message: error.message,
  };
}

export async function assertCanAnalyzeImage(args: {
  requestedUnits?: number;
  userId: number;
}) {
  const entitlement = await getUserEntitlement(args.userId);
  const requestedUnits = Math.max(1, Math.floor(args.requestedUnits || 1));

  if (entitlement.ai.remaining === null) {
    return entitlement;
  }

  const monthlyRemaining = Math.max(0, entitlement.ai.remaining || 0);
  if (monthlyRemaining >= requestedUnits) {
    return entitlement;
  }

  const requiredPackCredits = requestedUnits - monthlyRemaining;
  if (entitlement.ai.packBalance < requiredPackCredits) {
    throw new UsageLimitError(
      "QUOTA_EXCEEDED",
      "AI credits exhausted. Upgrade or Buy Credits to continue."
    );
  }

  const consumption = await consumePackCreditsAtomic({
    credits: requiredPackCredits,
    metadata: {
      requestedUnits,
    },
    sourceType: "ai_pack_fallback_consume",
    userId: args.userId,
  });

  if (!consumption.consumed) {
    throw new UsageLimitError(
      "QUOTA_EXCEEDED",
      "AI credits exhausted. Upgrade or Buy Credits to continue."
    );
  }

  return entitlement;
}

export async function assertCanBulkUpload(args: {
  batchCount?: number;
  imageCount: number;
  userId: number;
}) {
  const entitlement = await getUserEntitlement(args.userId);

  const batchCount = Math.max(1, Math.floor(args.batchCount || 1));
  const imageCount = Math.max(0, Math.floor(args.imageCount));

  if (!entitlement.bulk.canUse) {
    throw new UsageLimitError(
      "FEATURE_NOT_INCLUDED",
      "Bulk upload is not included in your plan"
    );
  }

  if (
    entitlement.bulk.maxImagesPerBatch !== null &&
    imageCount > entitlement.bulk.maxImagesPerBatch
  ) {
    throw new UsageLimitError(
      "FEATURE_NOT_INCLUDED",
      `Bulk uploads are limited to ${entitlement.bulk.maxImagesPerBatch} images per batch`
    );
  }

  if (
    entitlement.bulk.remaining !== null &&
    entitlement.bulk.remaining < batchCount
  ) {
    throw new UsageLimitError(
      "QUOTA_EXCEEDED",
      "Monthly bulk upload quota exhausted"
    );
  }

  return entitlement;
}

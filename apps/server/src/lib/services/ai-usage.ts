import { aiUsageEvents } from "@gigstaxcf/db/schema";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/server-env";

export type AiUsageStatus = "success" | "failed" | "blocked";
export type UsageMeterKey = "ai_extract_credits" | "bulk_upload_batches";

export interface AiUsageInput {
  completionTokens?: number | null;
  endpoint: string;
  estimatedCostUsd?: number | null;
  feature: string;
  metadata?: Record<string, unknown>;
  model: string;
  meterKey?: UsageMeterKey;
  promptTokens?: number | null;
  provider: string;
  status: AiUsageStatus;
  totalTokens?: number | null;
  units?: number | null;
  userId: number;
}

const parseRate = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const INPUT_COST_PER_MILLION = parseRate(serverEnv.AI_INPUT_COST_PER_1M, 0.35);
const OUTPUT_COST_PER_MILLION = parseRate(
  serverEnv.AI_OUTPUT_COST_PER_1M,
  0.53
);

const asIntOrNull = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const asCost = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "0";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "0";
  }

  return parsed.toFixed(6);
};

const asUnits = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 1;
  }

  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

export function estimateAiCostUsd(args: {
  completionTokens?: number | null;
  promptTokens?: number | null;
}) {
  const promptTokens = Math.max(0, Number(args.promptTokens || 0));
  const completionTokens = Math.max(0, Number(args.completionTokens || 0));

  const promptCost = (promptTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const completionCost =
    (completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return promptCost + completionCost;
}

export async function recordAiUsageEvent(input: AiUsageInput) {
  const [row] = await db
    .insert(aiUsageEvents)
    .values({
      completionTokens: asIntOrNull(input.completionTokens),
      endpoint: input.endpoint,
      estimatedCostUsd: asCost(input.estimatedCostUsd),
      feature: input.feature,
      metadata: input.metadata || {},
      meterKey: input.meterKey || "ai_extract_credits",
      model: input.model,
      promptTokens: asIntOrNull(input.promptTokens),
      provider: input.provider,
      status: input.status,
      totalTokens: asIntOrNull(input.totalTokens),
      units: asUnits(input.units),
      userId: input.userId,
    })
    .returning({
      id: aiUsageEvents.id,
      meterKey: aiUsageEvents.meterKey,
      units: aiUsageEvents.units,
    });

  return row ?? null;
}

import { generateText } from "ai";

export const ANALYZE_PROMPT_VERSION = "v1-multi-platform";
export const ANALYZE_MODEL = "gemini-3-flash";
export const ANALYZE_PROVIDER = "google";

const PLATFORM_SLUGS = new Set([
  "walmart_spark",
  "uber_eats",
  "uber",
  "lyft",
  "doordash",
  "instacart",
  "grubhub",
  "shipt",
  "amazon_flex",
  "roadie",
  "other",
]);

const EXPENSE_CATEGORIES = new Set([
  "fuel",
  "maintenance",
  "tolls",
  "parking",
  "supplies",
  "phone",
  "other",
]);

export interface NormalizedExtractionPayload {
  bonusAmount: number | null;
  dropoffAddress: string | null;
  distanceMiles: number | null;
  durationSeconds: number | null;
  entryType: "earning" | "expense";
  expenseAmount: number | null;
  expenseCategory: string | null;
  fareAmount: number | null;
  notes: string | null;
  platformSlug: string | null;
  pickupAddress: string | null;
  stopsCount: number | null;
  tipEstimatedAmount: number | null;
  tipFinalAmount: number | null;
  tipStatus: "none" | "pending" | "final";
  totalEstimatedAmount: number | null;
  totalFinalAmount: number | null;
}

export interface ExtractionUsage {
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
}

function toNumberOrNull(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeTipStatus(value: unknown): "none" | "pending" | "final" {
  if (value === "pending" || value === "final") {
    return value;
  }

  return "none";
}

function normalizePlatformSlug(value: unknown) {
  if (typeof value !== "string") {
    return "other";
  }

  const slug = value.trim().toLowerCase().replaceAll(/\s+/gu, "_");
  if (!PLATFORM_SLUGS.has(slug)) {
    return "other";
  }

  return slug;
}

function normalizeExpenseCategory(value: unknown): string {
  if (typeof value !== "string") {
    return "other";
  }

  const category = value.trim().toLowerCase();
  if (!EXPENSE_CATEGORIES.has(category)) {
    return "other";
  }

  return category;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJsonFromModelOutput(text: string) {
  const jsonMatch = text.match(/\{[\s\S]*\}/u);
  if (!jsonMatch) {
    throw new Error("No JSON object found in model response");
  }

  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

export function normalizeExtractionPayload(
  parsed: Record<string, unknown>
): NormalizedExtractionPayload {
  return {
    bonusAmount: toNumberOrNull(parsed.bonusAmount),
    distanceMiles: toNumberOrNull(parsed.distanceMiles),
    dropoffAddress:
      parsed.entryType === "expense"
        ? null
        : normalizeOptionalText(parsed.dropoffAddress),
    durationSeconds: toNumberOrNull(parsed.durationSeconds),
    entryType: parsed.entryType === "expense" ? "expense" : "earning",
    expenseAmount: toNumberOrNull(parsed.expenseAmount),
    expenseCategory:
      parsed.entryType === "expense"
        ? normalizeExpenseCategory(parsed.expenseCategory)
        : null,
    fareAmount: toNumberOrNull(parsed.fareAmount),
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    pickupAddress:
      parsed.entryType === "expense"
        ? null
        : normalizeOptionalText(parsed.pickupAddress),
    platformSlug:
      parsed.entryType === "expense"
        ? null
        : normalizePlatformSlug(parsed.platformSlug),
    stopsCount: toNumberOrNull(parsed.stopsCount),
    tipEstimatedAmount: toNumberOrNull(parsed.tipEstimatedAmount),
    tipFinalAmount: toNumberOrNull(parsed.tipFinalAmount),
    tipStatus: normalizeTipStatus(parsed.tipStatus),
    totalEstimatedAmount: toNumberOrNull(parsed.totalEstimatedAmount),
    totalFinalAmount: toNumberOrNull(parsed.totalFinalAmount),
  };
}

export async function analyzeImageFromDataUrl(dataUrl: string) {
  const modelResponse = await generateText({
    messages: [
      {
        content: [
          {
            text: `Extract details from this screenshot, classifying it as either a delivery earning or a business expense.
Return JSON only with this exact shape:
{
  "entryType": "earning|expense",
  "platformSlug": "walmart_spark|uber_eats|uber|lyft|doordash|instacart|grubhub|shipt|amazon_flex|roadie|other|null",
  "pickupAddress": string | null,
  "dropoffAddress": string | null,
  "distanceMiles": number | null,
  "durationSeconds": number | null,
  "stopsCount": number | null,
  "fareAmount": number | null,
  "bonusAmount": number | null,
  "tipEstimatedAmount": number | null,
  "tipFinalAmount": number | null,
  "tipStatus": "none|pending|final",
  "totalEstimatedAmount": number | null,
  "totalFinalAmount": number | null,
  "expenseCategory": "fuel|maintenance|tolls|parking|supplies|phone|other|null",
  "expenseAmount": number | null,
  "notes": string | null
}
Rules:
- If it's a receipt for gas, tools, etc, set entryType to "expense" and fill expenseCategory/expenseAmount. Leave platform/delivery fields null.
- If it's delivery pay, set entryType to "earning" and fill platform, fare, tip, etc. Leave expense fields null.
- Capture the pickup/store/origin address in pickupAddress when it is visible.
- Capture the destination/dropoff/customer address in dropoffAddress when it is visible.
- Use null when data is not visible.
- "tipStatus" is "pending" when the UI indicates the tip is pending/adjustable later.
- For Spark screenshots, map delivery pay to fareAmount and extra earnings to bonusAmount.
- Duration should be in seconds.
- No markdown, no comments, no extra keys.`,
            type: "text",
          },
          {
            image: dataUrl,
            type: "image",
          },
        ],
        role: "user",
      },
    ],
    model: `${ANALYZE_PROVIDER}/${ANALYZE_MODEL}`,
  });

  const parsed = parseJsonFromModelOutput(modelResponse.text);
  const normalized = normalizeExtractionPayload(parsed);

  return {
    normalized,
    rawResponse: modelResponse.text,
    usage: {
      completionTokens: modelResponse.usage.outputTokens ?? null,
      promptTokens: modelResponse.usage.inputTokens ?? null,
      totalTokens: modelResponse.usage.totalTokens ?? null,
    } satisfies ExtractionUsage,
  };
}

export async function analyzeImageFromRemoteUrl(
  mediaUrl: string,
  mimeType?: string | null
) {
  const response = await fetch(mediaUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch media: ${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const resolvedMimeType =
    response.headers.get("content-type") || mimeType || "image/png";
  const dataUrl = `data:${resolvedMimeType};base64,${buffer.toString("base64")}`;

  return analyzeImageFromDataUrl(dataUrl);
}

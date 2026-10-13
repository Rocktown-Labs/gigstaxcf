import { emailSuppressions } from "@gigstaxcf/db/schema";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";

export type EmailSuppressionReason =
  | "hard_bounce"
  | "complaint"
  | "unsubscribe"
  | "manual";

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailSuppressed(email: string) {
  const normalized = normalizeEmailAddress(email);
  const [row] = await db
    .select({ reason: emailSuppressions.reason })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalized))
    .limit(1);

  return row ?? null;
}

export async function upsertEmailSuppression(args: {
  email: string;
  metadata?: Record<string, unknown>;
  reason: EmailSuppressionReason;
  source?: string | null;
}) {
  const normalized = normalizeEmailAddress(args.email);
  const now = new Date();

  const [row] = await db
    .insert(emailSuppressions)
    .values({
      email: normalized,
      metadata: args.metadata || {},
      reason: args.reason,
      source: args.source || null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        metadata: args.metadata || {},
        reason: args.reason,
        source: args.source || null,
        updatedAt: now,
      },
      target: emailSuppressions.email,
    })
    .returning({
      email: emailSuppressions.email,
      id: emailSuppressions.id,
      reason: emailSuppressions.reason,
    });

  return row ?? null;
}

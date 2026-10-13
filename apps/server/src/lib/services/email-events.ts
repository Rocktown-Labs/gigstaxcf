import { emailEvents } from "@gigstaxcf/db/schema";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";

export type EmailEventType =
  | "welcome"
  | "subscription_status"
  | "reset_password"
  | "cadence_summary"
  | "tip_verification_reminder"
  | "trip_verification_reminder"
  | "inactivity_nudge"
  | "abandoned_onboarding_offer"
  | "onboarding_tips"
  | "weekly_goal_celebration"
  | "quarterly_tax_reminder";

export type EmailEventStatus = "pending" | "sent" | "failed" | "skipped";

interface EmailEventRecord {
  id: number;
  status: EmailEventStatus;
}

export async function ensureEmailEventPending(args: {
  externalEventId: string;
  payload?: Record<string, unknown>;
  type: EmailEventType;
  userId: number;
}): Promise<EmailEventRecord | null> {
  const [existing] = await db
    .select({ id: emailEvents.id, status: emailEvents.status })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.externalEventId, args.externalEventId),
        eq(emailEvents.userId, args.userId)
      )
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(emailEvents)
    .values({
      externalEventId: args.externalEventId,
      payload: args.payload || {},
      status: "pending",
      type: args.type,
      updatedAt: new Date(),
      userId: args.userId,
    })
    .returning({ id: emailEvents.id, status: emailEvents.status });

  return created ?? null;
}

export function shouldSendEmailEvent(
  event: EmailEventRecord | null
): event is EmailEventRecord & { status: "pending" } {
  return event?.status === "pending";
}

export async function markEmailEventSent(args: {
  eventId: number;
  providerMessageId?: string | null;
}) {
  await db
    .update(emailEvents)
    .set({
      providerMessageId: args.providerMessageId || null,
      status: "sent",
      updatedAt: new Date(),
    })
    .where(eq(emailEvents.id, args.eventId));
}

export async function markEmailEventFailed(args: {
  error: string;
  eventId: number;
}) {
  await db
    .update(emailEvents)
    .set({
      error: args.error,
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(emailEvents.id, args.eventId));
}

export async function markEmailEventSkipped(args: {
  eventId: number;
  reason: string;
}) {
  await db
    .update(emailEvents)
    .set({
      error: args.reason,
      status: "skipped",
      updatedAt: new Date(),
    })
    .where(eq(emailEvents.id, args.eventId));
}

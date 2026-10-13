import { emailWebhookEvents } from "@gigstaxcf/db/schema";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";

export async function reserveWebhookEvent(args: {
  eventType: string;
  payload: Record<string, unknown>;
  providerEventId: string;
}) {
  const [row] = await db
    .insert(emailWebhookEvents)
    .values({
      eventType: args.eventType,
      payload: args.payload,
      providerEventId: args.providerEventId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: emailWebhookEvents.providerEventId })
    .returning({
      id: emailWebhookEvents.id,
    });

  return row ?? null;
}

export async function markWebhookEventProcessed(providerEventId: string) {
  await db
    .update(emailWebhookEvents)
    .set({
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailWebhookEvents.providerEventId, providerEventId));
}

import { emailEvents } from "@gigstaxcf/db/schema";
import { and, eq } from "drizzle-orm";

import { SubscriptionStatusEmail } from "@/emails";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/services/email";
import {
  ensureEmailEventPending,
  markEmailEventFailed,
  markEmailEventSkipped,
  markEmailEventSent,
  shouldSendEmailEvent,
} from "@/lib/services/email-events";

interface SubscriptionEmailInput {
  appUserId: number;
  billingInterval: "month" | "year" | null;
  email: string;
  periodEnd: string | null;
  planTier: "free" | "starter" | "driver" | "pro_driver";
  status: string;
  subscriptionId: string;
}

export async function sendSubscriptionEmailWorkflow(
  input: SubscriptionEmailInput
) {
  const event = await reserveSubscriptionEmailEvent(input);
  if (!event) {
    return;
  }

  try {
    const message = await deliverSubscriptionEmail(input);
    if (message.status === "skipped") {
      await markEmailEventSkipped({
        eventId: event.id,
        reason: "Recipient suppressed",
      });
      return;
    }

    await markEmailEventSent({
      eventId: event.id,
      providerMessageId: message.providerMessageId,
    });
  } catch (error) {
    await markEmailEventFailed({
      error:
        error instanceof Error
          ? error.message
          : "Failed to send subscription email",
      eventId: event.id,
    });
  }
}

async function reserveSubscriptionEmailEvent(input: SubscriptionEmailInput) {
  const externalEventId = `sub_status:${input.subscriptionId}:${input.status}:${input.periodEnd || "none"}`;

  const existingSent = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.externalEventId, externalEventId),
        eq(emailEvents.status, "sent")
      )
    )
    .limit(1);

  if (existingSent.length > 0) {
    return null;
  }

  const event = await ensureEmailEventPending({
    externalEventId,
    payload: {
      billingInterval: input.billingInterval,
      periodEnd: input.periodEnd,
      planTier: input.planTier,
      status: input.status,
      subscriptionId: input.subscriptionId,
    },
    type: "subscription_status",
    userId: input.appUserId,
  });

  if (!shouldSendEmailEvent(event)) {
    return null;
  }

  return event;
}

async function deliverSubscriptionEmail(input: SubscriptionEmailInput) {
  const { renderEmailTemplate } = await import("@/emails/render-email");
  const planLabel =
    input.planTier === "pro_driver"
      ? `Pro Driver${input.billingInterval ? ` (${input.billingInterval})` : ""}`
      : input.planTier === "driver"
        ? `Driver${input.billingInterval ? ` (${input.billingInterval})` : ""}`
        : input.planTier === "starter"
          ? "Starter"
          : "Free";

  const rendered = await renderEmailTemplate(
    SubscriptionStatusEmail({
      billingInterval: input.billingInterval,
      periodEnd: input.periodEnd,
      planLabel,
      status: input.status,
    })
  );

  return sendEmail({
    category: "transactional",
    html: rendered.html,
    idempotencyKey: `sub_status:${input.subscriptionId}:${input.status}:${input.periodEnd || "none"}`,
    subject: "GigStax subscription update",
    text: rendered.text,
    to: input.email,
  });
}

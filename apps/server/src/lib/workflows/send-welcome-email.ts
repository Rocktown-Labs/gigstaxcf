import { emailEvents } from "@gigstaxcf/db/schema";
import { and, eq } from "drizzle-orm";

import { WelcomeEmail } from "@/emails";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/seo";
import { isNonRetryableEmailSendError, sendEmail } from "@/lib/services/email";
import {
  ensureEmailEventPending,
  markEmailEventFailed,
  markEmailEventSkipped,
  markEmailEventSent,
  shouldSendEmailEvent,
} from "@/lib/services/email-events";

interface WelcomeEmailInput {
  appUserId: number;
  email: string;
  name: string;
}

export async function sendWelcomeEmailWorkflow(input: WelcomeEmailInput) {
  const event = await reserveWelcomeEmailEvent(input);
  if (!event) {
    return;
  }

  try {
    const message = await deliverWelcomeEmail(input);
    if (message.status === "skipped") {
      await markEmailEventSkipped({
        eventId: event.id,
        reason: "Recipient suppressed",
      });
      return;
    }

    if (message.status === "failed") {
      await markEmailEventFailed({
        error: message.error,
        eventId: event.id,
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
        error instanceof Error ? error.message : "Failed to send welcome email",
      eventId: event.id,
    });
  }
}

async function reserveWelcomeEmailEvent(input: WelcomeEmailInput) {
  const existingSent = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.externalEventId, `welcome:${input.appUserId}`),
        eq(emailEvents.status, "sent")
      )
    )
    .limit(1);

  if (existingSent.length > 0) {
    return null;
  }

  const event = await ensureEmailEventPending({
    externalEventId: `welcome:${input.appUserId}`,
    payload: { email: input.email, name: input.name },
    type: "welcome",
    userId: input.appUserId,
  });

  if (!shouldSendEmailEvent(event)) {
    return null;
  }

  return event;
}

async function deliverWelcomeEmail(input: WelcomeEmailInput) {
  const { renderEmailTemplate } = await import("@/emails/render-email");
  const rendered = await renderEmailTemplate(
    WelcomeEmail({ dashboardHref: `${siteUrl}/dashboard`, name: input.name })
  );

  try {
    return await sendEmail({
      category: "transactional",
      html: rendered.html,
      idempotencyKey: `welcome:${input.appUserId}`,
      subject: "Welcome to GigStax",
      text: rendered.text,
      to: input.email,
    });
  } catch (error) {
    if (!isNonRetryableEmailSendError(error)) {
      throw error;
    }

    return {
      error:
        error instanceof Error ? error.message : "Failed to send welcome email",
      status: "failed" as const,
    };
  }
}

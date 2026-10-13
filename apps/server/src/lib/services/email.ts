import { Resend } from "resend";

import { serverEnv } from "@/lib/server-env";
import { isEmailSuppressed } from "@/lib/services/email-suppressions";

export type EmailCategory = "transactional" | "lifecycle";

export interface SendEmailInput {
  category?: EmailCategory;
  from?: string;
  headers?: Record<string, string>;
  html: string;
  idempotencyKey?: string;
  subject: string;
  text?: string;
  to: string;
}

export type SendEmailResult =
  | { reason: "suppressed"; status: "skipped" }
  | { providerMessageId: string | null; status: "sent" };

export function isNonRetryableEmailSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("Not authorized to send emails from") ||
    message.includes("domain is not verified") ||
    message.includes("RESEND_API_KEY is not configured") ||
    message.includes("403") ||
    message.includes("401")
  );
}

function getDefaultFromAddress(category: EmailCategory) {
  if (category === "lifecycle") {
    return (
      serverEnv.RESEND_FROM_LIFECYCLE || "GigStax <updates@news.gigstax.com>"
    );
  }

  return (
    serverEnv.RESEND_FROM_TRANSACTIONAL || "GigStax <no-reply@gigstax.com>"
  );
}

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const category = input.category || "transactional";
  const suppression = await isEmailSuppressed(input.to);
  if (
    suppression &&
    (suppression.reason !== "unsubscribe" || category === "lifecycle")
  ) {
    return {
      reason: "suppressed",
      status: "skipped",
    };
  }

  const headers: Record<string, string> = {
    ...input.headers,
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const resend = new Resend(apiKey);
  const message = await resend.emails.send({
    from: input.from || getDefaultFromAddress(category),
    headers,
    html: input.html,
    subject: input.subject,
    text: input.text,
    to: input.to,
  });

  if (message.error) {
    throw new Error(message.error.message || "Failed to send email");
  }

  return {
    providerMessageId: message.data?.id || null,
    status: "sent",
  };
}

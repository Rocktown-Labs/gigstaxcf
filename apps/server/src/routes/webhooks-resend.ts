import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { Webhook } from "svix";
import { z } from "zod";

import { logger } from "@/lib/logging/logger";
import { serverEnv } from "@/lib/server-env";
import { upsertEmailSuppression } from "@/lib/services/email-suppressions";
import {
  markWebhookEventProcessed,
  reserveWebhookEvent,
} from "@/lib/services/email-webhook-events";

import { errorObjectSchema } from "./schemas";

interface ResendWebhookPayload {
  data?: Record<string, unknown>;
  id?: string;
  type?: string;
}

const postResendWebhook = createRoute({
  method: "post",
  path: "/webhooks/resend",
  tags: ["Webhooks"],
  summary: "Resend delivery webhook",
  description:
    "Verifies the svix signature, records the event, and suppresses addresses on bounce/complaint events.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Webhook processed"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Missing headers or invalid signature"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      errorObjectSchema,
      "Webhook secret not configured"
    ),
  },
});

function getRequiredHeaders(request: Request) {
  const id = request.headers.get("svix-id");
  const signature = request.headers.get("svix-signature");
  const timestamp = request.headers.get("svix-timestamp");

  if (!id || !signature || !timestamp) {
    return null;
  }

  return {
    "svix-id": id,
    "svix-signature": signature,
    "svix-timestamp": timestamp,
  };
}

function extractRecipientEmail(data: Record<string, unknown> | undefined) {
  if (!data) {
    return "";
  }

  const directEmail = data.email;
  if (typeof directEmail === "string" && directEmail.trim()) {
    return directEmail.trim().toLowerCase();
  }

  const { to } = data;
  if (typeof to === "string" && to.trim()) {
    return to.trim().toLowerCase();
  }

  if (Array.isArray(to) && typeof to[0] === "string") {
    return to[0].trim().toLowerCase();
  }

  return "";
}

export const webhooksResendRoutes = new OpenAPIHono({ defaultHook }).openapi(
  postResendWebhook,
  async (c) => {
    const secret = serverEnv.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      return c.json(
        { error: "Webhook secret not configured" },
        HttpStatusCodes.SERVICE_UNAVAILABLE
      );
    }

    const headers = getRequiredHeaders(c.req.raw);
    if (!headers) {
      return c.json(
        { error: "Missing svix headers" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    const rawBody = await c.req.raw.text();
    let payload: ResendWebhookPayload;
    try {
      payload = new Webhook(secret).verify(
        rawBody,
        headers
      ) as ResendWebhookPayload;
    } catch {
      return c.json(
        { error: "Invalid webhook signature" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    const eventType = payload.type || "unknown";
    const providerEventId = payload.id || headers["svix-id"];
    const record = await reserveWebhookEvent({
      eventType,
      payload: payload as Record<string, unknown>,
      providerEventId,
    });

    if (!record) {
      return c.json({ duplicate: true }, HttpStatusCodes.OK);
    }

    const email = extractRecipientEmail(payload.data);
    if (email && eventType === "email.bounced") {
      await upsertEmailSuppression({
        email,
        metadata: {
          eventType,
          providerEventId,
        },
        reason: "hard_bounce",
        source: "resend_webhook",
      });
    }

    if (email && eventType === "email.complained") {
      await upsertEmailSuppression({
        email,
        metadata: {
          eventType,
          providerEventId,
        },
        reason: "complaint",
        source: "resend_webhook",
      });
    }

    await markWebhookEventProcessed(providerEventId);
    logger.info({ eventType, providerEventId }, "resend_webhook_processed");
    return c.json({ ok: true }, HttpStatusCodes.OK);
  }
);

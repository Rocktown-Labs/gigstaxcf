import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import {
  getOrCreateEmailPreferences,
  updateEmailPreferencesForUser,
} from "@/lib/services/email-preferences";
import { applyLifecycleUnsubscribeToken } from "@/lib/services/email-unsubscribe";

import { errorObjectSchema } from "./schemas";

const emailPreferencesPatchSchema = z
  .object({
    cadenceSummaryEnabled: z.boolean().optional(),
    goalCelebrationEnabled: z.boolean().optional(),
    inactivityNudgeEnabled: z.boolean().optional(),
    onboardingOfferEnabled: z.boolean().optional(),
    onboardingTipsEnabled: z.boolean().optional(),
    quarterlyTaxReminderEnabled: z.boolean().optional(),
    tipReminderEnabled: z.boolean().optional(),
    tripVerificationReminderEnabled: z.boolean().optional(),
  })
  .partial()
  .superRefine((value, ctx) => {
    if (
      value.cadenceSummaryEnabled === undefined &&
      value.goalCelebrationEnabled === undefined &&
      value.inactivityNudgeEnabled === undefined &&
      value.onboardingOfferEnabled === undefined &&
      value.onboardingTipsEnabled === undefined &&
      value.quarterlyTaxReminderEnabled === undefined &&
      value.tipReminderEnabled === undefined &&
      value.tripVerificationReminderEnabled === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one preference field",
      });
    }
  });

const preferencesResponse = jsonContent(
  z.object({ preferences: z.unknown() }),
  "Email preferences"
);

const getPreferences = createRoute({
  method: "get",
  path: "/email/preferences",
  tags: ["Email"],
  summary: "Get email preferences",
  responses: {
    [HttpStatusCodes.OK]: preferencesResponse,
  },
});

const patchPreferences = createRoute({
  method: "patch",
  path: "/email/preferences",
  tags: ["Email"],
  summary: "Update email preferences",
  request: {
    body: jsonContentRequired(
      emailPreferencesPatchSchema,
      "Preference fields to update"
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: preferencesResponse,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(emailPreferencesPatchSchema),
      "Validation failed"
    ),
  },
});

const postUnsubscribe = createRoute({
  method: "post",
  path: "/email/unsubscribe",
  tags: ["Email"],
  summary: "Apply a one-click lifecycle unsubscribe token",
  description:
    "Token is read from the `token` query parameter or the JSON body `{ token }`.",
  request: {
    query: z.object({ token: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.ACCEPTED]: {
      description: "Unsubscribe applied",
      content: { "text/plain": { schema: z.string() } },
    },
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Missing or invalid token"
    ),
  },
});

export const emailPreferencesRoutes = new OpenAPIHono({ defaultHook })
  .openapi(getPreferences, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const preferences = await getOrCreateEmailPreferences(session.userId);

    return c.json({ preferences }, HttpStatusCodes.OK);
  })
  .openapi(patchPreferences, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const parsed = c.req.valid("json");

    const preferences = await updateEmailPreferencesForUser({
      patch: parsed,
      userId: session.userId,
    });

    return c.json({ preferences }, HttpStatusCodes.OK);
  })
  .openapi(postUnsubscribe, async (c) => {
    const body = await c.req.raw.json().catch(() => ({}));
    const token =
      c.req.valid("query").token ??
      (body &&
      typeof body === "object" &&
      "token" in body &&
      typeof body.token === "string"
        ? body.token
        : "");

    if (!token) {
      return c.json({ error: "Missing token" }, HttpStatusCodes.BAD_REQUEST);
    }

    const payload = await applyLifecycleUnsubscribeToken(token);
    if (!payload) {
      return c.json(
        { error: "Invalid or expired token" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    return c.text("", HttpStatusCodes.ACCEPTED);
  });

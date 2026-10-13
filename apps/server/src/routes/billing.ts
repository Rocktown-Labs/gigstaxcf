import { subscriptions } from "@gigstaxcf/db/schema";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import { z } from "zod";

import { requireSession } from "@/lib/api";
import { db } from "@/lib/db";
import { listActiveCreditPacks } from "@/lib/services/credit-packs";
import { getUserEntitlement } from "@/lib/services/entitlements";
import { listPricingPlans } from "@/lib/services/pricing-plans";

const getBillingRoute = createRoute({
  method: "get",
  path: "/billing",
  tags: ["Billing"],
  summary: "Billing state for the current user",
  description:
    "Mirrors what the legacy billing page server-rendered: the raw subscription row, entitlement (plan + pack balance + metered usage), active pricing plans, and active credit packs.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        creditPacks: z.array(z.unknown()),
        entitlement: z.unknown(),
        pricingPlans: z.array(z.unknown()),
        subscription: z.unknown().nullable(),
      }),
      "Billing state"
    ),
  },
});

export const billingRoutes = new OpenAPIHono({ defaultHook }).openapi(
  getBillingRoute,
  async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const [subscription, entitlement, pricingPlans, creditPacks] =
      await Promise.all([
        db
          .select({
            billingInterval: subscriptions.billingInterval,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            currentPeriodStart: subscriptions.currentPeriodStart,
            planTier: subscriptions.planTier,
            status: subscriptions.status,
          })
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        getUserEntitlement(session.userId),
        listPricingPlans({ activeOnly: true }),
        listActiveCreditPacks(),
      ]);

    return c.json(
      {
        creditPacks,
        entitlement,
        pricingPlans,
        subscription,
      },
      HttpStatusCodes.OK
    );
  }
);

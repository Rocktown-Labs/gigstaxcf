import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import createMessageObjectSchema from "stoker/openapi/schemas/create-message-object";
import { z } from "zod";

import { requireAdmin, requireIdParam } from "@/lib/api";
import { logger } from "@/lib/logging/logger";
import { parsePaginationParams } from "@/lib/pagination";
import {
  getAdminOverview,
  getAdminUsageSummary,
  listAdminUsersPage,
  updateAdminUserRole,
} from "@/lib/services/admin";
import {
  listCreditPacks,
  updateCreditPackById,
} from "@/lib/services/credit-packs";
import {
  getOnboardingOfferAdminState,
  syncStarterOnboardingOffer,
} from "@/lib/services/onboarding-offers";
import {
  getAdminPricingPlans,
  syncPricingCatalogToPolar,
  updateAdminPricingPlan,
} from "@/lib/services/polar-admin";
import {
  createAdminDiscount,
  deleteAdminDiscount,
  expireAdminDiscount,
  getAdminDiscountState,
  parseAdminDiscountInput,
  updateAdminDiscount,
} from "@/lib/services/polar-discounts";

import {
  DiscountIdParamsSchema,
  errorObjectSchema,
  IdParamsSchema,
} from "./schemas";

const overviewRoute = createRoute({
  method: "get",
  path: "/admin/overview",
  tags: ["Admin"],
  summary: "Admin overview stats",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        onboardingBreakdown: z.array(z.unknown()),
        planBreakdown: z.array(z.unknown()),
        stats: z.unknown(),
      }),
      "Admin overview"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load admin overview"
    ),
  },
});

const usersRoute = createRoute({
  method: "get",
  path: "/admin/users",
  tags: ["Admin"],
  summary: "List users (admin)",
  request: {
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        pagination: z.unknown(),
        summary: z.unknown(),
        userGrowth: z.array(z.unknown()),
        users: z.array(z.unknown()),
      }),
      "Users page"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema("Invalid query parameters"),
      "Invalid query parameters"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load users"
    ),
  },
});

const roleUpdateSchema = z.object({
  role: z.enum(["admin", "driver"]),
});

const userRoleRoute = createRoute({
  method: "patch",
  path: "/admin/users/{id}/role",
  tags: ["Admin"],
  summary: "Update a user's role",
  request: {
    params: IdParamsSchema,
    body: jsonContentRequired(roleUpdateSchema, "Role to assign"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ user: z.unknown() }),
      "Updated user"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "User not found"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(roleUpdateSchema),
      "Validation failed"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to update user role"
    ),
  },
});

const discountsListRoute = createRoute({
  method: "get",
  path: "/admin/pricing/discounts",
  tags: ["Admin"],
  summary: "List Polar discounts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Discount state"),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load discounts"
    ),
  },
});

const discountsCreateRoute = createRoute({
  method: "post",
  path: "/admin/pricing/discounts",
  tags: ["Admin"],
  summary: "Create a Polar discount",
  request: {
    body: jsonContent(z.unknown(), "Discount payload"),
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({ discount: z.unknown() }),
      "Created discount"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Failed to create discount"
    ),
  },
});

const discountUpdateRoute = createRoute({
  method: "patch",
  path: "/admin/pricing/discounts/{discountId}",
  tags: ["Admin"],
  summary: "Update a Polar discount",
  request: {
    params: DiscountIdParamsSchema,
    body: jsonContent(z.unknown(), "Discount patch"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ discount: z.unknown() }),
      "Updated discount"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Failed to update discount"
    ),
  },
});

const discountDeleteRoute = createRoute({
  method: "delete",
  path: "/admin/pricing/discounts/{discountId}",
  tags: ["Admin"],
  summary: "Delete a Polar discount",
  request: { params: DiscountIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ deleted: z.boolean() }),
      "Deleted discount"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Failed to delete discount"
    ),
  },
});

const discountExpireRoute = createRoute({
  method: "post",
  path: "/admin/pricing/discounts/{discountId}/expire",
  tags: ["Admin"],
  summary: "Expire a Polar discount",
  request: { params: DiscountIdParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ discount: z.unknown() }),
      "Expired discount"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorObjectSchema,
      "Failed to expire discount"
    ),
  },
});

const offerRoute = createRoute({
  method: "get",
  path: "/admin/pricing/offer",
  tags: ["Admin"],
  summary: "Onboarding offer admin state",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Onboarding offer state"),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load onboarding offer"
    ),
  },
});

const offerSyncRoute = createRoute({
  method: "post",
  path: "/admin/pricing/offer",
  tags: ["Admin"],
  summary: "Sync the starter onboarding offer",
  description: "Body is `{ regenerate?: boolean }`.",
  request: {
    body: jsonContent(z.unknown(), "Offer sync options"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.unknown(), "Offer sync result"),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to sync onboarding offer"
    ),
  },
});

const packsListRoute = createRoute({
  method: "get",
  path: "/admin/pricing/packs",
  tags: ["Admin"],
  summary: "List credit packs",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ packs: z.array(z.unknown()) }),
      "Credit packs"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load pricing packs"
    ),
  },
});

const updatePackSchema = z
  .object({
    credits: z.number().int().min(0).optional(),
    currencyCode: z.string().trim().length(3).optional(),
    description: z.string().trim().optional(),
    displayName: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    polarPriceId: z.string().trim().min(1).nullable().optional(),
    polarProductId: z.string().trim().min(1).nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const packUpdateRoute = createRoute({
  method: "patch",
  path: "/admin/pricing/packs/{id}",
  tags: ["Admin"],
  summary: "Update a credit pack",
  request: {
    params: IdParamsSchema,
    body: jsonContentRequired(updatePackSchema, "Pack fields to update"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ pack: z.unknown() }),
      "Updated pack"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "Pack not found"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updatePackSchema),
      "Validation failed"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to update pricing pack"
    ),
  },
});

const plansListRoute = createRoute({
  method: "get",
  path: "/admin/pricing/plans",
  tags: ["Admin"],
  summary: "List pricing plans",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ plans: z.array(z.unknown()) }),
      "Pricing plans"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load pricing plans"
    ),
  },
});

const updatePlanSchema = z
  .object({
    aiCreditLimit: z.number().int().nullable().optional(),
    bulkBatchLimit: z.number().int().nullable().optional(),
    bulkMaxImagesPerBatch: z.number().int().nullable().optional(),
    currencyCode: z.string().trim().length(3).optional(),
    description: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    features: z.array(z.string().trim().min(1)).optional(),
    isActive: z.boolean().optional(),
    priceCents: z.number().int().min(0).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const planUpdateRoute = createRoute({
  method: "patch",
  path: "/admin/pricing/plans/{id}",
  tags: ["Admin"],
  summary: "Update a pricing plan",
  request: {
    params: IdParamsSchema,
    body: jsonContentRequired(updatePlanSchema, "Plan fields to update"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ plan: z.unknown() }),
      "Updated plan"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "Plan not found"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updatePlanSchema),
      "Validation failed"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to update pricing plan"
    ),
  },
});

const pricingSyncRoute = createRoute({
  method: "post",
  path: "/admin/pricing/sync",
  tags: ["Admin"],
  summary: "Sync the pricing catalog to Polar",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({ result: z.unknown(), success: z.boolean() }),
      "Pricing sync result"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to sync pricing to Polar"
    ),
  },
});

const usageSummaryRoute = createRoute({
  method: "get",
  path: "/admin/usage/summary",
  tags: ["Admin"],
  summary: "AI usage summary",
  request: {
    query: z.object({ days: z.string().optional() }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        dailyTotals: z.array(z.unknown()),
        endpointSummary: z.array(z.unknown()),
        overview: z.unknown(),
        periodStart: z.string(),
        summary: z.array(z.unknown()),
        topUsers: z.array(z.unknown()),
        usageByDay: z.array(z.unknown()),
      }),
      "Usage summary"
    ),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
      errorObjectSchema,
      "Failed to load usage summary"
    ),
  },
});

const normalizeDiscountId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Invalid discount id");
  }

  return trimmed;
};

export const adminRoutes = new OpenAPIHono({ defaultHook })
  .openapi(overviewRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const overview = await getAdminOverview();
      return c.json(overview, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_overview_failed");
      return c.json(
        { error: "Failed to load admin overview" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(usersRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const query = c.req.valid("query");

    const parsedPagination = parsePaginationParams({
      defaultPageSize: 10,
      maxPageSize: 10,
      pageParam: query.page ?? null,
      pageSizeParam: query.pageSize ?? null,
    });
    if ("error" in parsedPagination) {
      return c.json(
        { message: parsedPagination.error },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    try {
      const result = await listAdminUsersPage(parsedPagination.pagination);
      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_users_list_failed");
      return c.json(
        { error: "Failed to load users" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(userRoleRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const userId = requireIdParam(c.req.valid("param").id);
    const { role } = c.req.valid("json");

    try {
      const updated = await updateAdminUserRole(userId, role);
      if (!updated) {
        return c.json({ error: "User not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json({ user: updated }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_role_update_failed");
      return c.json(
        { error: "Failed to update user role" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(discountsListRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const state = await getAdminDiscountState();
      return c.json(state, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_discounts_get_failed");
      return c.json(
        { error: "Failed to load discounts" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(discountsCreateRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const body = c.req.valid("json");
      const input = parseAdminDiscountInput(body);
      const discount = await createAdminDiscount(input);

      return c.json({ discount }, HttpStatusCodes.CREATED);
    } catch (error) {
      logger.error({ error }, "admin_pricing_discounts_create_failed");
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to create discount",
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }
  })
  .openapi(discountUpdateRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const { discountId } = c.req.valid("param");

    try {
      const body = c.req.valid("json");
      const input = parseAdminDiscountInput(body);
      const discount = await updateAdminDiscount({
        discountId: normalizeDiscountId(discountId),
        input,
      });

      return c.json({ discount }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_discount_update_failed");
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update discount",
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }
  })
  .openapi(discountDeleteRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const { discountId } = c.req.valid("param");

    try {
      await deleteAdminDiscount(normalizeDiscountId(discountId));

      return c.json({ deleted: true }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_discount_delete_failed");
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to delete discount",
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }
  })
  .openapi(discountExpireRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const { discountId } = c.req.valid("param");

    try {
      const discount = await expireAdminDiscount(
        normalizeDiscountId(discountId)
      );

      return c.json({ discount }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_discount_expire_failed");
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to expire discount",
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }
  })
  .openapi(offerRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const state = await getOnboardingOfferAdminState();
      return c.json(state, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_offer_get_failed");
      return c.json(
        { error: "Failed to load onboarding offer" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(offerSyncRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const body = (c.req.valid("json") ?? {}) as {
        regenerate?: boolean;
      };

      const result = await syncStarterOnboardingOffer({
        regenerate: body.regenerate === true,
      });

      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_offer_sync_failed");
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to sync onboarding offer",
        },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(packsListRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const packs = await listCreditPacks({ activeOnly: false });

      return c.json({ packs }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_packs_failed");
      return c.json(
        { error: "Failed to load pricing packs" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(packUpdateRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const packId = requireIdParam(c.req.valid("param").id);
    const patch = c.req.valid("json");

    try {
      const updated = await updateCreditPackById({
        id: packId,
        patch,
      });

      if (!updated) {
        return c.json({ error: "Pack not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json({ pack: updated }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_pack_update_failed");
      return c.json(
        { error: "Failed to update pricing pack" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(plansListRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const plans = await getAdminPricingPlans();

      return c.json({ plans }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_plans_failed");
      return c.json(
        { error: "Failed to load pricing plans" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(planUpdateRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const planId = requireIdParam(c.req.valid("param").id);
    const patch = c.req.valid("json");

    try {
      const updated = await updateAdminPricingPlan({
        id: planId,
        patch,
      });

      if (!updated) {
        return c.json({ error: "Plan not found" }, HttpStatusCodes.NOT_FOUND);
      }

      return c.json({ plan: updated }, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_pricing_update_failed");
      return c.json(
        { error: "Failed to update pricing plan" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(pricingSyncRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);

    try {
      const syncResult = await syncPricingCatalogToPolar();

      return c.json(
        {
          result: syncResult,
          success: syncResult.errors.length === 0,
        },
        HttpStatusCodes.OK
      );
    } catch (error) {
      logger.error({ error }, "admin_pricing_sync_failed");
      return c.json(
        { error: "Failed to sync pricing to Polar" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(usageSummaryRoute, async (c) => {
    await requireAdmin(c.req.raw.headers);
    const query = c.req.valid("query");

    const daysParam = Number.parseInt(query.days ?? "30", 10);
    const days = Number.isFinite(daysParam)
      ? Math.min(Math.max(daysParam, 1), 180)
      : 30;

    try {
      const result = await getAdminUsageSummary(days);
      return c.json(result, HttpStatusCodes.OK);
    } catch (error) {
      logger.error({ error }, "admin_usage_summary_failed");
      return c.json(
        { error: "Failed to load usage summary" },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  });

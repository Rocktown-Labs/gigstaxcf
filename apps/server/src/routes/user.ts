import { subscriptions, users } from "@gigstaxcf/db/schema";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import jsonContentRequired from "stoker/openapi/helpers/json-content-required";
import createErrorSchema from "stoker/openapi/schemas/create-error-schema";
import { z, ZodError } from "zod";

import { requireSession } from "@/lib/api";
import { db } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { deriveTripSearchContextLabel } from "@/lib/radar/search";
import { siteUrl } from "@/lib/seo";
import {
  getOrCreateEmailPreferences,
  updateEmailPreferencesForUser,
} from "@/lib/services/email-preferences";
import {
  getUserPlatformState,
  syncUserPlatformSelections,
} from "@/lib/services/platforms";
import {
  getPolarServer,
  isPolarMissingCheckoutProductError,
} from "@/lib/services/polar-catalog";
import { hasPolarCheckoutSlug } from "@/lib/services/polar-checkout-config";
import {
  getPricingPlanBySelection,
  listPricingPlans,
  toCheckoutSlug,
} from "@/lib/services/pricing-plans";
import {
  getOrCreateStubProfile,
  isStubTablesMissingError,
  STUB_TABLES_MISSING_MESSAGE,
  updateStubProfileForUser,
} from "@/lib/services/stubs";
import {
  onboardingPlanSchema,
  onboardingSetupSchema,
  updatePreferencesSchema,
} from "@/lib/validations";
import type { OnboardingPlanInput } from "@/lib/validations";
import { getAuth } from "@/services";

import { errorDetailsObjectSchema, errorObjectSchema } from "./schemas";

const userStateResponse = jsonContent(
  z.object({
    availablePlatforms: z.array(z.unknown()),
    emailPreferences: z.unknown(),
    selectedPlatforms: z.array(z.unknown()),
    user: z.unknown(),
    verificationProfile: z.unknown().optional(),
  }),
  "User settings state"
);

const getUserRoute = createRoute({
  method: "get",
  path: "/user",
  tags: ["User"],
  summary: "Get the current user's settings state",
  responses: {
    [HttpStatusCodes.OK]: userStateResponse,
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "User not found"
    ),
  },
});

const patchUserRoute = createRoute({
  method: "patch",
  path: "/user",
  tags: ["User"],
  summary: "Update the current user's preferences",
  request: {
    body: jsonContentRequired(
      updatePreferencesSchema,
      "Preference fields to update"
    ),
  },
  responses: {
    [HttpStatusCodes.OK]: userStateResponse,
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "User not found"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      errorObjectSchema,
      "Stub tables missing"
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updatePreferencesSchema),
      "Validation failed"
    ),
  },
});

const getOnboardingRoute = createRoute({
  method: "get",
  path: "/onboarding",
  tags: ["Onboarding"],
  summary: "Get onboarding state",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        availablePlatforms: z.array(z.unknown()),
        emailPreferences: z.unknown(),
        pricingPlans: z.array(z.unknown()),
        selectedPlatforms: z.array(z.unknown()),
        subscription: z.unknown(),
        user: z.unknown(),
        verificationProfile: z.unknown().optional(),
      }),
      "Onboarding state"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "User not found"
    ),
  },
});

const postOnboardingRoute = createRoute({
  method: "post",
  path: "/onboarding",
  tags: ["Onboarding"],
  summary: "Complete onboarding or start plan checkout",
  description:
    "With `planTier` in the body, starts a Polar checkout. Otherwise applies the onboarding setup payload.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.unknown(),
      "Checkout session or applied onboarding setup"
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      errorDetailsObjectSchema,
      "Invalid request"
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      errorObjectSchema,
      "User not found"
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      errorObjectSchema,
      "Billing not configured"
    ),
  },
});

const userSelect = {
  createdAt: users.createdAt,
  currencyCode: users.currencyCode,
  email: users.email,
  id: users.id,
  isOnboarded: users.isOnboarded,
  locationText: users.locationText,
  name: users.name,
  onboardedAt: users.onboardedAt,
  role: users.role,
  timezone: users.timezone,
  weekStartsOn: users.weekStartsOn,
};

const verificationProfileFromStubProfile = (profile: {
  verificationProfile: { address: string; legalName: string; phone: string };
}) => ({
  address: profile.verificationProfile.address,
  legalName: profile.verificationProfile.legalName,
  phone: profile.verificationProfile.phone,
});

const planSlug = (plan: OnboardingPlanInput) => {
  if (!plan.billingInterval) {
    return null;
  }

  return toCheckoutSlug({
    billingInterval: plan.billingInterval,
    planTier: plan.planTier,
  });
};

export const userRoutes = new OpenAPIHono({ defaultHook })
  .openapi(getUserRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const [user, platformState, emailPreferences] = await Promise.all([
      db
        .select(userSelect)
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getUserPlatformState(session.userId),
      getOrCreateEmailPreferences(session.userId),
    ]);
    if (!user) {
      return c.json({ error: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    let verificationProfile:
      | {
          address: string;
          legalName: string;
          phone: string;
        }
      | undefined;

    try {
      const profile = await getOrCreateStubProfile(session.userId);
      verificationProfile = verificationProfileFromStubProfile(profile);
    } catch (error) {
      if (!isStubTablesMissingError(error)) {
        throw error;
      }

      logger.warn({ error }, "stub_profile_unavailable_for_user_get");
    }

    return c.json(
      {
        availablePlatforms: platformState.availablePlatforms,
        emailPreferences,
        selectedPlatforms: platformState.selectedPlatforms,
        user,
        verificationProfile,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(patchUserRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);
    const validatedData = c.req.valid("json");

    const updateFields: {
      timezone?: string;
      updatedAt: Date;
      weekStartsOn?: "monday" | "sunday";
    } = {
      updatedAt: new Date(),
    };

    if (validatedData.timezone) {
      updateFields.timezone = validatedData.timezone;
    }

    if (validatedData.weekStartsOn) {
      updateFields.weekStartsOn = validatedData.weekStartsOn;
    }

    const platformState = validatedData.platformSelections
      ? await syncUserPlatformSelections(
          session.userId,
          validatedData.platformSelections
        )
      : await getUserPlatformState(session.userId);

    let verificationProfile:
      | {
          address: string;
          legalName: string;
          phone: string;
        }
      | undefined;
    let emailPreferences = await getOrCreateEmailPreferences(session.userId);

    if (validatedData.verificationProfile) {
      try {
        const profile = await updateStubProfileForUser({
          patch: {
            verificationProfile: {
              address: validatedData.verificationProfile.address,
              legalName: validatedData.verificationProfile.legalName,
              phone: validatedData.verificationProfile.phone,
            },
          },
          userId: session.userId,
        });

        verificationProfile = verificationProfileFromStubProfile(profile);
      } catch (error) {
        if (!isStubTablesMissingError(error)) {
          throw error;
        }

        return c.json(
          { error: STUB_TABLES_MISSING_MESSAGE },
          HttpStatusCodes.SERVICE_UNAVAILABLE
        );
      }
    } else {
      try {
        const profile = await getOrCreateStubProfile(session.userId);
        verificationProfile = verificationProfileFromStubProfile(profile);
      } catch (error) {
        if (!isStubTablesMissingError(error)) {
          throw error;
        }
      }
    }

    if (validatedData.emailPreferences) {
      emailPreferences = await updateEmailPreferencesForUser({
        patch: validatedData.emailPreferences,
        userId: session.userId,
      });
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, session.userId))
      .returning(userSelect);

    if (!updatedUser) {
      return c.json({ error: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    return c.json(
      {
        availablePlatforms: platformState.availablePlatforms,
        emailPreferences,
        selectedPlatforms: platformState.selectedPlatforms,
        user: updatedUser,
        verificationProfile,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(getOnboardingRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const [user, subscription, platformState, pricingPlans, emailPreferences] =
      await Promise.all([
        db
          .select({
            email: users.email,
            id: users.id,
            isOnboarded: users.isOnboarded,
            locationText: users.locationText,
            name: users.name,
            onboardedAt: users.onboardedAt,
            timezone: users.timezone,
            weekStartsOn: users.weekStartsOn,
          })
          .from(users)
          .where(eq(users.id, session.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db
          .select({
            billingInterval: subscriptions.billingInterval,
            planTier: subscriptions.planTier,
            status: subscriptions.status,
          })
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        getUserPlatformState(session.userId),
        listPricingPlans({ activeOnly: true }),
        getOrCreateEmailPreferences(session.userId),
      ]);

    if (!user) {
      return c.json({ error: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    let verificationProfile:
      | {
          address: string;
          legalName: string;
          phone: string;
        }
      | undefined;
    try {
      const profile = await getOrCreateStubProfile(session.userId);
      verificationProfile = verificationProfileFromStubProfile(profile);
    } catch (error) {
      if (!isStubTablesMissingError(error)) {
        throw error;
      }

      logger.warn({ error }, "stub_profile_unavailable_during_onboarding");
    }

    return c.json(
      {
        availablePlatforms: platformState.availablePlatforms,
        emailPreferences,
        pricingPlans,
        selectedPlatforms: platformState.selectedPlatforms,
        subscription: subscription || {
          billingInterval: null,
          planTier: "free",
          status: "free",
        },
        user,
        verificationProfile,
      },
      HttpStatusCodes.OK
    );
  })
  .openapi(postOnboardingRoute, async (c) => {
    const session = await requireSession(c.req.raw.headers);

    const body = (await c.req.raw.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    try {
      if (body.planTier) {
        const planChoice = onboardingPlanSchema.parse(body);
        const activePlan = await getPricingPlanBySelection({
          billingInterval: planChoice.billingInterval || "month",
          planTier: planChoice.planTier,
        });

        if (!activePlan || !activePlan.isActive) {
          return c.json(
            { error: "Selected plan is currently unavailable" },
            HttpStatusCodes.BAD_REQUEST
          );
        }

        const slug = planSlug(planChoice);
        if (!slug) {
          return c.json(
            { error: "Invalid plan selection" },
            HttpStatusCodes.BAD_REQUEST
          );
        }

        if (!(await hasPolarCheckoutSlug(slug))) {
          return c.json(
            {
              error:
                "Billing is not configured for this plan. Set a valid Polar product UUID in environment variables or sync your plan catalog from admin pricing.",
            },
            HttpStatusCodes.SERVICE_UNAVAILABLE
          );
        }

        const now = new Date();
        const [existingSubscription] = await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.userId))
          .limit(1);

        const nextValues = {
          billingInterval: planChoice.billingInterval || "month",
          planTier: planChoice.planTier,
          status: "pending_checkout",
          updatedAt: now,
        };

        await (existingSubscription
          ? db
              .update(subscriptions)
              .set(nextValues)
              .where(eq(subscriptions.id, existingSubscription.id))
          : db.insert(subscriptions).values({
              ...nextValues,
              userId: session.userId,
            }));

        const auth = await getAuth();
        const checkoutResponse = await auth.api
          .checkout({
            body: {
              returnUrl: `${siteUrl}/onboarding`,
              slug,
              successUrl: "/onboarding?checkout=success",
            },
            headers: c.req.raw.headers,
          })
          .catch((error: unknown) => {
            if (!isPolarMissingCheckoutProductError(error)) {
              throw error;
            }

            logger.warn(
              {
                error,
                polarServer: getPolarServer(),
                slug,
                userId: session.userId,
              },
              "polar_checkout_product_missing"
            );

            return null;
          });

        if (!checkoutResponse) {
          return c.json(
            {
              code: "billing_configuration_unavailable",
              error: `Billing is temporarily unavailable while GigStax repairs the Polar ${getPolarServer()} catalog for this plan. Please try again shortly.`,
            },
            HttpStatusCodes.SERVICE_UNAVAILABLE
          );
        }

        return c.json(
          {
            checkoutUrl: checkoutResponse.url,
            completed: false,
            redirect: checkoutResponse.redirect,
          },
          HttpStatusCodes.OK
        );
      }

      const setup = onboardingSetupSchema.parse(body);
      const platformState = await syncUserPlatformSelections(
        session.userId,
        setup.platformSelections
      );
      const nextLocationText =
        setup.locationText ||
        deriveTripSearchContextLabel({
          profileAddress: setup.verificationProfile.address,
        }) ||
        null;

      const [updatedUser] = await db
        .update(users)
        .set({
          locationText: nextLocationText,
          onboardingSetupCompletedAt: new Date(),
          timezone: setup.timezone || session.timezone,
          updatedAt: new Date(),
          weekStartsOn: setup.weekStartsOn,
        })
        .where(eq(users.id, session.userId))
        .returning({
          email: users.email,
          id: users.id,
          isOnboarded: users.isOnboarded,
          locationText: users.locationText,
          name: users.name,
          onboardedAt: users.onboardedAt,
          timezone: users.timezone,
          weekStartsOn: users.weekStartsOn,
        });

      if (!updatedUser) {
        return c.json({ error: "User not found" }, HttpStatusCodes.NOT_FOUND);
      }

      try {
        await Promise.all([
          updateStubProfileForUser({
            patch: {
              verificationProfile: {
                address: setup.verificationProfile.address,
                legalName: setup.verificationProfile.legalName,
                phone: setup.verificationProfile.phone,
              },
            },
            userId: session.userId,
          }),
          updateEmailPreferencesForUser({
            patch: {
              cadenceSummaryEnabled:
                setup.emailPreferences?.cadenceSummaryEnabled ?? false,
              goalCelebrationEnabled:
                setup.emailPreferences?.goalCelebrationEnabled ?? true,
              inactivityNudgeEnabled:
                setup.emailPreferences?.inactivityNudgeEnabled ?? true,
              onboardingOfferEnabled:
                setup.emailPreferences?.onboardingOfferEnabled ?? true,
              onboardingTipsEnabled:
                setup.emailPreferences?.onboardingTipsEnabled ?? true,
              quarterlyTaxReminderEnabled:
                setup.emailPreferences?.quarterlyTaxReminderEnabled ?? true,
              tipReminderEnabled:
                setup.emailPreferences?.tipReminderEnabled ?? true,
              tripVerificationReminderEnabled:
                setup.emailPreferences?.tripVerificationReminderEnabled ??
                false,
            },
            userId: session.userId,
          }),
        ]);
      } catch (error) {
        if (!isStubTablesMissingError(error)) {
          throw error;
        }

        logger.warn({ error }, "stub_profile_update_skipped_on_onboarding");
      }

      return c.json(
        {
          availablePlatforms: platformState.availablePlatforms,
          completed: false,
          emailPreferences: {
            cadenceSummaryEnabled:
              setup.emailPreferences?.cadenceSummaryEnabled ?? false,
            goalCelebrationEnabled:
              setup.emailPreferences?.goalCelebrationEnabled ?? true,
            inactivityNudgeEnabled:
              setup.emailPreferences?.inactivityNudgeEnabled ?? true,
            onboardingOfferEnabled:
              setup.emailPreferences?.onboardingOfferEnabled ?? true,
            onboardingTipsEnabled:
              setup.emailPreferences?.onboardingTipsEnabled ?? true,
            quarterlyTaxReminderEnabled:
              setup.emailPreferences?.quarterlyTaxReminderEnabled ?? true,
            tipReminderEnabled:
              setup.emailPreferences?.tipReminderEnabled ?? true,
            tripVerificationReminderEnabled:
              setup.emailPreferences?.tripVerificationReminderEnabled ?? false,
          },
          selectedPlatforms: platformState.selectedPlatforms,
          user: updatedUser,
          verificationProfile: setup.verificationProfile,
        },
        HttpStatusCodes.OK
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          { details: error, error: "Validation failed" },
          HttpStatusCodes.BAD_REQUEST
        );
      }

      logger.error({ error }, "complete_onboarding_failed");
      throw error;
    }
  });

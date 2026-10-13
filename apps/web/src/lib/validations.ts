import { z } from "zod";

import { hasMaxFractionDigits } from "@/lib/numeric-policy";
import {
  STUB_CADENCE_VALUES,
  STUB_FIELD_KEYS,
  STUB_MANDATORY_FIELD_KEYS,
} from "@/lib/stubs/types";

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const weekStartsOnSchema = z.enum(["sunday", "monday"]);

export const PHONE_ALLOWED_INPUT_REGEX = /^[0-9+\-().\s]*$/u;

export function sanitizePhoneInput(value: string) {
  return value.replaceAll(/[^0-9+\-().\s]/gu, "");
}

export function normalizePhoneDigits(value: string) {
  return value.replaceAll(/\D/gu, "");
}

export const legalNameSchema = z
  .string()
  .trim()
  .min(2, "Legal name must be at least 2 characters")
  .max(120, "Legal name must be 120 characters or less")
  .regex(
    /^(?=.*[a-z])[a-z ,.'-]+$/iu,
    "Use letters plus spaces or common name punctuation"
  );

export const locationTextSchema = z
  .string()
  .trim()
  .max(120, "Location must be 120 characters or less")
  .refine(
    (value) =>
      value.length === 0 || /^(?=.*[a-z])[a-z0-9 ,.'-]+$/iu.test(value),
    "Use a city and state, like Searcy, AR"
  );

export const addressSchema = z
  .string()
  .trim()
  .min(5, "Enter a full street address")
  .max(200, "Address must be 200 characters or less");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(40, "Phone number must be 40 characters or less")
  .regex(
    PHONE_ALLOWED_INPUT_REGEX,
    "Use digits, spaces, parentheses, periods, or dashes"
  )
  .refine((value) => {
    const digits = normalizePhoneDigits(value);
    return digits.length >= 7 && digits.length <= 15;
  }, "Enter a valid phone number");

export const verificationProfileSchema = z.object({
  address: addressSchema,
  legalName: legalNameSchema,
  phone: phoneSchema,
});

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/u, "Color must be a valid hex value");

export const onboardingPlatformSelectionSchema = z
  .object({
    colorHex: hexColorSchema.default("#22c55e"),
    displayName: z.string().trim().min(2).max(60).optional(),
    slug: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.slug && !value.displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a platform slug or display name",
        path: ["displayName"],
      });
    }
  });

export const onboardingSetupSchema = z.object({
  emailPreferences: z
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
    .optional(),
  locationText: locationTextSchema.optional(),
  platformSelections: z
    .array(onboardingPlatformSelectionSchema)
    .min(1, "Select at least one platform"),
  timezone: z.string().trim().min(1).optional(),
  verificationProfile: verificationProfileSchema,
  weekStartsOn: weekStartsOnSchema,
});

export const planTierSchema = z.enum(["starter", "driver", "pro_driver"]);
export const billingIntervalSchema = z.enum(["month", "year"]);

export const onboardingPlanSchema = z
  .object({
    billingInterval: billingIntervalSchema.optional(),
    planTier: planTierSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.billingInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "billingInterval is required for paid plans",
        path: ["billingInterval"],
      });
    }
  });

export const updatePreferencesSchema = z
  .object({
    emailPreferences: z
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
      .optional(),
    platformSelections: z
      .array(onboardingPlatformSelectionSchema)
      .min(1, "Select at least one platform")
      .optional(),
    timezone: z.string().min(1).optional(),
    verificationProfile: verificationProfileSchema.partial().optional(),
    weekStartsOn: weekStartsOnSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.timezone &&
      !value.weekStartsOn &&
      !value.emailPreferences &&
      !value.platformSelections &&
      !value.verificationProfile
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one settings field",
      });
    }
  });

export const entryStatusSchema = z.enum([
  "offered",
  "accepted",
  "completed",
  "cancelled",
]);
export const entryListSortSchema = z.enum([
  "date-desc",
  "date-asc",
  "amount-desc",
  "amount-asc",
]);
export const entrySourceSchema = z.enum(["manual", "image_ai"]);
export const tipStatusSchema = z.enum(["none", "pending", "final"]);
export const expenseCategorySchema = z.enum([
  "fuel",
  "tolls",
  "parking",
  "maintenance",
  "supplies",
  "phone",
  "other",
]);

const finiteNumberSchema = z.number().finite();

const moneyScaleMessage = "Must have at most 2 decimal places";
const milesScaleMessage = "Miles must have at most 2 decimal places";

const nonNegativeMoneySchema = finiteNumberSchema
  .min(0)
  .refine((value) => hasMaxFractionDigits(value, 2), {
    message: moneyScaleMessage,
  });

const positiveMoneySchema = finiteNumberSchema
  .positive()
  .refine((value) => hasMaxFractionDigits(value, 2), {
    message: moneyScaleMessage,
  });

const nonNegativeMilesSchema = finiteNumberSchema
  .min(0)
  .refine((value) => hasMaxFractionDigits(value, 2), {
    message: milesScaleMessage,
  });

export const createEntrySchema = z
  .object({
    bonusAmount: nonNegativeMoneySchema.optional(),
    completedAt: z.string().optional(),
    currencyCode: z.string().length(3).optional(),
    distanceMiles: nonNegativeMilesSchema.optional(),
    durationSeconds: finiteNumberSchema.int().min(0).optional(),
    earningsExtras: z.record(z.string(), z.any()).optional(),
    externalRef: z.string().optional(),
    extractionId: finiteNumberSchema.int().positive().optional(),
    fareAmount: nonNegativeMoneySchema,
    notes: z.string().optional(),
    occurredAt: z.string().min(1),
    platformMetadata: z.record(z.string(), z.any()).optional(),
    platformSlug: z.string().min(1),
    source: entrySourceSchema,
    status: entryStatusSchema,
    stopsCount: finiteNumberSchema.int().min(0).optional(),
    tipEstimatedAmount: nonNegativeMoneySchema.optional(),
    tipFinalAmount: nonNegativeMoneySchema.optional(),
    tipStatus: tipStatusSchema.default("none"),
    totalEstimatedAmount: nonNegativeMoneySchema.optional(),
    totalFinalAmount: nonNegativeMoneySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.tipStatus === "pending" &&
      value.tipEstimatedAmount === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tipEstimatedAmount is required when tipStatus is pending",
        path: ["tipEstimatedAmount"],
      });
    }

    if (value.tipStatus === "final" && value.tipFinalAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tipFinalAmount is required when tipStatus is final",
        path: ["tipFinalAmount"],
      });
    }
  });

export const patchEntrySchema = z
  .object({
    bonusAmount: nonNegativeMoneySchema.optional(),
    completedAt: z.string().nullable().optional(),
    distanceMiles: nonNegativeMilesSchema.nullable().optional(),
    durationSeconds: finiteNumberSchema.int().min(0).nullable().optional(),
    earningsExtras: z.record(z.string(), z.any()).optional(),
    fareAmount: nonNegativeMoneySchema.optional(),
    notes: z.string().nullable().optional(),
    occurredAt: z.string().optional(),
    platformMetadata: z.record(z.string(), z.any()).optional(),
    status: entryStatusSchema.optional(),
    stopsCount: finiteNumberSchema.int().min(0).nullable().optional(),
    tipEstimatedAmount: nonNegativeMoneySchema.nullable().optional(),
    tipFinalAmount: nonNegativeMoneySchema.nullable().optional(),
    tipStatus: tipStatusSchema.optional(),
    totalEstimatedAmount: nonNegativeMoneySchema.nullable().optional(),
    totalFinalAmount: nonNegativeMoneySchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.tipStatus === "pending" &&
      value.tipEstimatedAmount === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "tipEstimatedAmount must be supplied when setting tipStatus to pending",
        path: ["tipEstimatedAmount"],
      });
    }

    if (value.tipStatus === "final" && value.tipFinalAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "tipFinalAmount must be supplied when setting tipStatus to final",
        path: ["tipFinalAmount"],
      });
    }
  });

export const createExpenseSchema = z.object({
  amount: positiveMoneySchema,
  category: expenseCategorySchema,
  currencyCode: z.string().length(3).optional(),
  description: z.string().optional(),
  entryId: finiteNumberSchema.int().positive().optional(),
  incurredAt: z.string().min(1),
  merchant: z.string().optional(),
  notes: z.string().optional(),
  platformSlug: z.string().optional(),
});

export const tripVerificationStatusSchema = z.enum(["needs_input", "verified"]);

const latitudeSchema = finiteNumberSchema.min(-90).max(90);
const longitudeSchema = finiteNumberSchema.min(-180).max(180);
const tripAddressSchema = z.string().trim().min(3).max(240);

export const tripLocationSchema = z.object({
  address: tripAddressSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const tripRouteGeometrySchema = z.object({
  coordinates: z.array(z.tuple([longitudeSchema, latitudeSchema])).min(2),
  type: z.literal("LineString"),
});

export const tripRouteLegSchema = z.object({
  distanceMiles: nonNegativeMilesSchema,
  durationSeconds: finiteNumberSchema.int().min(0),
  geometry: tripRouteGeometrySchema.nullable(),
});

type TripLocation = z.infer<typeof tripLocationSchema>;
type TripRouteLeg = z.infer<typeof tripRouteLegSchema>;
interface TripRouteValidationInput {
  intermediateStops?: TripLocation[];
  pickupToDropoffLegs?: TripRouteLeg[];
  prePickupOrigin?: TripLocation;
  prePickupToPickup?: TripRouteLeg;
}

const addRouteDataIssue = (
  ctx: z.RefinementCtx,
  path: string[],
  message: string
) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
};

const validatePrePickupRouteData = (
  value: TripRouteValidationInput,
  ctx: z.RefinementCtx
) => {
  if (value.prePickupOrigin && !value.prePickupToPickup) {
    addRouteDataIssue(
      ctx,
      ["prePickupToPickup"],
      "A route leg is required when a starting point before pickup is provided."
    );
  }

  if (!value.prePickupOrigin && value.prePickupToPickup) {
    addRouteDataIssue(
      ctx,
      ["prePickupOrigin"],
      "A starting point is required when a pre-pickup route leg is provided."
    );
  }
};

const validateIntermediateStopRouteData = (
  value: TripRouteValidationInput,
  ctx: z.RefinementCtx
) => {
  const stopCount = value.intermediateStops?.length ?? 0;
  if (stopCount === 0) {
    return;
  }

  if (!value.pickupToDropoffLegs) {
    addRouteDataIssue(
      ctx,
      ["pickupToDropoffLegs"],
      "Detailed route legs are required when intermediate stops are provided."
    );
    return;
  }

  if (value.pickupToDropoffLegs.length !== stopCount + 1) {
    addRouteDataIssue(
      ctx,
      ["pickupToDropoffLegs"],
      "Detailed route legs must line up with the number of intermediate stops."
    );
  }
};

const validateRouteData = (
  value: TripRouteValidationInput,
  ctx: z.RefinementCtx
) => {
  validatePrePickupRouteData(value, ctx);
  validateIntermediateStopRouteData(value, ctx);
};

export const upsertTripVerificationSchema = z.object({
  dropoff: tripLocationSchema,
  extractedDropoffText: tripAddressSchema.nullable().optional(),
  extractedPickupText: tripAddressSchema.nullable().optional(),
  pickup: tripLocationSchema,
  returnLocation: tripLocationSchema,
  routeData: z
    .object({
      dropoffToReturn: tripRouteLegSchema,
      intermediateStops: z.array(tripLocationSchema).max(8).optional(),
      pickupToDropoff: tripRouteLegSchema,
      pickupToDropoffLegs: z.array(tripRouteLegSchema).min(1).max(9).optional(),
      prePickupOrigin: tripLocationSchema.optional(),
      prePickupToPickup: tripRouteLegSchema.optional(),
    })
    .superRefine(validateRouteData),
});

export const stubCadenceSchema = z.enum(STUB_CADENCE_VALUES);
export const stubFieldKeySchema = z.enum(STUB_FIELD_KEYS);
export const stubFieldKeysSchema = z.array(stubFieldKeySchema).min(1);

export const stubGenerateSchema = z.object({
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  cadence: stubCadenceSchema,
  fieldKeys: stubFieldKeysSchema.optional(),
});

export const stubPreviewSchema = stubGenerateSchema;

const optionalProfileString = z.string().trim().max(200).optional();

export const stubProfilePatchSchema = z
  .object({
    autoGenerateEnabled: z.boolean().optional(),
    defaultFieldKeys: stubFieldKeysSchema.optional(),
    primaryCadence: stubCadenceSchema.optional(),
    verificationProfile: z
      .object({
        address: optionalProfileString,
        legalName: legalNameSchema.optional(),
        phone: phoneSchema.optional(),
      })
      .partial()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.autoGenerateEnabled &&
      !value.defaultFieldKeys &&
      !value.primaryCadence &&
      !value.verificationProfile
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one stub profile field",
      });
    }

    if (value.defaultFieldKeys) {
      for (const key of STUB_MANDATORY_FIELD_KEYS) {
        if (!value.defaultFieldKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `defaultFieldKeys must include mandatory field: ${key}`,
            path: ["defaultFieldKeys"],
          });
        }
      }
    }
  });

export const createGoalSchema = z.object({
  periodStartDate: z.string().optional(),
  targetAmount: positiveMoneySchema,
  timezone: z.string().optional(),
});

// Legacy payload compatibility
export const deliverySchema = z.object({
  deliveredAt: z.string().optional(),
  deliveryFee: positiveMoneySchema,
  estimatedTotal: positiveMoneySchema,
  miles: finiteNumberSchema
    .positive("Miles must be positive")
    .refine((value) => hasMaxFractionDigits(value, 2), {
      message: milesScaleMessage,
    }),
  notes: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  tip: nonNegativeMoneySchema,
});

export const goalSchema = z.object({
  startDate: z.string().optional(),
  weeklyTarget: positiveMoneySchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EntryCreateInput = z.infer<typeof createEntrySchema>;
export type EntryPatchInput = z.infer<typeof patchEntrySchema>;
export type ExpenseCreateInput = z.infer<typeof createExpenseSchema>;
export type GoalCreateInput = z.infer<typeof createGoalSchema>;
export type DeliveryInput = z.infer<typeof deliverySchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type OnboardingSetupInput = z.infer<typeof onboardingSetupSchema>;
export type OnboardingPlatformSelectionInput = z.infer<
  typeof onboardingPlatformSelectionSchema
>;
export type OnboardingPlanInput = z.infer<typeof onboardingPlanSchema>;
export type UpsertTripVerificationInput = z.infer<
  typeof upsertTripVerificationSchema
>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type WeekStartsOnInput = z.infer<typeof weekStartsOnSchema>;

// Better-auth tables are owned by schema/auth.ts (scaffold)

import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Inlined from gigstax lib/services/extraction.ts + lib/trip-verification.ts
// (kept local so the db package has no app dependencies).
export interface NormalizedExtractionPayload {
  bonusAmount: number | null;
  dropoffAddress: string | null;
  distanceMiles: number | null;
  durationSeconds: number | null;
  entryType: "earning" | "expense";
  expenseAmount: number | null;
  expenseCategory: string | null;
  fareAmount: number | null;
  notes: string | null;
  platformSlug: string | null;
  pickupAddress: string | null;
  stopsCount: number | null;
  tipEstimatedAmount: number | null;
  tipFinalAmount: number | null;
  tipStatus: "none" | "pending" | "final";
  totalEstimatedAmount: number | null;
  totalFinalAmount: number | null;
}

export interface TripRouteGeometry {
  coordinates: [number, number][];
  type: "LineString";
}

export interface TripLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export interface TripRouteLeg {
  distanceMiles: number;
  durationSeconds: number;
  geometry: TripRouteGeometry | null;
}

export interface TripRouteData {
  dropoffToReturn: TripRouteLeg;
  intermediateStops?: TripLocation[];
  prePickupOrigin?: TripLocation;
  prePickupToPickup?: TripRouteLeg;
  pickupToDropoff: TripRouteLeg;
  pickupToDropoffLegs?: TripRouteLeg[];
}

export const entryStatusEnum = pgEnum("entry_status", [
  "offered",
  "accepted",
  "completed",
  "cancelled",
]);

export const entrySourceEnum = pgEnum("entry_source", ["manual", "image_ai"]);

export const tipStatusEnum = pgEnum("tip_status", ["none", "pending", "final"]);

export const mediaKindEnum = pgEnum("media_kind", [
  "entry_screenshot",
  "expense_receipt",
]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const tripVerificationStatusEnum = pgEnum("trip_verification_status", [
  "needs_input",
  "verified",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "fuel",
  "tolls",
  "parking",
  "maintenance",
  "supplies",
  "phone",
  "other",
]);

export const goalMetricEnum = pgEnum("goal_metric", ["earnings"]);
export const goalPeriodEnum = pgEnum("goal_period", ["week"]);
export const goalBasisEnum = pgEnum("goal_basis", ["gross"]);
export const goalScopeEnum = pgEnum("goal_scope", ["all_platforms"]);
export const weekStartsOnEnum = pgEnum("week_starts_on", ["sunday", "monday"]);
export const stubCadenceEnum = pgEnum("stub_cadence", [
  "weekly",
  "biweekly",
  "monthly",
]);
export const stubStatusEnum = pgEnum("stub_status", ["draft", "locked"]);
export const stubSourceEnum = pgEnum("stub_source", ["manual", "autogen"]);

export const userRoleEnum = pgEnum("user_role", ["driver", "admin"]);

export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "starter",
  "driver",
  "pro_driver",
]);
export const billingIntervalEnum = pgEnum("billing_interval", [
  "month",
  "year",
]);
export const meterKeyEnum = pgEnum("meter_key", [
  "ai_extract_credits",
  "bulk_upload_batches",
]);

export const aiUsageStatusEnum = pgEnum("ai_usage_status", [
  "success",
  "failed",
  "blocked",
]);

export const emailEventTypeEnum = pgEnum("email_event_type", [
  "welcome",
  "subscription_status",
  "reset_password",
  "cadence_summary",
  "tip_verification_reminder",
  "trip_verification_reminder",
  "inactivity_nudge",
  "abandoned_onboarding_offer",
  "onboarding_tips",
  "weekly_goal_celebration",
  "quarterly_tax_reminder",
]);

export const emailEventStatusEnum = pgEnum("email_event_status", [
  "pending",
  "sent",
  "failed",
  "skipped",
]);

export const emailSuppressionReasonEnum = pgEnum("email_suppression_reason", [
  "hard_bounce",
  "complaint",
  "unsubscribe",
  "manual",
]);

export const users = pgTable(
  "users",
  {
    authUserId: text("auth_user_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    email: text("email").notNull().unique(),
    id: serial("id").primaryKey(),
    isOnboarded: boolean("is_onboarded").notNull().default(false),
    locationText: text("location_text"),
    name: text("name").notNull(),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    onboardingSetupCompletedAt: timestamp("onboarding_setup_completed_at", {
      withTimezone: true,
    }),
    role: userRoleEnum("role").notNull().default("driver"),
    timezone: text("timezone").notNull().default("UTC"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    weekStartsOn: weekStartsOnEnum("week_starts_on")
      .notNull()
      .default("sunday"),
  },
  (table) => [
    index("users_is_onboarded_idx").on(table.isOnboarded),
    index("users_onboarded_at_idx").on(table.onboardedAt),
    index("users_onboarding_setup_completed_at_idx").on(
      table.onboardingSetupCompletedAt
    ),
    index("users_role_idx").on(table.role),
  ]
);

export const platforms = pgTable(
  "platforms",
  {
    colorHex: text("color_hex").notNull().default("#22c55e"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    id: serial("id").primaryKey(),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(true),
    slug: text("slug").notNull().unique(),
  },
  (table) => [
    index("platforms_created_by_user_id_idx").on(table.createdByUserId),
    index("platforms_is_active_idx").on(table.isActive),
  ]
);

export const userPlatforms = pgTable(
  "user_platforms",
  {
    colorHex: text("color_hex").notNull().default("#22c55e"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    isActive: boolean("is_active").notNull().default(true),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("user_platforms_user_active_updated_at_idx").on(
      table.userId,
      table.isActive,
      table.updatedAt.desc()
    ),
    uniqueIndex("user_platforms_user_platform_unique").on(
      table.userId,
      table.platformId
    ),
  ]
);

export const earningsEntries = pgTable(
  "earnings_entries",
  {
    bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    distanceMiles: numeric("distance_miles", { precision: 8, scale: 2 }),
    durationSeconds: integer("duration_seconds"),
    earningsExtras: jsonb("earnings_extras").notNull().default({}),
    externalRef: text("external_ref"),
    fareAmount: numeric("fare_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    id: serial("id").primaryKey(),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
    platformMetadata: jsonb("platform_metadata").notNull().default({}),
    source: entrySourceEnum("source").notNull(),
    status: entryStatusEnum("status").notNull(),
    stopsCount: integer("stops_count"),
    tipEstimatedAmount: numeric("tip_estimated_amount", {
      precision: 10,
      scale: 2,
    }),
    tipFinalAmount: numeric("tip_final_amount", { precision: 10, scale: 2 }),
    tipStatus: tipStatusEnum("tip_status").notNull().default("none"),
    totalEstimatedAmount: numeric("total_estimated_amount", {
      precision: 10,
      scale: 2,
    }),
    totalFinalAmount: numeric("total_final_amount", {
      precision: 10,
      scale: 2,
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("earnings_entries_external_ref_idx").on(table.externalRef),
    index("earnings_entries_user_occurred_at_idx").on(
      table.userId,
      table.occurredAt.desc()
    ),
    index("earnings_entries_user_platform_occurred_at_idx").on(
      table.userId,
      table.platformId,
      table.occurredAt.desc()
    ),
    index("earnings_entries_user_status_occurred_at_idx").on(
      table.userId,
      table.status,
      table.occurredAt.desc()
    ),
  ]
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    byteSize: integer("byte_size"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    kind: mediaKindEnum("kind").notNull(),
    mimeType: text("mime_type"),
    sha256: text("sha256"),
    storageKey: text("storage_key"),
    storageProvider: text("storage_provider").notNull().default("vercel_blob"),
    storageUrl: text("storage_url").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("media_assets_kind_created_at_idx").on(
      table.kind,
      table.createdAt.desc()
    ),
    index("media_assets_sha256_idx").on(table.sha256),
    uniqueIndex("media_assets_storage_key_unique").on(table.storageKey),
    index("media_assets_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
  ]
);

export const entryMedia = pgTable(
  "entry_media",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => earningsEntries.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("entry_media_media_id_idx").on(table.mediaId),
    primaryKey({ columns: [table.entryId, table.mediaId] }),
  ]
);

export const aiExtractions = pgTable(
  "ai_extractions",
  {
    applied: boolean("applied").notNull().default(false),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    entryId: integer("entry_id").references(() => earningsEntries.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    id: serial("id").primaryKey(),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    parsedPayload: jsonb(
      "parsed_payload"
    ).$type<NormalizedExtractionPayload | null>(),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    rawResponse: text("raw_response").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: extractionStatusEnum("status").notNull().default("pending"),
    userCorrections: jsonb("user_corrections"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workflowRunId: text("workflow_run_id"),
  },
  (table) => [
    index("ai_extractions_entry_created_at_idx").on(
      table.entryId,
      table.createdAt.desc()
    ),
    index("ai_extractions_media_id_idx").on(table.mediaId),
    index("ai_extractions_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    index("ai_extractions_user_status_created_at_idx").on(
      table.userId,
      table.status,
      table.createdAt.desc()
    ),
    index("ai_extractions_workflow_run_id_idx").on(table.workflowRunId),
  ]
);

export const entryTripVerifications = pgTable(
  "entry_trip_verifications",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dropoffAddress: text("dropoff_address"),
    dropoffLatitude: numeric("dropoff_latitude", { precision: 10, scale: 7 }),
    dropoffLongitude: numeric("dropoff_longitude", { precision: 10, scale: 7 }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => earningsEntries.id, { onDelete: "cascade" }),
    extractedDropoffText: text("extracted_dropoff_text"),
    extractedPickupText: text("extracted_pickup_text"),
    id: serial("id").primaryKey(),
    pickupAddress: text("pickup_address"),
    pickupLatitude: numeric("pickup_latitude", { precision: 10, scale: 7 }),
    pickupLongitude: numeric("pickup_longitude", { precision: 10, scale: 7 }),
    radarDistanceMiles: numeric("radar_distance_miles", {
      precision: 8,
      scale: 2,
    }),
    radarDurationSeconds: integer("radar_duration_seconds"),
    returnAddress: text("return_address"),
    returnLatitude: numeric("return_latitude", { precision: 10, scale: 7 }),
    returnLongitude: numeric("return_longitude", { precision: 10, scale: 7 }),
    routeCalculatedAt: timestamp("route_calculated_at", { withTimezone: true }),
    routeData: jsonb("route_data").$type<TripRouteData | null>(),
    status: tripVerificationStatusEnum("status")
      .notNull()
      .default("needs_input"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("entry_trip_verifications_entry_id_unique").on(table.entryId),
    index("entry_trip_verifications_status_updated_at_idx").on(
      table.status,
      table.updatedAt.desc()
    ),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    category: expenseCategoryEnum("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    description: text("description"),
    entryId: integer("entry_id").references(() => earningsEntries.id, {
      onDelete: "set null",
    }),
    id: serial("id").primaryKey(),
    incurredAt: timestamp("incurred_at", { withTimezone: true }).notNull(),
    merchant: text("merchant"),
    notes: text("notes"),
    platformId: integer("platform_id").references(() => platforms.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("expenses_entry_id_idx").on(table.entryId),
    index("expenses_user_category_incurred_at_idx").on(
      table.userId,
      table.category,
      table.incurredAt.desc()
    ),
    index("expenses_user_incurred_at_idx").on(
      table.userId,
      table.incurredAt.desc()
    ),
  ]
);

export const expenseMedia = pgTable(
  "expense_media",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("expense_media_media_id_idx").on(table.mediaId),
    primaryKey({ columns: [table.expenseId, table.mediaId] }),
  ]
);

export const goals = pgTable(
  "goals",
  {
    basis: goalBasisEnum("basis").notNull().default("gross"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    metric: goalMetricEnum("metric").notNull().default("earnings"),
    period: goalPeriodEnum("period").notNull().default("week"),
    periodEndDate: date("period_end_date").notNull(),
    periodStartDate: date("period_start_date").notNull(),
    scope: goalScopeEnum("scope").notNull().default("all_platforms"),
    targetAmount: numeric("target_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    timezone: text("timezone").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("goals_user_metric_period_basis_scope_start_unique").on(
      table.userId,
      table.metric,
      table.period,
      table.basis,
      table.scope,
      table.periodStartDate
    ),
    index("goals_user_period_start_date_idx").on(
      table.userId,
      table.periodStartDate.desc()
    ),
  ]
);

export const stubProfiles = pgTable(
  "stub_profiles",
  {
    autoGenerateEnabled: boolean("auto_generate_enabled")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    defaultFieldKeys: jsonb("default_field_keys").notNull().default([]),
    id: serial("id").primaryKey(),
    primaryCadence: stubCadenceEnum("primary_cadence")
      .notNull()
      .default("weekly"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verificationProfile: jsonb("verification_profile").notNull().default({}),
  },
  (table) => [uniqueIndex("stub_profiles_user_id_unique").on(table.userId)]
);

export const incomeStubs = pgTable(
  "income_stubs",
  {
    anchorDate: date("anchor_date").notNull(),
    cadence: stubCadenceEnum("cadence").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    fieldKeys: jsonb("field_keys").notNull().default([]),
    id: serial("id").primaryKey(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    periodEnd: date("period_end").notNull(),
    periodStart: date("period_start").notNull(),
    publicId: text("public_id").notNull(),
    revision: integer("revision").notNull().default(1),
    snapshot: jsonb("snapshot").notNull().default({}),
    source: stubSourceEnum("source").notNull().default("manual"),
    status: stubStatusEnum("status").notNull().default("draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ytdEnd: date("ytd_end").notNull(),
    ytdStart: date("ytd_start").notNull(),
  },
  (table) => [
    uniqueIndex("income_stubs_public_id_unique").on(table.publicId),
    uniqueIndex("income_stubs_user_cadence_period_revision_unique").on(
      table.userId,
      table.cadence,
      table.periodStart,
      table.periodEnd,
      table.revision
    ),
    index("income_stubs_user_period_end_idx").on(
      table.userId,
      table.periodEnd.desc()
    ),
    index("income_stubs_user_status_period_start_idx").on(
      table.userId,
      table.status,
      table.periodStart.desc()
    ),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    billingInterval: billingIntervalEnum("billing_interval"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    id: serial("id").primaryKey(),
    planTier: planTierEnum("plan_tier").notNull().default("free"),
    polarCustomerId: text("polar_customer_id"),
    polarSubscriptionId: text("polar_subscription_id"),
    status: text("status").notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("subscriptions_polar_subscription_id_unique").on(
      table.polarSubscriptionId
    ),
    index("subscriptions_status_period_end_idx").on(
      table.status,
      table.currentPeriodEnd
    ),
    uniqueIndex("subscriptions_user_id_unique").on(table.userId),
  ]
);

export const pricingPlans = pgTable(
  "pricing_plans",
  {
    aiCreditLimit: integer("ai_credit_limit"),
    billingInterval: billingIntervalEnum("billing_interval"),
    bulkBatchLimit: integer("bulk_batch_limit"),
    bulkMaxImagesPerBatch: integer("bulk_max_images_per_batch"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    description: text("description"),
    displayName: text("display_name").notNull(),
    features: jsonb("features").notNull().default([]),
    id: serial("id").primaryKey(),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    planTier: planTierEnum("plan_tier").notNull(),
    polarPriceId: text("polar_price_id"),
    polarProductId: text("polar_product_id"),
    priceCents: integer("price_cents").notNull().default(0),
    slug: text("slug").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pricing_plans_active_sort_order_idx").on(
      table.isActive,
      table.sortOrder
    ),
    uniqueIndex("pricing_plans_plan_tier_billing_interval_unique").on(
      table.planTier,
      table.billingInterval
    ),
  ]
);

export const creditPacks = pgTable(
  "credit_packs",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    credits: integer("credits").notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    description: text("description"),
    displayName: text("display_name").notNull(),
    id: serial("id").primaryKey(),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    polarPriceId: text("polar_price_id"),
    polarProductId: text("polar_product_id"),
    priceCents: integer("price_cents").notNull().default(0),
    slug: text("slug").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("credit_packs_active_sort_order_idx").on(
      table.isActive,
      table.sortOrder
    ),
  ]
);

export const userCreditBalances = pgTable(
  "user_credit_balances",
  {
    aiPackCredits: integer("ai_pack_credits").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_credit_balances_user_id_unique").on(table.userId),
  ]
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deltaCredits: integer("delta_credits").notNull(),
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    sourceId: text("source_id"),
    sourceType: text("source_type").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("credit_transactions_source_type_source_id_unique").on(
      table.sourceType,
      table.sourceId
    ),
    index("credit_transactions_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
  ]
);

export const billingMeters = pgTable(
  "billing_meters",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    displayName: text("display_name").notNull(),
    id: serial("id").primaryKey(),
    key: meterKeyEnum("key").notNull(),
    polarMeterId: text("polar_meter_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("billing_meters_key_unique").on(table.key)]
);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    completionTokens: integer("completion_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endpoint: text("endpoint").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    feature: text("feature").notNull(),
    id: serial("id").primaryKey(),
    metadata: jsonb("metadata").notNull().default({}),
    meterKey: meterKeyEnum("meter_key").notNull().default("ai_extract_credits"),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    provider: text("provider").notNull(),
    status: aiUsageStatusEnum("status").notNull(),
    totalTokens: integer("total_tokens"),
    units: integer("units").notNull().default(1),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("ai_usage_events_provider_model_created_at_idx").on(
      table.provider,
      table.model,
      table.createdAt.desc()
    ),
    index("ai_usage_events_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    index("ai_usage_events_user_meter_key_created_at_idx").on(
      table.userId,
      table.meterKey,
      table.createdAt.desc()
    ),
    index("ai_usage_events_user_status_created_at_idx").on(
      table.userId,
      table.status,
      table.createdAt.desc()
    ),
  ]
);

export const emailEvents = pgTable(
  "email_events",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
    externalEventId: text("external_event_id"),
    id: serial("id").primaryKey(),
    payload: jsonb("payload").notNull().default({}),
    providerMessageId: text("provider_message_id"),
    status: emailEventStatusEnum("status").notNull().default("pending"),
    type: emailEventTypeEnum("type").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("email_events_external_event_id_unique").on(
      table.externalEventId
    ),
    index("email_events_status_created_at_idx").on(
      table.status,
      table.createdAt.desc()
    ),
    index("email_events_user_type_created_at_idx").on(
      table.userId,
      table.type,
      table.createdAt.desc()
    ),
  ]
);

export const emailPreferences = pgTable(
  "email_preferences",
  {
    cadenceSummaryEnabled: boolean("cadence_summary_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    goalCelebrationEnabled: boolean("goal_celebration_enabled")
      .notNull()
      .default(true),
    id: serial("id").primaryKey(),
    inactivityNudgeEnabled: boolean("inactivity_nudge_enabled")
      .notNull()
      .default(true),
    onboardingOfferEnabled: boolean("onboarding_offer_enabled")
      .notNull()
      .default(true),
    onboardingTipsEnabled: boolean("onboarding_tips_enabled")
      .notNull()
      .default(true),
    quarterlyTaxReminderEnabled: boolean("quarterly_tax_reminder_enabled")
      .notNull()
      .default(true),
    tipReminderEnabled: boolean("tip_reminder_enabled").notNull().default(true),
    tripVerificationReminderEnabled: boolean(
      "trip_verification_reminder_enabled"
    )
      .notNull()
      .default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("email_preferences_user_id_unique").on(table.userId)]
);

export const onboardingOfferConfigs = pgTable(
  "onboarding_offer_configs",
  {
    active: boolean("active").notNull().default(true),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    discountId: text("discount_id").notNull(),
    id: serial("id").primaryKey(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    productId: text("product_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("onboarding_offer_configs_active_updated_at_idx").on(
      table.active,
      table.updatedAt.desc()
    ),
    uniqueIndex("onboarding_offer_configs_code_unique").on(table.code),
    uniqueIndex("onboarding_offer_configs_discount_id_unique").on(
      table.discountId
    ),
  ]
);

export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    email: text("email").notNull(),
    id: serial("id").primaryKey(),
    metadata: jsonb("metadata").notNull().default({}),
    reason: emailSuppressionReasonEnum("reason").notNull(),
    source: text("source"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_suppressions_email_unique").on(table.email),
    index("email_suppressions_reason_created_at_idx").on(
      table.reason,
      table.createdAt.desc()
    ),
  ]
);

export const emailWebhookEvents = pgTable(
  "email_webhook_events",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    eventType: text("event_type").notNull(),
    id: serial("id").primaryKey(),
    payload: jsonb("payload").notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    providerEventId: text("provider_event_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_webhook_events_event_type_created_at_idx").on(
      table.eventType,
      table.createdAt.desc()
    ),
    uniqueIndex("email_webhook_events_provider_event_id_unique").on(
      table.providerEventId
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;
export type UserPlatform = typeof userPlatforms.$inferSelect;
export type NewUserPlatform = typeof userPlatforms.$inferInsert;
export type EarningsEntry = typeof earningsEntries.$inferSelect;
export type NewEarningsEntry = typeof earningsEntries.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type StubProfile = typeof stubProfiles.$inferSelect;
export type NewStubProfile = typeof stubProfiles.$inferInsert;
export type IncomeStub = typeof incomeStubs.$inferSelect;
export type NewIncomeStub = typeof incomeStubs.$inferInsert;
export type PricingPlan = typeof pricingPlans.$inferSelect;
export type NewPricingPlan = typeof pricingPlans.$inferInsert;
export type CreditPack = typeof creditPacks.$inferSelect;
export type NewCreditPack = typeof creditPacks.$inferInsert;
export type UserCreditBalance = typeof userCreditBalances.$inferSelect;
export type NewUserCreditBalance = typeof userCreditBalances.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type BillingMeter = typeof billingMeters.$inferSelect;
export type NewBillingMeter = typeof billingMeters.$inferInsert;
export type EmailPreference = typeof emailPreferences.$inferSelect;
export type NewEmailPreference = typeof emailPreferences.$inferInsert;
export type OnboardingOfferConfig = typeof onboardingOfferConfigs.$inferSelect;
export type NewOnboardingOfferConfig =
  typeof onboardingOfferConfigs.$inferInsert;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;
export type EmailWebhookEvent = typeof emailWebhookEvents.$inferSelect;
export type NewEmailWebhookEvent = typeof emailWebhookEvents.$inferInsert;

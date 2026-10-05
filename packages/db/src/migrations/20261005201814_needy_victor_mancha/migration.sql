CREATE TYPE "ai_usage_status" AS ENUM('success', 'failed', 'blocked');--> statement-breakpoint
CREATE TYPE "billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "email_event_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "email_event_type" AS ENUM('welcome', 'subscription_status', 'reset_password', 'cadence_summary', 'tip_verification_reminder', 'trip_verification_reminder', 'inactivity_nudge', 'abandoned_onboarding_offer', 'onboarding_tips', 'weekly_goal_celebration', 'quarterly_tax_reminder');--> statement-breakpoint
CREATE TYPE "email_suppression_reason" AS ENUM('hard_bounce', 'complaint', 'unsubscribe', 'manual');--> statement-breakpoint
CREATE TYPE "entry_source" AS ENUM('manual', 'image_ai');--> statement-breakpoint
CREATE TYPE "entry_status" AS ENUM('offered', 'accepted', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "expense_category" AS ENUM('fuel', 'tolls', 'parking', 'maintenance', 'supplies', 'phone', 'other');--> statement-breakpoint
CREATE TYPE "extraction_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "goal_basis" AS ENUM('gross');--> statement-breakpoint
CREATE TYPE "goal_metric" AS ENUM('earnings');--> statement-breakpoint
CREATE TYPE "goal_period" AS ENUM('week');--> statement-breakpoint
CREATE TYPE "goal_scope" AS ENUM('all_platforms');--> statement-breakpoint
CREATE TYPE "media_kind" AS ENUM('entry_screenshot', 'expense_receipt');--> statement-breakpoint
CREATE TYPE "meter_key" AS ENUM('ai_extract_credits', 'bulk_upload_batches');--> statement-breakpoint
CREATE TYPE "plan_tier" AS ENUM('free', 'starter', 'driver', 'pro_driver');--> statement-breakpoint
CREATE TYPE "stub_cadence" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "stub_source" AS ENUM('manual', 'autogen');--> statement-breakpoint
CREATE TYPE "stub_status" AS ENUM('draft', 'locked');--> statement-breakpoint
CREATE TYPE "tip_status" AS ENUM('none', 'pending', 'final');--> statement-breakpoint
CREATE TYPE "trip_verification_status" AS ENUM('needs_input', 'verified');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('driver', 'admin');--> statement-breakpoint
CREATE TYPE "week_starts_on" AS ENUM('sunday', 'monday');--> statement-breakpoint
CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp,
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY,
	"ip_address" text,
	"token" text NOT NULL UNIQUE,
	"updated_at" timestamp NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY,
	"image" text,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_extractions" (
	"applied" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" integer,
	"error_message" text,
	"id" serial PRIMARY KEY,
	"media_id" integer NOT NULL,
	"model" text NOT NULL,
	"parsed_payload" jsonb,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"raw_response" text NOT NULL,
	"started_at" timestamp with time zone,
	"status" "extraction_status" DEFAULT 'pending'::"extraction_status" NOT NULL,
	"user_corrections" jsonb,
	"user_id" integer NOT NULL,
	"workflow_run_id" text
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"estimated_cost_usd" numeric(12,6) DEFAULT '0' NOT NULL,
	"feature" text NOT NULL,
	"id" serial PRIMARY KEY,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"meter_key" "meter_key" DEFAULT 'ai_extract_credits'::"meter_key" NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"provider" text NOT NULL,
	"status" "ai_usage_status" NOT NULL,
	"total_tokens" integer,
	"units" integer DEFAULT 1 NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_meters" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"id" serial PRIMARY KEY,
	"key" "meter_key" NOT NULL,
	"polar_meter_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credits" integer NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"description" text,
	"display_name" text NOT NULL,
	"id" serial PRIMARY KEY,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"polar_price_id" text,
	"polar_product_id" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta_credits" integer NOT NULL,
	"id" serial PRIMARY KEY,
	"kind" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"source_id" text,
	"source_type" text NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earnings_entries" (
	"bonus_amount" numeric(10,2) DEFAULT '0' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"distance_miles" numeric(8,2),
	"duration_seconds" integer,
	"earnings_extras" jsonb DEFAULT '{}' NOT NULL,
	"external_ref" text,
	"fare_amount" numeric(10,2) DEFAULT '0' NOT NULL,
	"id" serial PRIMARY KEY,
	"notes" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"platform_id" integer NOT NULL,
	"platform_metadata" jsonb DEFAULT '{}' NOT NULL,
	"source" "entry_source" NOT NULL,
	"status" "entry_status" NOT NULL,
	"stops_count" integer,
	"tip_estimated_amount" numeric(10,2),
	"tip_final_amount" numeric(10,2),
	"tip_status" "tip_status" DEFAULT 'none'::"tip_status" NOT NULL,
	"total_estimated_amount" numeric(10,2),
	"total_final_amount" numeric(10,2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"external_event_id" text,
	"id" serial PRIMARY KEY,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"provider_message_id" text,
	"status" "email_event_status" DEFAULT 'pending'::"email_event_status" NOT NULL,
	"type" "email_event_type" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"cadence_summary_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"goal_celebration_enabled" boolean DEFAULT true NOT NULL,
	"id" serial PRIMARY KEY,
	"inactivity_nudge_enabled" boolean DEFAULT true NOT NULL,
	"onboarding_offer_enabled" boolean DEFAULT true NOT NULL,
	"onboarding_tips_enabled" boolean DEFAULT true NOT NULL,
	"quarterly_tax_reminder_enabled" boolean DEFAULT true NOT NULL,
	"tip_reminder_enabled" boolean DEFAULT true NOT NULL,
	"trip_verification_reminder_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"id" serial PRIMARY KEY,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"reason" "email_suppression_reason" NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_webhook_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"id" serial PRIMARY KEY,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"processed_at" timestamp with time zone,
	"provider_event_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_media" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" integer,
	"is_primary" boolean DEFAULT true NOT NULL,
	"media_id" integer,
	CONSTRAINT "entry_media_pkey" PRIMARY KEY("entry_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "entry_trip_verifications" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dropoff_address" text,
	"dropoff_latitude" numeric(10,7),
	"dropoff_longitude" numeric(10,7),
	"entry_id" integer NOT NULL,
	"extracted_dropoff_text" text,
	"extracted_pickup_text" text,
	"id" serial PRIMARY KEY,
	"pickup_address" text,
	"pickup_latitude" numeric(10,7),
	"pickup_longitude" numeric(10,7),
	"radar_distance_miles" numeric(8,2),
	"radar_duration_seconds" integer,
	"return_address" text,
	"return_latitude" numeric(10,7),
	"return_longitude" numeric(10,7),
	"route_calculated_at" timestamp with time zone,
	"route_data" jsonb,
	"status" "trip_verification_status" DEFAULT 'needs_input'::"trip_verification_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expense_media" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expense_id" integer,
	"is_primary" boolean DEFAULT true NOT NULL,
	"media_id" integer,
	CONSTRAINT "expense_media_pkey" PRIMARY KEY("expense_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"amount" numeric(10,2) NOT NULL,
	"category" "expense_category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"description" text,
	"entry_id" integer,
	"id" serial PRIMARY KEY,
	"incurred_at" timestamp with time zone NOT NULL,
	"merchant" text,
	"notes" text,
	"platform_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"basis" "goal_basis" DEFAULT 'gross'::"goal_basis" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY,
	"metric" "goal_metric" DEFAULT 'earnings'::"goal_metric" NOT NULL,
	"period" "goal_period" DEFAULT 'week'::"goal_period" NOT NULL,
	"period_end_date" date NOT NULL,
	"period_start_date" date NOT NULL,
	"scope" "goal_scope" DEFAULT 'all_platforms'::"goal_scope" NOT NULL,
	"target_amount" numeric(10,2) NOT NULL,
	"timezone" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_stubs" (
	"anchor_date" date NOT NULL,
	"cadence" "stub_cadence" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field_keys" jsonb DEFAULT '[]' NOT NULL,
	"id" serial PRIMARY KEY,
	"locked_at" timestamp with time zone,
	"period_end" date NOT NULL,
	"period_start" date NOT NULL,
	"public_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb DEFAULT '{}' NOT NULL,
	"source" "stub_source" DEFAULT 'manual'::"stub_source" NOT NULL,
	"status" "stub_status" DEFAULT 'draft'::"stub_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"ytd_end" date NOT NULL,
	"ytd_start" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"byte_size" integer,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY,
	"kind" "media_kind" NOT NULL,
	"mime_type" text,
	"sha256" text,
	"storage_key" text,
	"storage_provider" text DEFAULT 'vercel_blob' NOT NULL,
	"storage_url" text NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_offer_configs" (
	"active" boolean DEFAULT true NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"discount_id" text NOT NULL,
	"id" serial PRIMARY KEY,
	"last_synced_at" timestamp with time zone,
	"product_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"color_hex" text DEFAULT '#22c55e' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" integer,
	"display_name" text NOT NULL,
	"id" serial PRIMARY KEY,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"slug" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "pricing_plans" (
	"ai_credit_limit" integer,
	"billing_interval" "billing_interval",
	"bulk_batch_limit" integer,
	"bulk_max_images_per_batch" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"description" text,
	"display_name" text NOT NULL,
	"features" jsonb DEFAULT '[]' NOT NULL,
	"id" serial PRIMARY KEY,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"plan_tier" "plan_tier" NOT NULL,
	"polar_price_id" text,
	"polar_product_id" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stub_profiles" (
	"auto_generate_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_field_keys" jsonb DEFAULT '[]' NOT NULL,
	"id" serial PRIMARY KEY,
	"primary_cadence" "stub_cadence" DEFAULT 'weekly'::"stub_cadence" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"verification_profile" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"billing_interval" "billing_interval",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"id" serial PRIMARY KEY,
	"plan_tier" "plan_tier" DEFAULT 'free'::"plan_tier" NOT NULL,
	"polar_customer_id" text,
	"polar_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credit_balances" (
	"ai_pack_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_platforms" (
	"color_hex" text DEFAULT '#22c55e' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY,
	"is_active" boolean DEFAULT true NOT NULL,
	"platform_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"auth_user_id" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" char(3) DEFAULT 'USD' NOT NULL,
	"email" text NOT NULL UNIQUE,
	"id" serial PRIMARY KEY,
	"is_onboarded" boolean DEFAULT false NOT NULL,
	"location_text" text,
	"name" text NOT NULL,
	"onboarded_at" timestamp with time zone,
	"onboarding_setup_completed_at" timestamp with time zone,
	"role" "user_role" DEFAULT 'driver'::"user_role" NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"week_starts_on" "week_starts_on" DEFAULT 'sunday'::"week_starts_on" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "ai_extractions_entry_created_at_idx" ON "ai_extractions" ("entry_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_extractions_media_id_idx" ON "ai_extractions" ("media_id");--> statement-breakpoint
CREATE INDEX "ai_extractions_user_created_at_idx" ON "ai_extractions" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_extractions_user_status_created_at_idx" ON "ai_extractions" ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_extractions_workflow_run_id_idx" ON "ai_extractions" ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_provider_model_created_at_idx" ON "ai_usage_events" ("provider","model","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_created_at_idx" ON "ai_usage_events" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_meter_key_created_at_idx" ON "ai_usage_events" ("user_id","meter_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_status_created_at_idx" ON "ai_usage_events" ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_meters_key_unique" ON "billing_meters" ("key");--> statement-breakpoint
CREATE INDEX "credit_packs_active_sort_order_idx" ON "credit_packs" ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_source_type_source_id_unique" ON "credit_transactions" ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_user_created_at_idx" ON "credit_transactions" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "earnings_entries_external_ref_idx" ON "earnings_entries" ("external_ref");--> statement-breakpoint
CREATE INDEX "earnings_entries_user_occurred_at_idx" ON "earnings_entries" ("user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "earnings_entries_user_platform_occurred_at_idx" ON "earnings_entries" ("user_id","platform_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "earnings_entries_user_status_occurred_at_idx" ON "earnings_entries" ("user_id","status","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_external_event_id_unique" ON "email_events" ("external_event_id");--> statement-breakpoint
CREATE INDEX "email_events_status_created_at_idx" ON "email_events" ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_events_user_type_created_at_idx" ON "email_events" ("user_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_preferences_user_id_unique" ON "email_preferences" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_email_unique" ON "email_suppressions" ("email");--> statement-breakpoint
CREATE INDEX "email_suppressions_reason_created_at_idx" ON "email_suppressions" ("reason","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_webhook_events_event_type_created_at_idx" ON "email_webhook_events" ("event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_webhook_events_provider_event_id_unique" ON "email_webhook_events" ("provider_event_id");--> statement-breakpoint
CREATE INDEX "entry_media_media_id_idx" ON "entry_media" ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_trip_verifications_entry_id_unique" ON "entry_trip_verifications" ("entry_id");--> statement-breakpoint
CREATE INDEX "entry_trip_verifications_status_updated_at_idx" ON "entry_trip_verifications" ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expense_media_media_id_idx" ON "expense_media" ("media_id");--> statement-breakpoint
CREATE INDEX "expenses_entry_id_idx" ON "expenses" ("entry_id");--> statement-breakpoint
CREATE INDEX "expenses_user_category_incurred_at_idx" ON "expenses" ("user_id","category","incurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_user_incurred_at_idx" ON "expenses" ("user_id","incurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "goals_user_metric_period_basis_scope_start_unique" ON "goals" ("user_id","metric","period","basis","scope","period_start_date");--> statement-breakpoint
CREATE INDEX "goals_user_period_start_date_idx" ON "goals" ("user_id","period_start_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "income_stubs_public_id_unique" ON "income_stubs" ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "income_stubs_user_cadence_period_revision_unique" ON "income_stubs" ("user_id","cadence","period_start","period_end","revision");--> statement-breakpoint
CREATE INDEX "income_stubs_user_period_end_idx" ON "income_stubs" ("user_id","period_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "income_stubs_user_status_period_start_idx" ON "income_stubs" ("user_id","status","period_start" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_assets_kind_created_at_idx" ON "media_assets" ("kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_assets_sha256_idx" ON "media_assets" ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_user_created_at_idx" ON "media_assets" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "onboarding_offer_configs_active_updated_at_idx" ON "onboarding_offer_configs" ("active","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_offer_configs_code_unique" ON "onboarding_offer_configs" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_offer_configs_discount_id_unique" ON "onboarding_offer_configs" ("discount_id");--> statement-breakpoint
CREATE INDEX "platforms_created_by_user_id_idx" ON "platforms" ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "platforms_is_active_idx" ON "platforms" ("is_active");--> statement-breakpoint
CREATE INDEX "pricing_plans_active_sort_order_idx" ON "pricing_plans" ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_plans_plan_tier_billing_interval_unique" ON "pricing_plans" ("plan_tier","billing_interval");--> statement-breakpoint
CREATE UNIQUE INDEX "stub_profiles_user_id_unique" ON "stub_profiles" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_polar_subscription_id_unique" ON "subscriptions" ("polar_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_period_end_idx" ON "subscriptions" ("status","current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_id_unique" ON "subscriptions" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_credit_balances_user_id_unique" ON "user_credit_balances" ("user_id");--> statement-breakpoint
CREATE INDEX "user_platforms_user_active_updated_at_idx" ON "user_platforms" ("user_id","is_active","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "user_platforms_user_platform_unique" ON "user_platforms" ("user_id","platform_id");--> statement-breakpoint
CREATE INDEX "users_is_onboarded_idx" ON "users" ("is_onboarded");--> statement-breakpoint
CREATE INDEX "users_onboarded_at_idx" ON "users" ("onboarded_at");--> statement-breakpoint
CREATE INDEX "users_onboarding_setup_completed_at_idx" ON "users" ("onboarding_setup_completed_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" ("role");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_entry_id_earnings_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "earnings_entries"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_media_id_media_assets_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "earnings_entries" ADD CONSTRAINT "earnings_entries_platform_id_platforms_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id");--> statement-breakpoint
ALTER TABLE "earnings_entries" ADD CONSTRAINT "earnings_entries_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entry_media" ADD CONSTRAINT "entry_media_entry_id_earnings_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "earnings_entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entry_media" ADD CONSTRAINT "entry_media_media_id_media_assets_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entry_trip_verifications" ADD CONSTRAINT "entry_trip_verifications_entry_id_earnings_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "earnings_entries"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_media" ADD CONSTRAINT "expense_media_expense_id_expenses_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expense_media" ADD CONSTRAINT "expense_media_media_id_media_assets_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_entry_id_earnings_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "earnings_entries"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_platform_id_platforms_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "income_stubs" ADD CONSTRAINT "income_stubs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "stub_profiles" ADD CONSTRAINT "stub_profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_credit_balances" ADD CONSTRAINT "user_credit_balances_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_platforms" ADD CONSTRAINT "user_platforms_platform_id_platforms_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_platforms" ADD CONSTRAINT "user_platforms_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
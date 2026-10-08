# GigStax (Earnings Tracker)

GigStax is a full-stack earnings and expense tracker built for gig delivery drivers. It combines manual entry, AI-assisted extraction from screenshots/receipts, and tax-ready income stubs inside a subscription-based dashboard. The app targets multi-platform drivers (Spark, Uber Eats, DoorDash, Instacart, and more) and focuses on clear gross vs net visibility, platform-level breakdowns, and historical reporting.

This is the Cloudflare edition of the app, ported from the original Next.js/Vercel codebase: TanStack Start on Cloudflare Workers, a Hono API, Drizzle + Postgres on PlanetScale (provisioned by Alchemy), Cloudflare Workflows for the AI extraction pipeline, R2 for media, and Polar for billing.

## Tech Stack

- TanStack Start (SSR) with React 19 and TypeScript on Cloudflare Workers.
- Hono API (stoker + `@hono/zod-openapi` route style, OpenAPI doc at `/openapi`).
- Cloudflare Workers runtime — `gigstax-web` (web) and `gigstax-server` (API) workers.
- Drizzle ORM with Postgres, hosted on PlanetScale Postgres (Alchemy-provisioned).
- Alchemy for infrastructure-as-code (Workers, D1-free stack: PlanetScale, R2, Axiom, Workflows).
- Better Auth (email/password + Google OAuth) with the Drizzle adapter, Polar checkout/portal plugins, and the Expo plugin for the upcoming mobile app.
- Cloudflare Workflows — durable, step-retried extraction pipeline.
- R2 for private media storage, streamed through ownership-checked API routes.
- Vercel AI SDK + Gemini 3 Flash for screenshot and receipt extraction.
- Tailwind CSS v4 with Radix UI primitives (shared via `packages/ui`).
- TanStack Query for client data fetching, Recharts for visualizations.
- Resend for transactional + lifecycle email, with lifecycle jobs on a CRON_SECRET-protected endpoint.
- evlog → Axiom for structured logging and observability.
- oxlint + Oxfmt via Ultracite for linting and formatting, Vitest for unit tests.

## Product Summary

GigStax helps drivers log deliveries, track expenses, and understand profitability across multiple gig apps. The onboarding flow collects platform selections, time zone, and weekly cadence, then the dashboard surfaces totals, charts, and recent activity. AI workflows parse screenshots and receipts into structured entries, and bulk upload queues multiple files for durable background processing. The billing system supports subscription tiers, metered usage, and one-off credit packs through Polar. Email notifications are delivered via Resend, and admin tools provide pricing/usage management.

## Core Features

- Delivery earnings tracking with platform, status, miles, duration, stops, base pay, bonus, and tip states.
- Expense logging with categories (fuel, tolls, maintenance, supplies, phone, and more) plus receipt attachments.
- AI extraction from single screenshots and receipts using the AI SDK + Gemini 3 Flash.
- Bulk upload pipeline that queues multiple images into Cloudflare Workflows with per-item status polling and retry.
- Weekly goals dashboard with charts showing base pay and tips by day.
- Income stubs with configurable cadence (weekly, biweekly, monthly), YTD totals, printable views, and CSV/PDF exports.
- Platform management with default options plus custom platform creation and color assignments.
- Notifications for pending tip verification after a delay window.
- Subscription billing, usage metering, and credit packs via Polar, surfaced through a `/api/billing` entitlement aggregate.
- Admin suite for user counts, pricing plan edits, credit packs, discounts, and usage analytics.
- Private media storage in R2 and secure retrieval through gated API routes.

## Key Pages and Routes

- `/` marketing home with pricing and feature highlights.
- `/signup` and `/login` authentication (email/password + Google OAuth).
- `/onboarding` setup wizard for profile, platforms, and plan selection.
- `/dashboard` summary view with gross/net toggles, charts, and recent entries (single `GET /api/dashboard` aggregate).
- `/dashboard/deliveries` delivery entry list with AI/bulk workflows.
- `/dashboard/deliveries/[id]` delivery detail, edit, and screenshot view.
- `/dashboard/expenses` expense list with receipt uploads and bulk extraction.
- `/dashboard/expenses/[id]` expense detail and edit.
- `/dashboard/goals` weekly targets and progress visualization.
- `/dashboard/stubs` income stub dashboard, history, and cadence settings.
- `/dashboard/stubs/[id]` stub detail and `/print` view.
- `/dashboard/notifications` pending tip verification queue.
- `/dashboard/settings` profile, timezone, platform selection, and verification info.
- `/dashboard/billing` subscription management, consumed vs included credits, pack balance, and credit-pack purchases.
- `/dashboard/admin` admin overview with links to user, pricing, and usage tools.

## API Surface (Selected)

Auth and session

- `GET|POST /api/auth/*` Better Auth handler (mounted from the Hono app).
- `GET /api/user` user profile, selected platforms, verification profile.
- `PATCH /api/user` update timezone, week start, platforms, verification profile.

Dashboard

- `GET /api/dashboard` aggregated dashboard data (1:1 port of `getDashboardData`).

Entries

- `GET /api/entries` list entries with filters, pagination, and summary.
- `POST /api/entries` create a manual delivery entry.
- `GET|PATCH|DELETE /api/entries/{id}` fetch, update, or delete an entry.
- `POST /api/analyze-image` AI analysis for a screenshot or receipt.
- `POST /api/analyze-screenshot` AI analysis (legacy screenshot endpoint).
- `POST /api/entries/bulk-analyze` queue bulk delivery screenshot analysis.
- `GET /api/entries/bulk-analyze/status` poll bulk extraction status.
- `POST /api/entries/bulk-analyze/retry` retry failed extractions (new Workflow instances).
- `PUT /api/entries/{id}/trip-verification` store trip verification data.
- `GET /api/entries/trip-verification-queue` entries needing verification input.

Expenses

- `GET|POST /api/expenses` list expenses with filters and summary / create expenses.
- `GET|DELETE /api/expenses/{id}` expense detail and delete.
- `POST /api/expenses/{id}/media` attach receipt media.
- `POST /api/expenses/bulk-analyze` (+ `/status`, `/retry`) bulk receipt analysis.

Billing

- `GET /api/billing` subscription row + entitlement + active pricing plans + active credit packs.

Stubs

- `GET /api/stubs` list stub history and defaults.
- `POST /api/stubs/preview` preview a stub snapshot.
- `POST /api/stubs` create a new stub.
- `GET|PATCH /api/stubs/{id}` fetch or update stub status/fields; `POST .../lock`, `GET .../csv`, `GET .../pdf`.

Platforms and onboarding

- `GET|POST /api/platforms` platform options and custom platform creation.
- `GET /api/onboarding` onboarding state (user, platforms, pricing).
- `POST /api/onboarding` save onboarding selections.

Admin

- `GET /api/admin/overview`, `GET /api/admin/users`, `PATCH /api/admin/users/{id}/role`.
- `GET|POST|PATCH /api/admin/pricing/plans`, `/packs`, `/discounts` (+ expire), `POST /api/admin/pricing/sync`, `GET /api/admin/pricing/offer`, `GET /api/admin/usage/summary`.

Media, email, and jobs

- `GET|DELETE /api/media/{id}` stream or delete private media (R2, ownership-checked).
- `GET|PATCH /api/email/preferences`, `POST /api/email/unsubscribe`, `GET /api/u/unsubscribe` (public one-click, token-based).
- `POST /api/webhooks/resend` Resend webhook (svix-verified).
- `GET /api/cron/email-lifecycle` lifecycle email pass (Bearer CRON_SECRET).
- `GET /openapi` OpenAPI 3.1 document for the whole API.

## Monorepo Architecture

- `apps/web` TanStack Start app — routes, components, hooks (client side of the ported product).
- `apps/server` Hono API on Cloudflare Workers — route modules (`src/routes`), ported services (`src/lib/services`), emails (`src/emails`), and the `ProcessExtractionWorkflow` Cloudflare Workflow.
- `apps/native` Expo + UniWind app shell (better-auth Expo client wired; screens are next up).
- `packages/db` Drizzle schema + generated migrations (postgres dialect for PlanetScale).
- `packages/auth` shared better-auth factory (web + native), Polar plugins, Google OAuth.
- `packages/ui` shared shadcn/ui primitives and the GigStax theme tokens.
- `packages/infra` Alchemy stack (`alchemy.run.ts`) — Workers, PlanetScale database, R2 bucket, Axiom dataset, Workflow binding.
- `packages/config` shared tsconfig/oxlint presets.

## Data Model Highlights

Core authentication

- `user`, `session`, `account`, `verification` from Better Auth.

App domain

- `users` app-level user profile and settings.
- `platforms` system + custom gig platforms.
- `user_platforms` per-user platform selections and colors.
- `earnings_entries` delivery income logs.
- `expenses` business expense logs.
- `media_assets` stored screenshots and receipts.
- `entry_media` and `expense_media` media relationships.
- `ai_extractions` queued/completed AI parsing results (with Workflow instance ids in `workflow_run_id`).
- `entry_trip_verifications` trip mileage verification records.

Billing and usage

- `pricing_plans` subscription tiers and feature limits.
- `credit_packs` one-off AI credit bundles.
- `user_credit_balances` rolling credit pack usage.
- `credit_transactions` credit consumption ledger.
- `subscriptions` per-user plan tier and billing interval.
- `billing_meters` Polar metering IDs.
- `ai_usage_events` AI and bulk usage audit records.

Income stubs

- `stub_profiles` per-user stub preferences and verification info.
- `income_stubs` generated stub snapshots and history.

Email tracking

- `email_events` idempotent transactional and lifecycle email tracking.
- `email_preferences` per-user lifecycle email preferences.
- `email_suppressions` suppression list for bounce/complaint/unsubscribe handling.
- `email_webhook_events` idempotent webhook event ingestion.

## AI Extraction Pipeline

1. User uploads a screenshot or receipt.
2. The file is stored in R2 (private) and a `media_assets` record is created.
3. A `ProcessExtractionWorkflow` instance is created (durable, step-retried Cloudflare Workflow) with an idempotency key; the instance id is stored on the extraction row.
4. The `analyze-media` step reads the object bytes from R2 (legacy Vercel Blob records still work via their providers) and calls Gemini 3 Flash via the AI SDK, with exponential retries.
5. Parsed payload is normalized into standardized fields (entry vs expense), usage recorded in `ai_usage_events`, and optionally metered through Polar.
6. Bulk uploads create one Workflow instance per file; status is polled via API and retries spawn fresh instances.

## Billing and Entitlements

GigStax uses Polar for checkout and subscription management. Entitlements are derived from pricing plans and usage meters and exposed via `GET /api/billing`.

Default pricing tiers (from code-defined catalog)

- Starter Monthly: 10 AI credits, manual entry, receipt attachment.
- Driver Monthly: 300 AI credits, bulk uploads, mid-level analytics.
- Driver Yearly: same limits with yearly billing.
- Pro Driver Monthly: unlimited AI and bulk workflows, full analytics and exports.
- Pro Driver Yearly: same limits with yearly billing.

Credit packs

- Optional one-time AI packs provide extra credits for users on capped plans.

## Authentication and Authorization

- Better Auth provides email/password and (when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set) Google OAuth.
- Sessions are persisted in Postgres through Drizzle; cookies use `SameSite=None; Secure` so the API (`gigstax-server`) serves both the web app and the future native app.
- App roles are derived from the `ADMIN_EMAILS` allowlist; app-user rows are upserted lazily on first session resolution.
- Route guards enforce authentication, onboarding completion, and admin access.

## Media Storage

- New uploads target a private R2 bucket (the `MEDIA` binding, Alchemy-provisioned).
- Legacy Vercel Blob records remain readable through provider-aware logic (bring your blob tokens if you have existing data).
- Media is fetched through `/api/media/{id}`, which validates user ownership and streams bytes with ETag/304 support.

## Observability

- evlog middleware assigns request context and ships logs to an auto-provisioned Axiom dataset (`gigstaxcf-<stage>-logs`).
- A service-level pino-compatible shim covers module-level logging.

## Local Development

Prerequisites: Bun, and accounts on Cloudflare, PlanetScale, and Axiom (all managed by Alchemy).

```bash
bun install

# one-time: authenticate the providers Alchemy will use
bunx alchemy login cloudflare
bunx alchemy login planetscale
bunx alchemy login axiom

bun run dev
```

- Web app: http://localhost:3001
- API: http://localhost:3000
- Native shell: update `apps/native/.env` with your LAN IP (`EXPO_PUBLIC_SERVER_URL=http://<YOUR_LOCAL_IP>:3000`)

Alchemy provisions PlanetScale, injects its connection credentials, and applies checked-in migrations during deploy. Generate migration SQL with `bun run db:generate`.

The generated PlanetScale database uses the `PS_DEV` size, which may incur usage charges — adjust `clusterSize` in `packages/infra/alchemy.run.ts` before deployment if needed.

## Deployment

The stack deploys two workers on your Cloudflare account:

| Worker               | URL                                                |
| -------------------- | -------------------------------------------------- |
| Web (TanStack Start) | `https://gigstax-web.rocktown-labs.workers.dev`    |
| API (Hono)           | `https://gigstax-server.rocktown-labs.workers.dev` |

```bash
# before the first deploy, point the API at the deployed web origin
# (local dev keeps http://localhost:3001)
CORS_ORIGIN=https://gigstax-web.rocktown-labs.workers.dev
POLAR_SUCCESS_URL=https://gigstax-web.rocktown-labs.workers.dev/success?checkout_id={CHECKOUT_ID}
SITE_URL=https://gigstax-web.rocktown-labs.workers.dev

bun run deploy
```

`bun run deploy` runs Alchemy from `packages/infra`: it provisions the PlanetScale database (+ role), the R2 media bucket, the Axiom dataset + ingest token, both Workers (with the `MEDIA` and `PROCESS_EXTRACTION` bindings), applies migrations, and returns the worker URLs. `bun run destroy` tears the stack down.

Notes

- The same `apps/server/.env` feeds both local dev and deploy — flip `CORS_ORIGIN` (and the other web-origin URLs) to the workers.dev origin when deploying, and back for local dev (or export them in CI).
- With a custom domain later, update `CORS_ORIGIN`/`POLAR_SUCCESS_URL`/`SITE_URL` and add the domain to the Alchemy Worker config; workers.dev names stay as fallbacks.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the full dev stack (web :3001, API :3000). |
| `bun run build` | Production builds across the monorepo (Turbo). |
| `bun run check-types` | TypeScript checks for all workspaces. |
| `bun run check` | Ultracite (oxlint + oxfmt) check. |
| `bun run fix` | Auto-fix lint and formatting. |
| `bun run test` | Vitest unit tests (server + web) via Turbo. |
| `bun run db:generate` | Generate Drizzle migrations from the schema. |
| `bun run deploy` | Alchemy deploy (Cloudflare + PlanetScale + Axiom). |
| `bun run destroy` | Alchemy destroy (tears down the stack). |
| `bun run env:generate` | Regenerate Varlock env typings after schema changes. |

## Testing

- Unit tests live in `apps/server/tests/unit` (services, validations, pdf builder, email rendering, entitlements, polar config, etc.) and `apps/web/tests` (component tests) — run with `bun run test`.
- The old live-database integration suite (Next route handler tests) is not ported yet; the ported route modules are exercised via their OpenAPI definitions and the smoke-tested Hono dispatch.

## Environment Variables

Deployed values are declared in `packages/infra/alchemy.run.ts` (all optional ones default to empty). Local dev values live in each app's `.env` (see `.env.schema`).

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Alchemy-injected | PlanetScale pooled connection (auto; do not set manually). |
| `BETTER_AUTH_SECRET` | server | Auth cookie signing secret (required). |
| `BETTER_AUTH_URL` | auto | Worker URL (set by Alchemy). |
| `CORS_ORIGIN` | server | Trusted web origin (required; web workers.dev URL in deploy). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server | Enable Google OAuth. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | Gemini 3 Flash for screenshot/receipt extraction. |
| `ADMIN_EMAILS` | server | Comma-separated admin allowlist. |
| `POLAR_ACCESS_TOKEN` | server | Polar API token for checkout, portal, subscriptions (required). |
| `POLAR_SUCCESS_URL` | server | Checkout success redirect (web origin + `/success`). |
| `POLAR_SERVER` | server | `sandbox` or `production`. |
| `POLAR_ORGANIZATION_ID` | server | Required only for non-org Polar tokens. |
| `POLAR_*_PRODUCT_ID` | server | Polar product UUIDs per plan (Starter/Driver/Pro, monthly/yearly). |
| `POLAR_AI_EXTRACT_METER_ID` / `POLAR_BULK_UPLOAD_METER_ID` | server | Polar metering IDs. |
| `RESEND_API_KEY` | server | Transactional + lifecycle email. |
| `RESEND_FROM_TRANSACTIONAL` / `RESEND_FROM_LIFECYCLE` | server | From addresses per email category. |
| `RESEND_WEBHOOK_SECRET` | server | Svix secret for Resend webhook verification. |
| `EMAIL_UNSUBSCRIBE_SECRET` | server | HMAC secret for signed unsubscribe links. |
| `CRON_SECRET` | server | Bearer token for `/api/cron/email-lifecycle`. |
| `SITE_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | server | Public web origin used in email links (fallbacks). |
| `RADAR_SERVER_KEY` / `NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY` | server + web | Radar geocoding/routing for trip verification. |
| `AI_INPUT_COST_PER_1M` / `AI_OUTPUT_COST_PER_1M` | server | Override token cost estimates for AI usage. |
| `BLOB_PRIVATE_READ_WRITE_TOKEN` / `BLOB_READ_WRITE_TOKEN` | server | Legacy Vercel Blob reads for existing media. |
| `VITE_SERVER_URL` | web | API origin (Alchemy-injected; localhost for dev). |
| `EXPO_PUBLIC_SERVER_URL` | native | API origin for the Expo app. |

## Notes

- The web app is a client-heavy TanStack Start port of the original Next.js app; all routes keep their original paths and URL contracts.
- The API uses stoker + `@hono/zod-openapi` conventions: typed status codes, `defaultHook` 422 validation responses, and a generated OpenAPI document at `/openapi`.
- Background processing runs on Cloudflare Workflows with durable, step-retried steps and instance ids tracked on extraction rows.
- Billing and entitlements are first-class in the data model (subscriptions, credit packs, meters) and are surfaced through a single `/api/billing` aggregate.

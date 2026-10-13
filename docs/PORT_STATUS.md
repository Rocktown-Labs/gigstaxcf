# Port Status & Next Steps

> Snapshot as of 2026-10-13, immediately after merging the port PR ([#2](https://github.com/Rocktown-Labs/gigstaxcf/pull/2), closing [#1](https://github.com/Rocktown-Labs/gigstaxcf/issues/1)). Update this doc as major items land.

## Where the port stands

The GigStax product is ported from the Next.js/Vercel codebase onto this Cloudflare-native monorepo and **web feature parity is complete**. `master` contains everything below; the port merged cleanly with all gates green.

| Area | Status |
| --- | --- |
| Drizzle schema (25 tables, postgres/PlanetScale) + generated migrations | ✅ Ported |
| Services, emails, workflow logic (`apps/server/src/lib`) | ✅ Ported |
| Hono API — ~90 endpoints, stoker + zod-openapi style, `/openapi` doc | ✅ Ported |
| Better Auth (email/password + optional Google OAuth), Polar checkout/portal, admin allowlist | ✅ Ported |
| R2 media (upload / stream / AI analysis, legacy Blob reads preserved) | ✅ Ported |
| `ProcessExtractionWorkflow` on Cloudflare Workflows (durable, retried steps, instance ids tracked) | ✅ Ported |
| Web UI — 106 components + hooks, 30 routes, billing entitlements, SEO server routes | ✅ Ported |
| Alchemy stack — `gigstax-web` / `gigstax-server` workers, PlanetScale, R2, Axiom, full env set | ✅ Declared |
| Unit test suite — 88 tests, zero production changes required | ✅ Ported |
| Live-DB integration suite (old repo's route tests) | ⏳ Not ported (needs DB credentials) |
| Native app screens (Expo shell + auth client + tokens ready) | ⏳ Next up |

Quality gates used for every change (all green on master):

```bash
bun run check        # ultracite (oxlint + oxfmt): 0 errors allowed
bun run check-types  # tsc across all workspaces (7/7)
bun run test         # vitest unit suite via turbo (88 tests)
bun run build        # production builds (web + server)
```

## Deploying — the remaining manual steps

Everything is deploy-ready; only interactive provider auth is left.

### 1. Connect provider accounts (one-time, interactive)

```bash
cd packages/infra
bunx alchemy profile edit   # connect Cloudflare, PlanetScale, and Axiom
```

### 2. Point the API at the deployed web origin

In `apps/server/.env` (the same file feeds local dev — flip back when developing locally):

```ini
CORS_ORIGIN=https://gigstax-web.rocktown-labs.workers.dev
POLAR_SUCCESS_URL=https://gigstax-web.rocktown-labs.workers.dev/success?checkout_id={CHECKOUT_ID}
SITE_URL=https://gigstax-web.rocktown-labs.workers.dev
```

### 3. Deploy

```bash
bun run deploy
```

First deploy provisions: the PlanetScale Postgres cluster (`PS_DEV` size — may incur charges, tune `clusterSize` in `packages/infra/alchemy.run.ts`), the `media` R2 bucket, the Axiom dataset + ingest token, both workers (with the `MEDIA` and `PROCESS_EXTRACTION` bindings), and applies the checked-in migrations. Expected URLs:

- Web: `https://gigstax-web.rocktown-labs.workers.dev`
- API: `https://gigstax-server.rocktown-labs.workers.dev`

### 4. Post-deploy smoke checklist

- `GET https://gigstax-server.rocktown-labs.workers.dev/` → `OK`
- `GET .../openapi` → document renders (48+ paths)
- Sign up / log in on the web origin (cookies cross-origin; check Network tab for `SameSite=None`)
- `POST /api/entries` with a session → 200
- Upload a screenshot (media → R2 → Workflow instance created)
- Add real Polar products (sandbox.polar.sh) → set `POLAR_ACCESS_TOKEN` in `apps/server/.env` → sync from `/dashboard/admin/pricing` → billing page shows purchasable plans/packs

`bun run destroy` tears the whole stack down if a clean slate is needed.

## Known follow-ups

1. **CI workflow** — no GitHub Actions yet. Add one that runs `bun run check && bun run check-types && bun run test` on PRs so the merge gate runs on GitHub instead of locally.
2. **Cron scheduling** — `/api/cron/email-lifecycle` is CRON_SECRET-protected but nothing invokes it yet. Options: add a cron trigger/schedule to the server Worker in `alchemy.run.ts`, or hit the endpoint from an external scheduler (GitHub Actions cron works fine). Requires setting `CRON_SECRET`.
3. **Integration tests** — port the old live-DB route suite once a stable test database exists (it needs a `DATABASE_URL` + migrated schema; the PlanetScale dev database can serve after first deploy, or use a disposable Postgres).
4. **Google OAuth** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` when the Google OAuth app exists (the login/signup forms already call it; the buttons show a friendly error until configured).
5. **Mobile screens** — the Expo app (`apps/native`) has the shell, auth client (`@better-auth/expo`), theme tokens, and `EXPO_PUBLIC_SERVER_URL` wiring; screens are the next feature project.
6. **Dashboard aggregate swap done, but keep an eye on** — the billing page renders `used / limit` and pack balance from `/api/billing`; if plan catalogs change, re-run the admin pricing sync.

## Repo workflow notes

- Follow the GitHub-driven lifecycle from the original repo's `AGENTS.md`: Issue → Branch (`feat|fix|chore/<slug>-<issue#>`) → implement → gates → PR (title = issue title, body = Summary / Implementation Notes / Testing Notes / `Closes #N`) → merge (`gh pr merge --merge --delete-branch`) → Project item Done.
- Default branch is `master`; all PRs target it.
- Quality gates before every PR: the four commands at the top of this doc.
- `gh project` gotchas hit while setting up the `gigstaxcf Project` (#7):
  - `gh project item-add` exits 0 but silently does nothing on this org — add items via the GraphQL `addProjectV2ItemById` mutation instead.
  - `gh project item-edit` needs `--project-id PVT_...` (not `--owner`); get field/option ids from `gh project field-list <num> --format json`.
- Deployment env flows through `packages/infra/alchemy.run.ts` (bound values) + `apps/*/.env` (local + deploy-time Config values) — regenerate typings with `bun run env:generate` after changing `.env.schema`.

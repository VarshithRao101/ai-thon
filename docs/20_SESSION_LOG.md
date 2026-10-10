# 20 — Session Log

## 2026-10-09 — Selection + Phase 0
- The user shared the 20 problem statements from the TRI-CITY AI HACKATHON. Ranked by architecture depth plus blockchain fit: #5 automation (picked), #11+#12 document intelligence, #9 multi-tenant chatbot. IoT was dropped because the hackathon is software-only.
- The user submitted #5 to the organizers as **N-Flow** (abstract: AI workflow generation, Sheets/email/Telegram, blockchain-verified execution logs, INR freemium pricing).
- Confirmed that every component has a free tier. Two gotchas noted: Resend can't email arbitrary recipients without a verified domain, so we use Gmail SMTP; and Amoy faucets have daily limits.
- The project moved to `D:\TRNT BEE\TRNT BEE\ai-thon workflow`. The user shared the judging rubric (MVP 30 / AI-SaaS 20 / UI 15 / Market 15 / Innovation 10 / Pitch 10) and asked for P0: plan everything (architecture, UI, DB, blockchain, containers, orchestration, endpoints, logo, theme).
- **GitHub research (API-checked):** base = `vercel-labs/workflow-builder-template` (Apache-2.0, Next.js 16, React Flow, Better Auth, Drizzle, plugin system, AI generation). Libraries listed in [04](04_REUSE_PLAN.md). Rejected n8n (license), Automatisch (AGPL) and a full Activepieces fork.
- The TRNT BEE logo was copied into `brand/`. Palette sampled: `#FFE73C #FFC326 #FFBC12 #E49000 #C27503`.
- Wrote docs 00–20, the design board and decisions D-001…D-020. **P0 complete. Waiting for "next" to start P1A**, plus answers to Q1–Q6, especially Q3 (rules on pre-event code).
- Environment: no Docker or WSL on the laptop. pnpm gets installed in P1A.

## 2026-10-09 — P1A Scaffold + brand (done)
- The user said "next" without answering Q1–Q6, so we proceeded. **Q3 (rules on pre-event code) is still open and matters.**
- Forked the template at `24fb0fd4…` into `apps/web`. A pristine copy is in gitignored `.upstream/` for diffs, and `NOTICE` carries the Apache-2.0 attribution. pnpm 10.34.6 workspaces + Turborepo 2.11.7. The lockfile was carried over so the template's tested versions are kept.
- **Security:** the template's pins had a critical unauthenticated RCE in Next 16.0.10, plus Better Auth 2FA-bypass and token-replay bugs. We upgraded and pinned patched transitive versions: audit 231 findings (8 critical) → **2 low** (D-021).
- Removed Workflow DevKit + Vercel Analytics. `lib/runtime/dispatch.ts` runs the executor in-process; Hive replaces it in 1C (D-022).
- **Brand:**
  - The bee mark is cut from the logo JPEG into black/honey PNGs, a smoothed SVG trace and the favicon/app icons (`scripts/brand/make_logo.py`).
  - Theme tokens are black/graphite/honey/gold in `globals.css` (dark default), with fonts Sora/Inter/JetBrains Mono.
  - N-Flow lockup replaces the template's GitHub/Deploy buttons.
  - Titles are fixed: a double " | N-Flow" suffix was found in the browser and fixed.
- `packages/config`: zod env schema per role (web/worker/scheduler/anchorer). Errors name variables, never values. **6/6 tests.**
- Local DB: embedded Postgres 17.10 on :5433, no Docker (D-023). `scripts/dev-env.mjs` generates local secrets without printing them.
- Lint: pinned Biome 2.3.15 to match Ultracite 6.3.0. Normalized 293 CRLF files to LF. Fixed 43 pre-existing template lint findings; 2 intentional hook dependencies are annotated rather than changed (D-024).
- **Verified:**
  - `pnpm typecheck` 2/2, `pnpm lint` clean, `pnpm test` 6/6, `pnpm build` (30 routes).
  - In the browser: the themed home page and sign-in dialog, no console errors.
  - Anonymous sign-in → workflow created in Postgres → **test run #1 succeeded (18 ms) through the new dispatch**.
- Git repo initialized on `main` with **no commits**; we're waiting for the user's decision on commits and the remote (Q6). Turbo's auto-written `AGENTS.md` was disabled (`agentGuidance: false`).
- **Next: 1B** (data + auth + tenancy). Waiting for "next".

## 2026-10-09 — P1B Data + auth + tenancy (done)
- The user confirmed pre-event code is allowed (Q3 closed).
- **Schema** (migration 0005): `workspaces`, `members` and `invitations` (Better Auth org plugin mapping), `sessions.active_organization_id`, plus `workspace_id` on all tenant tables. Also vault columns, integration status, API key scopes/expiry/revoke, and `audit_events`. Cascading FKs: the template's workflow delete would have failed once a workflow had runs. The generated SQL was hand-edited to add columns as nullable, backfill personal workspaces, then set NOT NULL.
- **RLS** (migration 0006): the `flowledger_app_role` group, grants, `app_workspace_id()`, tenant policies on 6 tables plus public read for workflows, and `resolve_api_key()` SECURITY DEFINER. Dev DB has two roles (owner `flowledger`, app `flowledger_app`); the app is wired with `DATABASE_URL` + `DATABASE_ADMIN_URL`. The boot check confirmed `tenant isolation enforced (db role: flowledger_app)`.
- **App layer:**
  - `lib/db/tenant.ts`: AsyncLocalStorage + `tdb()` / `publicDb()`
  - `lib/auth/context.ts`: session → active workspace + role
  - `lib/auth/rbac.ts`: matrix from doc 10
  - `lib/api/route.ts`: `tenantRoute` / `optionalTenantRoute`; errors never leak internals
  - All 20 DB-touching routes plus step logging rewritten. Every write/execute path checks `workflow.workspace_id` explicitly, because the public-read policy makes foreign public workflows *visible*.
- **Vault:** envelope encryption (per-workspace DEK, versioned KEKs, AAD = workspace). Legacy template ciphertexts still read. `/api/workspaces/vault/rotate`.
- **Also built:**
  - `/api/me` (role + permissions) and `/api/audit`
  - API keys: `flk_` prefix, scopes, soft revoke
  - Vercel AI Gateway managed keys retired (D-027)
- **Bugs found by tests and fixed:**
  1. The `user.create.after` hook raced guest-account linking, so a stray empty workspace was created. Personal workspaces are now created lazily with a per-user advisory lock (D-028).
  2. My own vault tamper test was flaky (~1/64). It now flips every ciphertext byte deterministically.
  3. Windows: killing `pnpm db:local` can orphan postgres.exe, so we added `pnpm db:stop`.
- **Security finding (template, not yet fixed):** the "database" connection test and the Database Query step connect to any user-supplied URL (SSRF). Scheduled for 1E (doc 10, "Known gaps").
- **Verified:**
  - Unit tests: config 6 + web 29 = **35 pass**, including 8 RLS tests on real Postgres (PGlite) and 2 backfill tests.
  - `scripts/e2e-tenancy.mjs`: **59/59 live checks** covering isolation, public sharing, credentials, runs, API keys, viewer RBAC, audit, rotation, guest→account linking, and a 5-way concurrent first request.
  - Typecheck, lint (165 files) and build are green. Browser: create workflow → run → success, no fresh errors.
- **Next: 1C** (Hive engine: BullMQ queues, workers, retries, DLQ, versions/publish, SSE). It needs Redis: Docker (Q5) or Upstash. Waiting for "next".

## 2026-10-09 (evening) — Scope lock + P1C–P1F
- The build window is **36 hours** from 12:00 on 2026-10-09. The plan was cut to the hero flow first (D-034). The team is a duo: the teammate owns accounts and keys 2–5, the lead owns wallet funding, RPC, deck and props (D-035, [19](19_OWNER_SETUP.md)).
- The repo is public: references to the owner's other private work were removed from the docs (the old text is still in the last local commit until the owner amends it).
- **Testnet wallet** generated locally (`pnpm --filter @flowledger/web wallet:new`): `0xc7aC6059DD12b92E2fff7fea69a008f3a8664dC3`. The key lives only in `.env.local`.
- **1C Hive engine:** pg-boss on Postgres instead of Redis (D-033). Runner with checkpoint/resume from step logs, retries with jitter, circuit breaker, durable Delay waits, DLQ, idempotency keys, publish → immutable versions, enable/disable, retry from the failed step, Postgres LISTEN/NOTIFY events. **26/26 live checks** (`scripts/e2e-hive.mjs`).
- **1D/1E:** Form trigger (builder, hosted `/f/{id}`, QR, consent, honeypot, rate limit, idempotent submit), webhook, schedule (pg-boss cron), manual with sample data. Plugins: Google Sheets (service account), Email via Gmail SMTP, Telegram, N-Flow AI (classify, draft email, extract, generate; Gemini primary, Groq fallback, models from env). **21/21 live checks** (`scripts/e2e-forms.mjs`), including a Telugu + emoji answer.
- **Bugs found and fixed:**
  1. The dev database was WIN1252, so "→" or Telugu text crashed runs; moved to a UTF-8 database (D-036).
  2. Plugin connection tests pulled Node-only code (nodemailer, Google auth) into the browser bundle and broke the builder pages; those tests now live in a server-only registry.
  3. Turborepo filtered `AI_MOCK` and chain variables out of `pnpm dev`; added `passThroughEnv`.
- **1F Ledger:** `FlowLedgerAnchor.sol` (Hardhat 3, OZ 5.6) with **6/6 contract tests**; `@flowledger/ledger` (JCS, salted hashes, hash chain, Merkle batches, verification layers) with **9/9 tests**; receipts on every final run, an anchorer, the public `/verify/{id}` page (all checks in the browser, plus the contract's own `verifyReceipt()`), and the tamper simulator. **25/25 live checks** (`apps/web/scripts/e2e-ledger.ts`) on a local Hardhat chain. Measured gas: 95,357 (first batch), 78,257 (later), deploy 679,012.
- The production build passes; the dev server's HMR reloads `/verify` in a loop (dev-only, production is fine).

## 2026-10-10 — P1G AI + UI + hardening
- **Copilot** rebuilt as a schema-validated plan with a deterministic builder and a template fallback (D-037). Five templates (hackathon registration, lead scoring, clinic, daily digest, payment webhook). **9/9 unit tests.**
- **Copilot-first home** (`/`): describe an automation or open a template; the canvas then fills node by node.
- **Run Doctor** (D-040) on failed runs: plain-language cause, one-click "Apply fix & test", retry, or reconnect. **3/3 rule tests.**
- Runs panel: trigger badge, **Verify** (opens the receipt) and **Retry** (from the failed step). Form trigger and Delay icons; N-Flow AI nodes no longer ask for a connection.
- **Security:** SSRF guard for HTTP Request (**21/21 tests**); the template's database connection test is disabled (D-041).
- Default Amoy RPC moved to publicnode (D-044). The wallet still had **0 POL** at 10:00, so anchoring on Amoy waits for faucet funding.
- `node scripts/check-keys.mjs` shows which keys are filled (names only). At 10:00 the AI keys were still empty.
- **Gates:** lint clean (220 files), typecheck clean, **109 unit tests** + 6 contract tests, all four live suites green (hive 26, tenancy 60, forms 21, ledger 25).
- **Plan consolidated (10:40):** the owner does every account and key personally (D-046, supersedes the duo split). All upcoming work, with a clock timeline and owners, now lives in [PLAN.md](../PLAN.md). `docs/19` became the owner setup guide. Fixed `.gitignore` so Hardhat build output under `packages/contracts/` is never committed. First push to the public GitHub repo.

## 2026-10-10 (afternoon): hosting on Vercel + Neon (D-047)
- The user asked to host the app (Vercel or Cloudflare), get a complete list of manual work, and focus on **the app only** (no deck or video).
- **Decision:** Vercel (Hobby, sin1) + Neon Postgres 17 (Singapore). Cloudflare Workers rejected (postgres.js TCP, pg-boss workers and SMTP would need an engine rewrite). cloudflared kept only as a fallback.
- **Serverless Hive:** `lib/hive/drain.ts` runs pg-boss workers inside the function that accepted the trigger (`after()`) until the queues go quiet, then anchors. `/api/hive/tick` (Bearer `CRON_SECRET`, cron-job.org every minute) does maintenance, retries, delays, schedule ticks and anchoring. Job handlers moved into `handleRunJob`/`handleDeadJob` (shared with the in-process worker). Smaller DB pools on serverless; `maxDuration` 300 on trigger routes and the SSE route; `vercel.json` region sin1.
- **Cloud scripts:** `pnpm cloud:db` (creates `flowledger_app` with a random password, runs migrations + queues, refuses if the app role bypasses RLS) was dry-run on a fresh local database (passed). `pnpm cloud:env` pushes production env to Vercel by name only.
- **Verified in serverless mode locally:** all four live suites green (hive, forms, tenancy, ledger); anchoring ran from the drain (7 batches); the tick answers 401 without the secret and 202 with it; production build passes.
- PLAN.md rewritten: the owner's 10-step manual list (wallet, Neon, Vercel, Gemini, Telegram, Gmail, Sheets, Alchemy, Connections, cron-job.org) and Claude's steps C1–C8. docs/19 gained Neon, Vercel, Connections and cron sections.
- **No emojis (user request, 10 Oct afternoon):** removed every emoji and check-mark symbol from the app's message templates, the docs, the design preview and the key checker; replaced with words ("Done", "Verified", "Tampered", "[set]/[empty]"). The forms e2e now proves Telugu + Hindi storage instead of an emoji. Unit tests (63) and the forms suite (21) still pass.
- **Renamed to N-Flow (D-048):** every user-visible "FlowLedger" became "N-Flow" (60 files: UI, titles, emails, legal pages, docs). Internal identifiers (`@flowledger/*`, DB roles, env vars, migrations, the `FlowLedgerAnchor` contract) keep the old name.

## 2026-10-10 (evening): landing page, Google sign-in, dashboard (D-049)
- Pushed the hosting + rename work (`cdf4ca9`).
- **Landing (`/`):** three.js hero (an automation graph whose packets flow into a chain of hexagonal ledger blocks; pauses off-screen, honours reduced motion), anime.js headline and "live flow" motion graphic (nodes assemble, edges draw, packets run the hero flow on a loop, a "Verified on-chain" seal stamps), a Merkle-proof graphic with a working tamper toggle, features bento with cursor spotlight, plans (INR, labelled planned), measured stats with count-up, motion (Framer) scroll reveals and parallax.
- **Auth flow:** `/login` (Google first, email fallback); `RequireAuth` gates `/dashboard`, `/build`, `/workflows/*` for guests; the landing prompt carries through sign-in into the Copilot.
- **Dashboard (`/dashboard`, API `/api/dashboard`):** greeting + composer, checklist, stats, workflow cards with filters/search and on/off switches, "Your apps" (bring your own credentials), recent runs with Verify links, log out (also in the builder's user menu, plus a Dashboard link).
- Checked in headless Edge (Playwright): no console errors, the flow-demo state machine runs (`diiiii → driiii → ddrrri → dddddr → dddddd`), tamper turns the path red, no horizontal overflow at 390 px.
- **Scroll fix:** the template's global `overflow:hidden` on html/body now applies only while the builder canvas is mounted; mouse-wheel scrolling works on every other page (`ce00048`).
- **Test-mode Google button (D-050):** until OAuth keys exist, "Continue with Google" signs into a private per-browser demo account via `/api/demo-login`. Checked in headless Edge: click → dashboard, log out → home, click again → the same account. Logout no longer bounces through `/login`.
- **Keys check (owner says all keys are in):** Gemini key works, but `gemini-2.5-flash/pro` are closed to new keys and Pro models have no free quota; switched to `gemini-3.5-flash` (Copilot) and `gemini-3.5-flash-lite` (AI steps, ~1 s). `withAi` now tries the tier's other model on the same provider before the fallback provider (Gemini returned 503 "high demand" often today). Copilot: 4/4 prompts produced real AI plans (8–23 s). Neon: migrations, queues and the `flowledger_app` role (no BYPASSRLS) are in place. Vercel: linked (project `ai-thon`). Amoy: contract deployed at the anchor address, wallet 0.061 POL (~11 batches at 56 gwei). Not found yet: Telegram/Gmail/Sheets connections (none saved locally or in Neon) and Google OAuth keys.
- Dev note: running `pnpm build` while `pnpm dev` is up corrupts the shared `.next` and makes every page reload-loop; stop dev first (or delete `apps/web/.next/dev` and restart).

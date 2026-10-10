# N-Flow — Project Context (read first, every session)

Next, read [docs/00_INDEX.md](docs/00_INDEX.md). For the conversation history so far, read [docs/20_SESSION_LOG.md](docs/20_SESSION_LOG.md).

## What this project is
Our entry for the **TRI-CITY AI HACKATHON** (Centle; Warangal / Hanamkonda / Kazipet). Team name: **Hydra**. Brand: **TRNT BEE**.

Problem statement #5 (submitted 2026-10-09): *"Build a Zapier-like tool where users create automations between forms, sheets, emails and notifications."*
Official MVP scope: workflow builder, triggers, actions, execution logs, a sample workflow, and enable/disable controls.

**N-Flow** is an AI-powered no-code automation platform with **blockchain-verified execution ("Proof-of-Execution")**:
- A user describes an automation in plain English. The AI builds it on a visual canvas.
- Each run executes on our own queue-based engine ("Hive"), and every step is logged.
- Every run produces a hashed receipt. Receipts are batched into a Merkle tree and the root is anchored on Polygon Amoy. Anyone can check on the public verify page that a log was not altered.

## Judging rubric (build for this, in this order)
| Working MVP | AI/SaaS relevance | UI/UX | Market potential | Innovation | Demo & pitch |
|---|---|---|---|---|---|
| **30%** core flow works live | **20%** AI meaningfully improves it | **15%** clear, demo-friendly | **15%** target user + business value | **10%** fresh thinking / strong execution | **10%** problem, solution, future scope |

**Rule #1:** the hero flow (Form → AI → Sheets + Email + Telegram → on-chain receipt → Verify) must work live, every time. Reliability beats feature count.

## Phases
- **P0 Plan** (2026-10-09): all docs in `docs/`, UI design board in `design/`.
- **P1 Build:** parts 1A–1J in [docs/14_PHASE_PLAN.md](docs/14_PHASE_PLAN.md).
  - **1A complete (2026-10-09):** monorepo, template fork, rebrand, security upgrades, DevKit removed, config package.
  - **1B complete (2026-10-09):** workspaces + RBAC (Better Auth org plugin), **Postgres RLS** tenant isolation, envelope-encrypted vault, audit log, scoped/revocable API keys. 35 unit tests + 59-check live e2e.
  - **1C–1G complete (2026-10-09/10):** Hive engine on pg-boss, form/webhook/schedule triggers, Sheets/Gmail/Telegram/AI plugins, Proof-of-Execution (contract, receipts, anchorer, `/verify`), Copilot + templates, Run Doctor. **1H** partial, **1I** deferred (D-034). Details in the session log.
- **36-hour build (D-034):** the user said build all systems without stopping per part; stop only when blocked on keys. **The upcoming plan lives in [PLAN.md](PLAN.md)** (keep it current). The owner does every account and key (D-046, [docs/19](docs/19_OWNER_SETUP.md)).
- **P2 Keys + live wiring:** the user supplies keys.
- **P3 Deploy (Vercel + Neon, D-047), polish.** App only; no deck or video work.

Split each phase into parts, test each part, run an end-of-phase check, then **stop and wait for "next"**.

## Hard rules
- Never read, print, or commit `.env` files or keys. Keys come from env vars only. Use a **testnet-only** wallet, never one holding real funds.
- Keep Apache-2.0 attribution for the base template (`vercel-labs/workflow-builder-template`): NOTICE, README, and the `/legal/open-source` page.
- Never hardcode AI model names. They come from env/config.
- **No personal data on-chain.** Only hashes go on-chain, and personal data inside hashed fields is salted.
- Never claim a number (market size, speed, savings) without a source or a measurement. Label estimates.
- When a decision changes, update [docs/15_DECISIONS.md](docs/15_DECISIONS.md) and the affected docs in the same step.
- **This repo is public.** Never mention the owner's other private projects in code, docs, or commits.

## How to run
- Install: `pnpm install`. First time: `node scripts/dev-env.mjs` (writes `apps/web/.env.local` with fresh secrets; never print or commit it).
- DB: `pnpm db:local` (embedded Postgres 17, :5433, database `flowledger_utf8`, keep running; stop with `pnpm db:stop`), then `pnpm db:migrate` (runs as owner via `DATABASE_ADMIN_URL`; also sets up the pg-boss queues). `db:push` is disabled (RLS lives in SQL migrations).
- The app must connect as `flowledger_app` (`DATABASE_URL`), never the owner, or RLS is bypassed. The server logs `[rls] tenant isolation enforced` at startup.
- New schema change: edit `lib/db/schema.ts` → `pnpm --filter @flowledger/web db:generate` → **add RLS policies for any new tenant table** in a custom migration.
- Tenant code: wrap handlers with `tenantRoute()` (lib/api/route.ts); query with `tdb()` (lib/db/tenant.ts); always filter `workspace_id` explicitly too (public-read policies).
- Live tenancy check: `node scripts/e2e-tenancy.mjs` (needs dev server + DB; creates throwaway *.example.test accounts).
- App: `pnpm dev` → http://localhost:3000 (the Hive worker and anchorer run in-process). Without AI keys: `AI_MOCK=true pnpm dev`.
- Keys: `node scripts/check-keys.mjs` (names only). Wallet: `pnpm --filter @flowledger/web wallet:new`. Deploy the anchor: `pnpm --filter @flowledger/web anchor:deploy [--save]`.
- Local chain: `pnpm --filter @flowledger/contracts chain`, then `CHAIN_ID=31337 CHAIN_RPC_URL=http://127.0.0.1:8545 npx tsx scripts/deploy-anchor.ts` (from apps/web) and start the app with those `CHAIN_*` plus `ANCHOR_CONTRACT_ADDRESS`.
- Live suites (dev server running): `node scripts/e2e-hive.mjs`, `node scripts/e2e-forms.mjs` (needs `AI_MOCK=true` without keys), `node scripts/e2e-tenancy.mjs`, and from apps/web `npx tsx scripts/e2e-ledger.ts` (needs a chain).
- Demo on a production build (`pnpm build` then `next start`): the dev server's HMR reload-loops `/verify`.
- **Hosted (D-047): Vercel + Neon.** On Vercel the Hive is serverless (`HIVE_MODE=serverless`, auto when `VERCEL=1`): triggers drain the queue after the response (`lib/hive/drain.ts`), and `/api/hive/tick` (cron-job.org, `CRON_SECRET`) covers retries, delays, schedules, maintenance and anchoring. Test locally with `HIVE_MODE=serverless CRON_SECRET=… pnpm dev`. Cloud setup: `pnpm cloud:db` (Neon roles, migrations, queues; secrets in `apps/web/.env.cloud.local`), `pnpm cloud:env --url https://….vercel.app [--project name]` (pushes env to Vercel; needs `npx vercel login`).
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (Turborepo).
- Logo assets: `python scripts/brand/make_logo.py`. Template diff: `git diff --no-index --stat .upstream/workflow-builder-template apps/web`.
- Preview: `preview_start {name: "flowledger-web"}` (`.claude/launch.json`).

## Environment
- Windows 11, Node 24.19, npm 11.8, **pnpm 10.34.6**, git 2.55. Repo on `main` with the user's commits; remote `origin` = public `github.com/VarshithRao101/ai-thon`. The user decides on commits and pushes.
- Docker and WSL are **not installed** (Q5). Local Postgres uses embedded-postgres instead (D-023). Writing Python patch scripts through bash heredocs mangles backslashes: use the Edit tool for lines with regexes or `
`.
- Line endings: LF everywhere (`.gitattributes`). Windows autocrlf had converted the template files.

## The user
- Project owner; LPU student; SIH finalist. Wants to win and wants "goated" architecture.
- Prefers planning before building and reusing open source over writing from scratch.
- Wants concise answers unless the problem is hard.

# 14 — Phase Plan

> The live, clock-based plan for the rest of the hackathon is in [PLAN.md](../PLAN.md). This file keeps the original phase breakdown.

Workflow: split each phase into parts → build → **test each part** → end-of-phase check → **stop and wait for "next"**. The hackathon length isn't known yet (Q1), so the times below are relative effort, not clock hours.

## P0 Plan ✅ (2026-10-09)
All docs `00`–`20`, the design board, brand assets, decisions D-001…D-020.

## P1 Build (code-complete with local and mock services; real keys in P2)
| Part | Scope | Tests (exit criteria) |
|---|---|---|
| **1A Scaffold + brand** ✅ 2026-10-09 (see the session log; also D-021…D-025) | Install pnpm. Fork the template at `24fb0fd` into `apps/web` (keep LICENSE, add NOTICE). Turborepo + workspaces, `packages/{engine,ledger,db,config}`, env zod schema. Rebrand: name, metadata, favicon, logo PNG/SVG cutout, gold/black tokens in `globals.css`, fonts. `git init` + `.gitignore` (`.env*`) | `pnpm build`, typecheck and lint are green. App renders with the new theme. No keys needed (PGlite or a dummy env for the build) |
| **1B Data + auth + tenancy** ✅ 2026-10-09 (D-026…D-032) | Drizzle schema extensions (doc 05), migrations, RLS SQL. Better Auth organization plugin (workspaces, roles), Google provider (enabled when keys exist), 2FA (Could). Workspace scoping in all repositories. `requireRole`. Audit events. Envelope-encryption vault upgrade | Unit tests (PGlite): scoping, RBAC matrix, cross-tenant id → 404, encrypt/decrypt/rotate. Migrations apply cleanly |
| **1C Hive engine** ✅ 2026-10-09 (pg-boss, D-033) | `packages/engine` (Kahn scheduler, templates, conditions, retry policy, error classes, validator). Worker/scheduler/anchorer entrypoints (tsup). BullMQ queues, checkpoint/resume, idempotency, circuit breaker, DLQ, heartbeat. Publish/versions, enable/disable. SSE stream. Replace the DevKit `start()` calls | Engine unit suite (doc 07 list). Redis integration tests run in CI service containers. Locally they run when Redis is available, otherwise they're skipped and the skip is reported |
| **1D Triggers** ✅ 2026-10-09 (form + QR, webhook, schedule, manual; D-038, D-043) | Form builder + hosted `/f/[slug]` + QR + consent + honeypot + rate limit. Webhook HMAC/API key + idempotency. Schedule (cron, IST). Manual test run | Route tests: valid, invalid, duplicate, disabled → 409, rate-limited → 429, HMAC bad signature → 401 |
| **1E Integrations** ✅ 2026-10-09 (Sheets, Gmail SMTP, Telegram, AI ×4, Condition, Delay, HTTP; Discord cut by D-034) | Plugins: google-sheets, smtp-email, telegram, discord, notify, ai (5 actions), logic (switch, delay, transform). Each has credentials, steps, test and icon | Per-plugin unit tests with mocked HTTP (msw). Contract tests of step result shapes. Delay durability test |
| **1F Ledger** ✅ 2026-10-09 (D-039) | `contracts/` Hardhat 3: FlowLedgerAnchor + tests + gas report + Ignition deploy. `packages/ledger`: JCS, receipt builder, salted hashes, hash chain, Merkle batches, viem client. Anchorer job. Verify API + public page (browser verification). Tamper simulator + restore | Contract tests (doc 08 list). Proof round-trip in Node *and* the browser bundle. Tamper → layer 3 fails at the right step. Restore → passes. Runs on the Hardhat in-process network, no keys needed |
| **1G AI** ✅ 2026-10-10 (Copilot D-037, Run Doctor D-040; golden set waits for keys) | Provider layer (Gemini/Groq via env), structured copilot ops + validator + self-repair + dagre layout + offline template fallback. AI nodes. Run Doctor. Field mapper. `ai_calls` logging. `eval/copilot-golden.json` + runner | Mock-model unit tests (AI SDK mock provider): schema validation, repair loop, Doctor patch guardrails, offline fallback. Golden set runs in P2 with real keys |
| **1H UI** 🟡 partial (Copilot home, templates, publish/enable, QR, runs Verify/Retry/Doctor, verify page) | All 18 screens (doc 12). Live canvas animation from SSE. Dashboard charts. Verify page animation. Cookie banner + legal pages. Projector mode. Command palette | Playwright smoke: sign-up → template → publish → submit form → run success (mock integrations) → verify page ✓. Screenshots of every screen. Axe accessibility check on key pages |
| **1I Infra** ⏸ deferred by D-034 (Dockerfile/Compose only if time) | Dockerfile (multi-stage, roles), Compose (+profiles), Helm chart + KEDA + NetPol, dev-deps for kind. GitHub Actions: ci, images, kind-e2e, codeql/gitleaks. OTel + prom-client + Grafana dashboard JSON | `helm lint` + `helm template` + kubeconform locally. Compose config validates (`docker compose config` in CI). Full image build + kind e2e run in CI (needs a GitHub repo, Q6) |
| **1J End-of-phase check** | Seed demo workspace + 5 templates + 30 labeled seeded runs. README (Built on / What we built / How to run), NOTICE, docs updated, session log | Full test suite green. Local mock-mode run of the hero flow end to end. Checklist reviewed. **Stop and wait for "next"** |

## P2 Keys + live wiring (needs the user)
All keys are free. The user creates the accounts; the assistant never signs up or handles passwords.
| # | Item | Used for | How (user) |
|---|---|---|---|
| K1 | **Docker Desktop + WSL2** (optional but recommended) | Local full stack, containerization demo | Install as admin, reboot |
| K2 | **Neon** Postgres URL (if no Docker / for cloud) | DB | neon.tech → project → connection string |
| K3 | **Upstash** Redis URL (cloud only) | Queue | upstash.com → Redis DB → `rediss://` URL |
| K4 | **Gemini API key** (+ optional **Groq** key) | AI | aistudio.google.com / console.groq.com |
| K5 | **Gmail app password** on a dedicated sender account | SMTP email | Google Account → 2-Step Verification → App passwords |
| K6 | **Google Cloud service account JSON** + Sheets API enabled + a demo Sheet shared with the SA email | Sheets | console.cloud.google.com |
| K7 | **Telegram bot token** (@BotFather) + group chat id | Telegram | BotFather → /newbot. Add the bot to the team group |
| K8 | **Discord webhook URL** (optional) | Discord | Channel → Integrations → Webhooks |
| K9 | **Google OAuth client** (web) | "Sign in with Google" | Cloud console → Credentials → OAuth client. Redirect `…/api/auth/callback/google` |
| K10 | **Testnet wallet**: a fresh private key with Amoy POL from faucets (Alchemy, QuickNode) | Anchoring | We generate the key locally; the user funds it from faucets. **Testnet only** |
| K11 | **Alchemy** Amoy RPC URL (optional; public RPC as fallback) + **Etherscan API v2 key** (optional, contract verification) | Chain | alchemy.com / etherscan.io |
| K12 | GitHub repo (private), with collaborators for the team | CI, images, kind e2e | Q6 |
| K13 | Vercel + Render accounts (cloud deploy, P3) | Hosting | — |

**P2 tests:**
- The hero flow runs live **10×** in a row. Record p50/p95 latency (measured, so we can say it).
- Contract deployed + verified on Amoy. Anchor gas measured.
- Copilot golden-set pass rate measured on the real model.
- Doctor cases measured.

## P3 Deploy, polish, rehearse
- Cloud deploy (Vercel + Render + Neon + Upstash) **and** the laptop demo stack with tunnel + QR.
- Polish pass on the 6 demo screens. Projector mode. Toasts.
- Pitch deck (10 slides), backup demo video (screen recording), README final.
- **Rehearse the 3-minute demo 5× with a timer.** Each member answers the judge questions for their area.
- Submission package per organizer rules.

## Team roles (to be named, Q2)
Claude writes most of the code. Each human **owns** an area: they test it, understand it, and answer judges about it.
| Role | Owns | Pitch part |
|---|---|---|
| **Lead / Product** (user) | Scope, demo script, business slides | Problem + market + future scope |
| **Backend** | Hive engine, triggers, integrations, API | Architecture slide, reliability Q&A |
| **Blockchain + DevOps** | Contract, ledger, verify page, Docker/K8s/CI | Proof-of-Execution live + infra Q&A |
| **Frontend + AI** | Builder, dashboard, Copilot, Doctor | Live copilot demo, UX Q&A |

# FlowLedger — Development Plan (single source of truth)

All upcoming work lives here. Update this file whenever the plan changes (and log the reason in [docs/15_DECISIONS.md](docs/15_DECISIONS.md)).

- **Event:** TRI-CITY AI Hackathon, 36-hour build from **12:00 IST, 9 Oct 2026** → ends about **00:00 IST, 11 Oct 2026** (confirm the exact submission time on the dashboard).
- **Plan updated:** 10 Oct 2026, 15:00 IST. **Hosting: Vercel + Neon Postgres (D-047).** Scope: **the app only** (no deck or video work).
- **Rule #1:** the hero flow (Form → AI → Sheets + Email + Telegram → on-chain receipt → Verify) must work live on the hosted URL, every time.

## Who does what

| Owner | Does |
|---|---|
| **You (project owner)** | Every account, login and key (list below). Enters connector secrets in the hosted app's **Connections** dialog. Decides commits/pushes. Presents. |
| **Claude** | All code, the cloud database setup, Vercel env vars and deploys (through the Vercel CLI after you log in), tests, live wiring, measurements, docs. |

Secrets never go in chat, GitHub, or screenshots. Platform keys go in `apps/web/.env.local` (Claude syncs them to Vercel from there; values are never printed). Connector secrets go in the app's **Connections** dialog (stored encrypted in the database). Check progress with `pnpm keys:check` (names only).

## Hosting architecture (D-047)

```
Browser / phone ──► Vercel (Next.js 16, region sin1)
                     ├─ UI + API + form/webhook ingress
                     ├─ Hive workers run inside Vercel Functions: every trigger
                     │  enqueues to pg-boss, then drains the queue right after
                     │  the response (Next.js after()); Fluid compute, scale to zero
                     ├─ /api/hive/tick (cron-job.org, every minute): retries,
                     │  delays, schedules, anchoring stragglers, maintenance
                     └─ anchorer: Merkle batch → Polygon Amoy after each run
Neon Postgres 17 (Singapore) ── RLS (flowledger_app role), pg-boss queues, LISTEN/NOTIFY for the live canvas
```

Why not Cloudflare: Workers can't hold our Postgres TCP connections, pg-boss workers or Gmail SMTP without rewriting the engine. Next.js runs natively on Vercel. A Cloudflare tunnel from the laptop stays as a fallback (step L below).

## Your manual list (do in this order, about 70 min)

Click-by-click: [docs/19_OWNER_SETUP.md](docs/19_OWNER_SETUP.md). Tell Claude "**done N**" after each (no values).

| # | Step | Time | Where it goes |
|---|---|---|---|
| **1** | **Fund the testnet wallet** `0xc7aC6059DD12b92E2fff7fea69a008f3a8664dC3` with ≥ 0.2 Amoy POL from several faucets. Start first; faucets have daily limits | 15 min | On-chain |
| **2** | **Neon**: sign up with GitHub → project `flowledger`, Postgres 17, region **AWS Asia Pacific (Singapore)** → Connect → **pooling OFF** → copy the connection string | 5 min | `.env.local`: `CLOUD_DATABASE_ADMIN_URL=` |
| **3** | **Vercel**: sign up with GitHub (Hobby) → Add New → Project → import `VarshithRao101/ai-thon` → **Root Directory = `apps/web`** → Deploy (the first build may fail without env vars; that's expected). Then in the VS Code/Claude terminal run `npx vercel login` | 10 min | Nothing to paste |
| **4** | **Gemini API key** + two model IDs (a Flash and a Pro) from AI Studio | 5 min | `.env.local`: `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_MODEL_FAST`, `AI_MODEL_SMART` |
| **5** | **Telegram bot** (@BotFather) + group "FlowLedger Live" + chat id | 10 min | Keep private; enter in the hosted app → Connections (step 9) |
| **6** | **Gmail app password** on a new demo Gmail (2-Step Verification on) | 10 min | Same as 5 |
| **7** | **Google Cloud service account** (JSON key) + Sheets API + a demo Sheet shared with it as Editor | 15 min | Same as 5 |
| 8 | Optional: **Alchemy** Amoy RPC URL | 5 min | `.env.local`: `CHAIN_RPC_URL` |
| **9** | *(after Claude says "deployed")* Sign up on the hosted URL, open **Connections**, add Telegram, Gmail, Sheets; press each **Test** | 10 min | The hosted app |
| **10** | *(after Claude says "deployed")* **cron-job.org**: free account → new job → URL Claude gives you, every 1 minute, header `Authorization: Bearer <CRON_SECRET>` (copy the value from `apps/web/.env.cloud.local` yourself) | 5 min | cron-job.org |

## Claude's work (starts now; keys wire in as they land)

| Step | What | Needs |
|---|---|---|
| C1 | **Serverless Hive:** drain the queue inside Vercel Functions (`after()`), `/api/hive/tick` with `CRON_SECRET`, anchoring after each run, pg-boss maintenance on tick; laptop dev keeps the in-process worker | nothing |
| C2 | **Vercel config:** `vercel.json` (region sin1, durations), SSE `maxDuration`, small DB pools for serverless, no in-process worker on Vercel | nothing |
| C3 | **Cloud DB script** `pnpm cloud:db`: creates the `flowledger_app` role with a strong random password, runs migrations + queues on Neon, writes the cloud env file (gitignored) | step 2 |
| C4 | **Env sync + deploy** `pnpm cloud:env`: pushes every needed env var to Vercel (sensitive values marked), then a production deploy | steps 3, 4 |
| C5 | **Amoy contract deploy** and anchor env on Vercel | step 1 |
| C6 | **Live wiring on the hosted URL:** each connection test, then the hero flow from a phone on mobile data; fix whatever breaks | steps 5–10 |
| C7 | **Measure** (hosted): submit→done p50/p95 over 10 runs, submit→anchored, Amoy gas per batch, Copilot golden-set score | C6 |
| C8 | **Polish the app:** demo workspace seed, the 6 demo screens at 1920×1080 and on a phone, empty/error states | C6 |

## Timeline (IST, 10 Oct)

| When | Who | What |
|---|---|---|
| 15:00–16:15 | You | Steps 1–8 |
| 15:00–16:30 | Claude | C1, C2, C3 (as soon as step 2 lands), golden set |
| 16:30–17:30 | Claude | C4, C5 → hosted app live; you do steps 9–10 |
| 17:30–19:30 | Claude (+ you testing) | C6 live wiring on the hosted URL |
| 19:30–21:00 | Claude | C7, C8 |
| 21:00–22:00 | You | Run the demo flow on the hosted URL ×3 with a timer |
| **22:00** | — | **Code freeze.** Only demo-breaking fixes after this |
| 22:00–23:30 | You | Submit: repo, README, hosted URL |

## Fallback ladder

1. **Vercel deploy broken:** run on the laptop (`pnpm demo`) against Neon, expose with `cloudflared tunnel --url http://localhost:3000` (L: `winget install Cloudflare.cloudflared`).
2. **Amoy slow or unfunded:** local Hardhat chain on the laptop (fallback 1 only); say honestly it is a local chain.
3. **AI down or rate-limited:** the Copilot falls back to templates; AI steps fail clearly and Run Doctor explains.
4. **Gmail blocked from the cloud:** show the step log and Run Doctor's diagnosis.
5. **Internet down:** everything on localhost (embedded Postgres, local chain, AI mock).

## Known gaps (say them honestly if asked)

- Delivery is at-least-once: a network drop after Gmail or Sheets accepted a request can duplicate it (D-019).
- SSRF guard can be bypassed by DNS rebinding between check and connect (D-041).
- The anchorer does not yet recover a batch stuck in `submitted` after a crash mid-transaction.
- On Vercel, retries with backoff and delays resume on the next minute tick (cron-job.org), not to the second.
- Legal pages are templates, not legal advice.

## Commands

```bash
pnpm db:local                 # laptop Postgres (keep running)
pnpm dev                      # laptop dev server (AI_MOCK=true without keys)
pnpm keys:check               # which keys are filled (names only)
pnpm cloud:db                 # Neon: roles, migrations, queues (Claude)
pnpm cloud:env                # sync env to Vercel + deploy (Claude)
pnpm typecheck && pnpm lint && pnpm test   # gates
```

# FlowLedger — Development Plan (single source of truth)

All upcoming work lives here. Update this file whenever the plan changes (and log the reason in [docs/15_DECISIONS.md](docs/15_DECISIONS.md)).

- **Event:** TRI-CITY AI Hackathon, 36-hour build from **12:00 IST, 9 Oct 2026** → ends about **00:00 IST, 11 Oct 2026** (confirm the exact submission time on the dashboard).
- **Plan updated:** 10 Oct 2026, 10:40 IST.
- **Rule #1:** the hero flow (Form → AI → Sheets + Email + Telegram → on-chain receipt → Verify) must work live, every time. Reliability beats feature count.

## Who does what

| Owner | Does |
|---|---|
| **You (project owner)** | Every account and key: testnet wallet funding, Gemini, Telegram bot, Gmail app password, Google Cloud + Sheet, Alchemy (optional), cloudflared. Enters connector secrets in the app. Decides commits/pushes. Presents. |
| **Claude** | All code, tests, live wiring as each key lands, measurements, docs, deck numbers, rehearsal script. |

Secrets never go in chat, GitHub, or screenshots. Platform keys go in `apps/web/.env.local`; connector secrets go in the app's **Connections** dialog (stored encrypted). Check progress any time with `pnpm keys:check` (shows names only).

## Where we are (done and tested)

| Part | Status |
|---|---|
| 1A Scaffold, brand, security upgrades | ✅ |
| 1B Workspaces, RBAC, Postgres RLS, encrypted vault, API keys | ✅ 60 live checks |
| 1C Hive engine (pg-boss): retries, durable waits, DLQ, resume, publish/enable | ✅ 26 live checks |
| 1D Triggers: hosted form + QR, webhook, schedule, manual | ✅ 21 live checks |
| 1E Integrations: Sheets, Gmail SMTP, Telegram, AI (classify, draft, extract, generate) | ✅ code + mocks; **live test needs keys** |
| 1F Proof-of-Execution: contract, receipts, anchorer, `/verify`, tamper demo | ✅ 25 live checks on a local chain; **Amoy needs funds** |
| 1G AI Copilot + templates, Run Doctor | ✅ unit tests; **real-model test needs Gemini key** |
| 1H UI: Copilot home, live canvas, runs panel, verify page, legal pages | 🟡 core done; polish pending |
| 1I Infra (Docker/Helm/OTel) | ⏸ cut for time (D-034) |
| Gates | ✅ lint, typecheck, 109 unit + 6 contract tests, production build, `pnpm audit --prod` = 0 |
| Pitch deck (10 slides) | ✅ draft; placeholders to fill (names, Amoy gas, Copilot score, Zapier price check) |

## Timeline (IST, 10 Oct)

| When | Who | What | Done when |
|---|---|---|---|
| **10:45–12:00** | You | **Block A: accounts and keys** (steps A1–A7 below, in order) | `pnpm keys:check` shows all required keys, and each connection's **Test** button passes |
| 10:45–12:00 | Claude | Golden prompt set + runner for the Copilot; Amoy deploy script dry run; demo seed script | Ready to run the moment keys land |
| **12:00–14:00** | Claude (+ you watching) | **Block B: live wiring.** Each integration tested alone, then the hero flow end to end on Amoy | One real form submission → row in Sheet, email received, Telegram message, receipt anchored, `/verify` all green with a Polygonscan link |
| **14:00–15:00** | Claude | **Block C: measure.** Hero flow ×10: p50/p95 time to "all steps done" and to "anchored"; Amoy gas per batch; Copilot golden-set score | Numbers in the deck and docs (measured, not estimated) |
| **15:00–16:30** | You + Claude | **Block D: stage setup.** cloudflared tunnel → `PUBLIC_APP_URL`; `pnpm demo` (production build); phone test over mobile data (not Wi-Fi); QR on screen and on paper | A phone outside the laptop's network submits the form and sees the thank-you + proof link |
| **16:30–18:30** | Claude | **Block E: polish.** The 6 demo screens (home, canvas, form, runs, verify, Doctor); demo workspace seed; projector-size check; small UX fixes from rehearsals | Screenshots of each screen look right at 1920×1080 and on a phone |
| **18:30–19:30** | You | **Block F: backup.** Record a 90-second screen video of the full flow; export the deck as PDF + PPTX | Files saved in two places |
| **19:30–22:00** | You (Claude on call) | **Block G: rehearse.** 3-minute demo ×5 with a timer; fallback drills (chain flip, AI down, no internet); judge Q&A from [docs/17](docs/17_DEMO_AND_PITCH.md) | Under 3:00 twice in a row with no fumbles |
| **22:00** | — | **Code freeze.** Only fixes for demo-breaking bugs after this | — |
| **22:00–23:30** | You | **Block H: submit.** Repo public and pushed, README current, deck, video, live URL (whatever the dashboard asks for) | Submission confirmed on the dashboard |

## Block A — your setup checklist (about 75 minutes)

Full click-by-click instructions: [docs/19_OWNER_SETUP.md](docs/19_OWNER_SETUP.md).

| # | Step | Time | Where it goes |
|---|---|---|---|
| A1 | **Fund the testnet wallet** `0xc7aC6059DD12b92E2fff7fea69a008f3a8664dC3` with Amoy POL (≥ 0.2) from several faucets. Start first; faucets have daily limits | 15 min | On-chain (nothing to paste) |
| A2 | **Gemini API key** + two model IDs (a "Flash" and a "Pro") from AI Studio | 5 min | `.env.local`: `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_MODEL_FAST`, `AI_MODEL_SMART` |
| A3 | **Telegram bot** (@BotFather) + group "FlowLedger Live" + chat id | 10 min | App → Connections → Telegram |
| A4 | **Gmail app password** on a new demo Gmail (2-Step Verification on) | 10 min | App → Connections → Email (Gmail) |
| A5 | **Google Cloud service account** (JSON key) + Sheets API + a demo Sheet shared with it as Editor | 20 min | App → Connections → Google Sheets |
| A6 | Optional: **Alchemy** Amoy RPC URL (more reliable than public RPCs) | 5 min | `.env.local`: `CHAIN_RPC_URL` |
| A7 | **cloudflared**: `winget install Cloudflare.cloudflared` | 5 min | Used in Block D |

Tell Claude "keys done" (no values). Claude then restarts the server, runs `pnpm keys:check`, and starts Block B.

## Block B — live wiring (Claude)

1. Restart with real keys (no `AI_MOCK`). Copilot: one real prompt → valid workflow; AI steps return real classifications and drafts.
2. Test each connection with its **Test** button, then one test run per integration.
3. Deploy the anchor to Amoy: `pnpm --filter @flowledger/web anchor:deploy --save`, restart, confirm `[ledger] batch … anchored` and the Polygonscan link on `/verify`.
4. Hero flow from the Copilot home → publish → submit from a phone → canvas lights up → Sheet/email/Telegram arrive → receipt anchored → `/verify` green → tamper → red with the step named → restore.
5. Anything that breaks: fix, add a test, re-run the four live suites.

## Block C — measurements to record (no number goes on a slide unmeasured)

| Metric | How |
|---|---|
| Time from submit to "all steps done" (p50/p95, 10 runs) | Run timestamps from the runs API |
| Time from submit to "anchored" | Receipt `anchoredAt` minus submit time |
| Amoy gas per batch, and POL cost | Transaction receipts on Polygonscan |
| Copilot golden-set score (x/20 valid + sensible workflows) | `eval/copilot-golden.json` runner |
| AI classify agreement on 10 sample ideas | Manual check, written down |

## Block D — stage setup

- `cloudflared tunnel --url http://localhost:3000` → copy the `https://….trycloudflare.com` URL into `PUBLIC_APP_URL` in `.env.local`, then `pnpm demo`. The QR code and email proof links then use the public URL.
- Phone on **mobile data** submits the form; laptop on a hotspot as Wi-Fi backup.
- Keep these tabs open: the Sheet, the Telegram group, the demo Gmail inbox, Polygonscan.

## Fallback ladder (practise each once)

1. **Amoy slow or unfunded:** `pnpm chain` + local deploy, start with the local `CHAIN_*` values; say honestly it is a local chain.
2. **AI down or rate-limited:** the Copilot falls back to templates automatically; AI steps fail clearly and Run Doctor explains.
3. **Gmail blocked:** show the step log and Run Doctor's diagnosis; say so honestly.
4. **Internet down:** everything on localhost (local chain, AI mock) on the laptop's own screen.
5. **Total failure:** the recorded backup video.

## Backlog (only if blocks finish early, in this order)

1. Copilot golden-set runner (Block C needs it). *(Claude, before keys land)*
2. Demo seed script: a demo workspace with the hero workflow published and a few anchored runs.
3. Verify page: live update while "Pending anchor" (currently polls every 4 s; fine).
4. Fix the dev-server reload loop on `/verify` (dev only; production is fine).
5. Dockerfile + Compose for the "containerized" story (D-034 cut).
6. Telugu/Hindi Copilot prompts demo line.

## Known gaps (say them honestly if asked)

- Delivery is at-least-once: a network drop after Gmail or Sheets accepted a request can duplicate it (D-019).
- SSRF guard can be bypassed by DNS rebinding between check and connect (D-041).
- The anchorer does not yet recover a batch stuck in `submitted` after a crash mid-transaction (receipts stay pending until released manually).
- Legal pages are templates, not legal advice.

## Commands

```bash
pnpm db:local                 # Postgres (keep running)
pnpm db:migrate               # migrations + queues
pnpm dev                      # dev server (AI_MOCK=true without keys)
pnpm demo                     # production build + start (use on stage)
pnpm keys:check               # which keys are filled (names only)
pnpm chain                    # local Hardhat chain (fallback)
pnpm typecheck && pnpm lint && pnpm test   # gates
```

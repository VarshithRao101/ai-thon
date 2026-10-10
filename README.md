<p align="center"><img src="brand/bee-mark-honey.png" width="96" alt="TRNT BEE"></p>

<h1 align="center">ZETA</h1>
<p align="center"><b>Automate anything. Prove everything.</b><br>AI-powered no-code automation with blockchain-verified execution. By TRNT BEE (Team Hydra).</p>

---

ZETA lets anyone describe an automation in plain English ("when someone registers, save them to a sheet, email them and alert my team on Telegram"). The AI Copilot builds it on a visual canvas. The Hive engine runs it reliably on queue-backed workers. Every run gets a cryptographic receipt, anchored on Polygon, that anyone can verify in their own browser.

Built for the TRI-CITY AI HACKATHON, problem statement #5 (Zapier-like automation between forms, sheets, emails and notifications).

## Status
Phases 1A–1G are built and tested: the Hive engine, hosted forms, the Sheets/Gmail/Telegram/AI integrations, Proof-of-Execution (contract, receipts, anchoring, `/verify`), the Copilot and Run Doctor. Live wiring with real keys and the Amoy deployment are in progress. The upcoming plan is in [PLAN.md](PLAN.md); the design docs are in [docs/](docs/00_INDEX.md), and progress is in [docs/20_SESSION_LOG.md](docs/20_SESSION_LOG.md).

## Quick start (Windows/macOS/Linux, no Docker needed)
```bash
pnpm install
node scripts/dev-env.mjs      # writes apps/web/.env.local with fresh local secrets
pnpm db:local                 # local PostgreSQL 17 on :5433 (keep running; pnpm db:stop to stop)
pnpm db:migrate               # schema + row-level security, applied as the owner role
pnpm dev                      # http://localhost:3000 (AI_MOCK=true pnpm dev without AI keys)
pnpm keys:check               # which keys are filled in (names only, never values)
```
Live checks (dev server running): `node scripts/e2e-hive.mjs` (26), `node scripts/e2e-forms.mjs` (21), `node scripts/e2e-tenancy.mjs` (60), and with a chain (`pnpm chain` + `anchor:deploy`) `cd apps/web && npx tsx scripts/e2e-ledger.ts` (25).
Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. For a demo, use `pnpm demo` (production build).

## Monorepo
| Path | What |
|---|---|
| `apps/web` | Next.js 16 app: UI, API, trigger ingress |
| `packages/config` | Typed, validated env per process role (`web`, `worker`, `scheduler`, `anchorer`) |
| `packages/engine` | Hive: a pure-TypeScript DAG scheduler (OR-joins, branches, retries with jitter, circuit breaker, checkpoint/resume) |
| `packages/ledger` | Proof-of-Execution: RFC 8785 JSON, salted hashes, hash chain, Merkle batches, verification layers (Node and browser) |
| `packages/contracts` | `FlowLedgerAnchor.sol` (OpenZeppelin 5, Hardhat 3) and its tests |
| `docs/` | Architecture, DB, API, engine, ledger, AI, security, infra, UI, business, plan |
| `design/` | UI design board |
| `brand/` | TRNT BEE bee mark (PNG/SVG) and generator script (`scripts/brand/make_logo.py`) |

## Built on (attribution)
- [vercel-labs/workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template) (Apache-2.0), commit `24fb0fd`. It provides the canvas, Better Auth, Drizzle schema, plugin system and AI generation. See [NOTICE](NOTICE).
- Libraries: React Flow, Better Auth, Drizzle, shadcn/ui, AI SDK, and others listed in [docs/04_REUSE_PLAN.md](docs/04_REUSE_PLAN.md).

## What we built
This list is updated as each phase lands.
- **1A:**
  - Monorepo (pnpm + Turborepo) and the TRNT BEE brand system (black, honey and gold tokens; Sora, Inter and JetBrains Mono fonts; bee mark).
  - Removed the beta Workflow DevKit runtime and added a single dispatch seam for the Hive engine.
  - Security upgrades (Next 16.4, React 19.2.8, Better Auth 1.7, Drizzle 0.45; the audit went from 231 findings, including 8 critical, to 2 low, and to **0** for production dependencies on 2026-10-10).
  - Validated env config package and a local Postgres that runs without Docker.
- **1B:**
  - Workspaces with owner/admin/editor/viewer roles (Better Auth organization plugin), invitations, and guests who keep their work when they sign up.
  - **Postgres row-level security:** the app runs as a least-privilege role, every query is scoped to the active workspace, cross-tenant ids return 404, and API keys resolve through one audited SECURITY DEFINER function.
  - Envelope-encrypted credential vault: a per-workspace data key, versioned master keys, AAD binding and O(1) rotation.
  - Audit log, scoped and revocable `flk_` API keys, `/api/me` permissions.
- **1C–1G:**
  - **Hive engine** on Postgres (pg-boss): queued runs, retries with backoff, durable Delay waits, a dead-letter queue, resume from the failed step, idempotent triggers, publish → immutable versions, enable/disable, and live run events streamed to the canvas.
  - **Triggers:** hosted forms with QR codes, consent, a bot trap and rate limits; webhooks with API keys and idempotency keys; schedules (IST cron).
  - **Integrations:** Google Sheets (service account), email via Gmail SMTP, Telegram, and ZETA AI (classify, draft email, extract, generate; Gemini with a Groq fallback; models from config).
  - **Proof-of-Execution:** a receipt for every run, Merkle batches anchored by `FlowLedgerAnchor`, a public `/verify` page that checks everything in the browser (including the contract's own `verifyReceipt()`), and a recorded tamper simulator.
  - **AI Copilot** (a schema-validated plan built deterministically, with five templates as the offline fallback) and **Run Doctor** (plain-language diagnosis and one-click fixes).
  - **Hardening:** SSRF guard for HTTP steps, UTF-8 and UTC database defaults, legal pages (privacy, DPDP notice, terms, cookies, security, open source).

## License
Apache-2.0 (inherited from the base template). See `apps/web/LICENSE` and [NOTICE](NOTICE).

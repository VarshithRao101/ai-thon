# 04 — Reuse Plan (GitHub)

Goal: pull about 70% from proven open source, and write the parts that win points ourselves. Star counts and licenses were checked with the GitHub API on **2026-10-09**.

## Base: fork
| Repo | License | Stars | Last push | What we take |
|---|---|---|---|---|
| [vercel-labs/workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template) | **Apache-2.0** (LICENSE file; the GitHub API shows NOASSERTION) | 1.2k | 2026-08-05 (we forked commit `24fb0fd`) | Next.js 16 + React 19 app, React Flow canvas, Better Auth, Drizzle/Postgres schema, plugin system (credentials, steps, tests), AI workflow generation, executions + logs, webhook trigger, API keys, AES-256-GCM credential encryption, code export, Playwright e2e |

**What we replace or add:**
- **Replace:** its Workflow DevKit runtime (`workflow@4.0.1-beta`) with our own Hive engine on BullMQ, run in separate workers.
- **Add:**
  - workspaces/RBAC, forms, the ledger and the new integrations
  - Run Doctor and the field mapper
  - the new UI theme and the infra
- **Keep:** the LICENSE, plus a `NOTICE` file and README attribution, as Apache-2.0 §4 requires.

## Libraries we pull in
| Area | Repo | License | Stars | Use |
|---|---|---|---|---|
| Canvas | [xyflow/xyflow](https://github.com/xyflow/xyflow) (React Flow) | MIT | 38.6k | Builder canvas (already in base) |
| Queue | [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq) | MIT | 9.5k | Hive engine queues, retries, repeatable jobs, flows |
| Queue UI | [felixmosh/bull-board](https://github.com/felixmosh/bull-board) | MIT | 3.5k | Admin → System → Queues panel |
| Queue (alt) | [timgit/pg-boss](https://github.com/timgit/pg-boss) | MIT | 4.0k | Fallback driver if we run without Redis |
| Auth | [better-auth/better-auth](https://github.com/better-auth/better-auth) | MIT | 30.2k | Sessions, Google OAuth, organization plugin, 2FA, rate limit (already in base) |
| ORM | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | Apache-2.0 | 36.0k | Schema + migrations (already in base) |
| UI kit | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | 125k | Components (already in base), re-themed gold/black |
| Motion | [motiondivision/motion](https://github.com/motiondivision/motion) | MIT | 33.9k | Page and node animations (already in base) |
| Effects | [magicuidesign/magicui](https://github.com/magicuidesign/magicui) | MIT | 22.5k | Animated Beam (landing integrations), Border Beam, Number Ticker, Shimmer Button |
| Charts | [recharts/recharts](https://github.com/recharts/recharts) | MIT | 27.6k | Dashboard analytics |
| AI | [vercel/ai](https://github.com/vercel/ai) (AI SDK) | Apache-2.0 | 27.2k | `generateObject` / `streamText` with Google (Gemini) and Groq providers |
| Contracts | [OpenZeppelin/openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) | MIT | 27.3k | `AccessControl`, `Pausable`, `MerkleProof` |
| Merkle | [OpenZeppelin/merkle-tree](https://github.com/OpenZeppelin/merkle-tree) | MIT | 0.5k | `StandardMerkleTree` (same leaf encoding as `MerkleProof.sol`) |
| Chain client | [wevm/viem](https://github.com/wevm/viem) | MIT | 3.6k | Anchoring transactions, plus in-browser verification |
| Contract toolchain | [NomicFoundation/hardhat](https://github.com/NomicFoundation/hardhat) | MIT | 8.5k | Compile, test, deploy, local node (pure npm, no Docker) |
| Local chain | [foundry-rs/foundry](https://github.com/foundry-rs/foundry) (anvil image) | MIT / Apache-2.0 | 10.6k | `anvil` container in Compose as the Amoy fallback |
| Sheets | [theoephraim/node-google-spreadsheet](https://github.com/theoephraim/node-google-spreadsheet) | MIT | 2.5k | Append, lookup and update rows with a service account |
| Google auth | [googleapis/google-api-nodejs-client](https://github.com/googleapis/google-api-nodejs-client) (`google-auth-library`) | Apache-2.0 | 12.3k | Service-account JWT |
| Email | [nodemailer/nodemailer](https://github.com/nodemailer/nodemailer) | MIT-0 | 17.7k | SMTP (Gmail app password); Mailpit in dev |
| Mail catcher | [axllent/mailpit](https://github.com/axllent/mailpit) | MIT | 10.6k | Dev and offline SMTP inbox in Compose |
| Telegram | [grammyjs/grammY](https://github.com/grammyjs/grammY) | MIT | 3.8k | Bot API client (plain `fetch` also works) |
| API docs | [scalar/scalar](https://github.com/scalar/scalar) + [asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) | MIT | 16.2k / 1.6k | `/docs/api` OpenAPI reference generated from our zod schemas |
| Rate limit | [upstash/ratelimit-js](https://github.com/upstash/ratelimit-js) | MIT | 2.1k | Sliding-window limits on forms, webhooks and AI |
| Tracing | [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) | Apache-2.0 | 3.5k | Traces from web → queue → worker → step |
| Metrics | prom-client (siimon/prom-client) | Apache-2.0 | — | `/metrics` for Prometheus |
| Autoscaling | [kedacore/keda](https://github.com/kedacore/keda) | Apache-2.0 | 10.6k | Scale workers on Redis queue length |
| K8s test | [kubernetes-sigs/kind](https://github.com/kubernetes-sigs/kind) | Apache-2.0 | 15.5k | CI spins up a cluster and installs our Helm chart |
| Charts | [helm/helm](https://github.com/helm/helm) | Apache-2.0 | 30.3k | Helm chart packaging |
| Tunnel | [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared) | Apache-2.0 | 16.1k | Public HTTPS URL for the laptop demo (quick tunnel, no account) |
| Embedded PG | [electric-sql/pglite](https://github.com/electric-sql/pglite) | Apache-2.0 | 16.1k | Unit tests for the DB layer without Docker |

## Considered and rejected
| Repo | Why not |
|---|---|
| n8n-io/n8n (207k ★) | Sustainable Use License, not OSI open source. It restricts offering n8n as a paid SaaS, which kills our business model. Judges also know it. |
| activepieces/activepieces (25k ★) | The Community Edition is MIT, but it's a huge Nx monorepo with mixed MIT and commercial "EE" code. Rebranding it would be hard to defend as our own work and slow to change. We may *read* its piece designs for reference (MIT). |
| automatisch/automatisch (14k ★) | AGPL-3.0 plus EE code: copyleft obligations for the SaaS. |
| simstudioai/sim (29.8k ★), triggerdotdev/trigger.dev (16.5k ★) | Apache-2.0 and good, but they are AI-agent builders or code-first job platforms. Too large to adapt, and they don't match the forms → sheets → email scope. |
| vercel/workflow (Workflow DevKit, Apache-2.0) | The base template's current runtime. Replaced by Hive for control, self-hosting and the queue/KEDA story (D-004). |
| Ready-made tamper-evident log projects (etchlog AGPL, bbva/qed stale since 2020) | License or staleness. Our ledger is small and better written ourselves on OpenZeppelin primitives. |

## Attribution rules
- `NOTICE` lists the base template plus every Apache-2.0 dependency we vendor code from.
- `/legal/open-source` renders an auto-generated license list (`license-checker` output at build time).
- The README has a "Built on" section and a "What we built" section, which also go on a pitch slide.

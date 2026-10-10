# 03 — Architecture

## Style
N-Flow is a **modular monolith with independently scalable process roles**. There is one TypeScript codebase in a pnpm/Turborepo monorepo, built into **one container image** that starts in one of four roles:

| Role | Command | Scales by | Responsibility |
|---|---|---|---|
| `web` | `next start` | CPU (HPA) | UI, API layer for the frontend, auth, ingress for triggers (forms/webhooks), SSE live events, public verify page |
| `worker` ("Worker Bees") | `node dist/worker.js` | Queue depth (KEDA) | Consumes `runs` jobs, executes workflow DAGs, writes step logs, emits events, builds receipts |
| `scheduler` | `node dist/scheduler.js` | 1 replica (leader) | Turns cron schedules into BullMQ repeatable jobs, sweeps retention, reconciles stuck runs |
| `anchorer` | `node dist/anchorer.js` | 1 replica (leader) | Batches receipts into a Merkle tree and anchors the root on Polygon Amoy, then confirms the transaction |

Why this design: we get microservice-style deployment (separate scaling, isolated failures, clear boundaries) without the cost of network calls between our own services, which matters in a hackathon.

## System context
```mermaid
flowchart LR
  U[Workspace user<br/>browser] -->|HTTPS + session cookie| WEB
  V[Form visitor / judge phone] -->|public form| WEB
  EXT[External system] -->|webhook + HMAC| WEB
  P[Anyone with a receipt] -->|/verify| WEB
  P -. reads root directly .-> CHAIN
  subgraph N-Flow
    WEB[web<br/>Next.js 16]
    Q[(Redis<br/>BullMQ queues + pub/sub)]
    W[worker xN<br/>Hive engine]
    S[scheduler]
    A[anchorer]
    DB[(PostgreSQL 17)]
  end
  WEB --> DB
  WEB -->|enqueue| Q
  Q --> W
  S --> Q
  W --> DB
  W -->|events| Q
  Q -->|SSE fan-out| WEB
  A --> DB
  A -->|anchor root| CHAIN[(Polygon Amoy<br/>FlowLedgerAnchor.sol)]
  W --> GS[Google Sheets API]
  W --> SMTP[SMTP / Gmail]
  W --> TG[Telegram Bot API]
  W --> DC[Discord / Slack webhooks]
  W --> LLM[LLM API<br/>Gemini / Groq via AI SDK]
  WEB --> LLM
```

## Container view (local `docker compose up`)
```mermaid
flowchart TB
  subgraph app[App images: ghcr.io/hydra/flowledger]
    web[web :3000]
    worker1[worker #1]
    worker2[worker #2]
    sched[scheduler]
    anch[anchorer]
  end
  pg[(postgres:17 :5432)]
  rd[(redis:7 :6379)]
  anvil[anvil local chain :8545<br/>fallback for Amoy]
  mail[mailpit :8025<br/>SMTP catcher, dev only]
  subgraph obs[profile: observability]
    otel[otel-collector]
    jaeger[jaeger :16686]
    prom[prometheus :9090]
    graf[grafana :3001]
  end
  tunnel[cloudflared<br/>profile: tunnel]
  web --> pg & rd
  worker1 & worker2 --> pg & rd
  sched --> rd & pg
  anch --> pg & anvil
  web & worker1 & worker2 --> otel --> jaeger
  prom --> web & worker1 & worker2
  graf --> prom
  tunnel --> web
```

## Hero data flow: form submission → verified receipt
```mermaid
sequenceDiagram
  autonumber
  participant J as Judge phone
  participant WEB as web
  participant DB as Postgres
  participant R as Redis/BullMQ
  participant W as worker
  participant X as Sheets/SMTP/Telegram/LLM
  participant A as anchorer
  participant C as Amoy contract
  J->>WEB: POST /api/forms/{slug}/submit (consent given)
  WEB->>WEB: rate-limit, honeypot, zod-validate
  WEB->>DB: insert form_submission + execution(status=queued, idempotency key)
  WEB->>R: add job runs:{executionId} (traceparent)
  WEB-->>J: 200 "Thanks!" (under 300 ms target)
  R->>W: deliver job
  W->>DB: load published workflow version
  loop each node in DAG order (parallel branches)
    W->>R: publish exec:{id} step.started
    W->>X: call integration (retry, backoff, circuit breaker)
    W->>DB: insert step log (redacted I/O + sha256 hashes)
    W->>R: publish step.succeeded / step.failed
  end
  W->>DB: execution=success, receipt (canonical JSON, leaf hash, prevHash)
  W->>R: publish run.completed
  A->>DB: every 30 s: pending receipts
  A->>A: build Merkle tree (OZ StandardMerkleTree)
  A->>C: anchor(root, leafCount)
  C-->>A: tx hash, BatchAnchored event
  A->>DB: batch confirmed, proofs stored
  Note over J,C: /verify/{executionId}: the browser recomputes the leaf, checks the proof, and reads the root from the chain via public RPC.
```

## Live updates
- The worker publishes events to the Redis channel `exec:{executionId}` and to `ws:{workspaceId}` (for the dashboard feed).
- `GET /api/executions/{id}/stream` is a Server-Sent Events (SSE) endpoint. It subscribes to the channel and forwards events. The canvas highlights nodes as events arrive.
- Fallback: poll `/status` every 1.5 s (the base template already does this).

## Multi-tenancy
- Every tenant-owned row has `workspace_id`. The data-access layer injects the workspace from the session, and handlers never trust a workspace id sent by the client.
- Defense in depth: Postgres row-level security (RLS) policies use `current_setting('app.workspace_id')`, set per transaction. Public endpoints (form submit, verify) go through narrow server functions.
- Each workspace has its own Redis key prefix and its own rate-limit buckets.

## Scaling and resilience
| Concern | Design |
|---|---|
| Burst of submissions | Ingress only writes and enqueues. Workers scale on queue depth: KEDA watches the Redis list `bull:runs:wait`. |
| Slow or flaky integration | Per-step timeout, exponential backoff with jitter (3 tries), a circuit breaker per integration and workspace, then the DLQ. |
| Worker crash mid-run | BullMQ detects the stalled job and redelivers it. Steps already succeeded (checkpointed in the DB) are skipped on resume, using `(execution_id, node_id)` as the idempotency key. |
| Duplicate webhook | An `Idempotency-Key` header (or a hash of the body) is unique per workflow for 24 h. The duplicate returns the original `executionId`. |
| Chain down or slow | Receipts stay `pending` and the anchorer retries. Runs never block on the chain, and the verify page shows "pending anchor". |
| DB down | Readiness probe fails, traffic drains, and the queue buffers work. |

## Repo layout (P1A)
```
flowledger/
  apps/
    web/                 # Next.js 16 app (fork of workflow-builder-template)
      app/ components/ lib/ plugins/   # plugins = integrations (UI metadata + step code)
      worker/            # entrypoints: worker.ts, scheduler.ts, anchorer.ts (bundled by tsup)
  packages/
    engine/              # pure-TS DAG executor, template resolution, retry policy
    ledger/              # canonical JSON, receipt hashing, Merkle, viem contract client
    db/                  # Drizzle schema, migrations, RLS SQL, seed
    config/              # zod env schema, shared tsconfig
  contracts/             # Hardhat 3 project: FlowLedgerAnchor.sol + tests + deploy
  deploy/
    docker/              # Dockerfile (multi-stage), .dockerignore
    compose/             # docker-compose.yml (+ observability, tunnel profiles)
    helm/flowledger/     # Helm chart: Deployments, HPA, KEDA ScaledObject, Ingress, NetPol, PDB
    observability/       # prometheus.yml, grafana dashboards, otel-collector.yaml
  .github/workflows/     # ci.yml, images.yml, kind-e2e.yml, codeql.yml
  docs/ design/ brand/
```

# 11 — Infra and DevOps

## Tooling
- **pnpm workspaces + Turborepo** (cached `build`, `lint`, `typecheck`, `test` pipelines).
- **Node 24 LTS** everywhere (`.node-version` + `engines`).
- Lint/format: Biome via Ultracite (inherited from the base). Types: `tsc --noEmit`.
- Tests:
  - **vitest** for unit and integration
  - **Playwright** for e2e (the base already has a spec)
  - **Hardhat** for contracts
- **tsup** bundles the worker, scheduler and anchorer entrypoints. They run with `--conditions=react-server`, so the base's `server-only` imports resolve to no-ops outside Next.js.

## Environments
| Env | Where | Data | Chain |
|---|---|---|---|
| `dev` | Laptop: `pnpm db:local` (embedded Postgres 17 on :5433, no Docker, D-023; roles `flowledger` owner + `flowledger_app` app) → `pnpm db:migrate` → `pnpm dev` (web) + `pnpm dev:worker` (1C). Stop the DB with `pnpm db:stop`. Redis from Compose or Upstash until there's a Windows-native option | Seeded demo | anvil (local) |
| `demo` | Laptop: `docker compose --profile tunnel up` + Cloudflare quick tunnel gives a public HTTPS URL for the judge's phone | Seeded + live | **Polygon Amoy** |
| `cloud` | Vercel (web) + Render (worker image) + Neon (Postgres) + Upstash (Redis) | Live | Polygon Amoy |
| `k8s` | kind in CI (proves the chart works). Any cluster later | Ephemeral | anvil |

## Container image (`deploy/docker/Dockerfile`)
- **Multi-stage build:**
  1. `base`: `node:24-bookworm-slim` pinned by digest, corepack pnpm.
  2. `deps`: `pnpm fetch` with a BuildKit cache mount.
  3. `build`: `turbo build` → Next.js `output: "standalone"` + tsup bundles.
  4. `runtime`: distroless-style slim base, **non-root uid 10001**, `tini` as PID 1, read-only root filesystem friendly.
- One image, **role picked by `CMD`**: `web` | `worker` | `scheduler` | `anchorer` | `migrate`.
- `HEALTHCHECK` hits `/api/health` (web) or a worker metrics-port ping.
- OCI labels, **SBOM** + provenance attestations (`docker buildx --sbom=true --provenance=true`), **Trivy** scan gate (fails on HIGH/CRITICAL with a fix available).

## Docker Compose (`deploy/compose/docker-compose.yml`)
| Service | Image | Port | Profile |
|---|---|---|---|
| `migrate` | app (`CMD migrate`) | — | default (runs once, `service_completed_successfully` gate) |
| `web` | app | 3000 | default |
| `worker` | app, `deploy.replicas: 2` | 9464 (metrics) | default |
| `scheduler` | app | — | default |
| `anchorer` | app | — | default |
| `postgres` | `postgres:17` | 5432 | default (healthcheck `pg_isready`, volume) |
| `redis` | `redis:7` | 6379 | default (AOF on, healthcheck) |
| `anvil` | `ghcr.io/foundry-rs/foundry` (`anvil --host 0.0.0.0`) | 8545 | default (contract auto-deployed by `migrate` when `CHAIN_ID=31337`) |
| `mailpit` | `axllent/mailpit` | 8025 / 1025 | default (dev SMTP inbox) |
| `otel-collector` | `otel/opentelemetry-collector-contrib` | 4318 | `observability` |
| `jaeger` | `jaegertracing/all-in-one` (v2) | 16686 | `observability` |
| `prometheus` | `prom/prometheus` | 9090 | `observability` |
| `grafana` | `grafana/grafana` (provisioned datasource + "ZETA Overview" dashboard) | 3001 | `observability` |
| `cloudflared` | `cloudflare/cloudflared` (`tunnel --url http://web:3000`) | — | `tunnel` |

Startup order uses `depends_on: condition: service_healthy`. Commands: `docker compose up -d`, then `docker compose --profile observability --profile tunnel up -d`.

> **Blocker:** this laptop has no Docker or WSL. Installing Docker Desktop needs WSL2, admin rights and a reboot, and the user does that themselves (Q5). Until then, dev runs natively with Neon + Upstash, and CI builds and tests every image.

## Kubernetes (`deploy/helm/flowledger`)
| Object | Purpose |
|---|---|
| `Deployment/web` + `Service` + `Ingress` (nginx, cert-manager annotations) | UI/API. Probes: `/api/health` (liveness), `/api/ready` (readiness), startup probe |
| `HorizontalPodAutoscaler/web` | 2→6 replicas at 70% CPU |
| `Deployment/worker` + **KEDA `ScaledObject`** | 1→20 replicas on Redis list length `bull:runs:wait` (target 20 jobs per pod). Scales to zero-ish off-hours (min 1 for demo) |
| `Deployment/scheduler`, `Deployment/anchorer` | 1 replica each, `strategy: Recreate` (single leader) |
| `Job/migrate` (Helm pre-install / pre-upgrade hook) | Drizzle migrations |
| `CronJob/retention` | Nightly purge per plan retention |
| `ConfigMap`, `Secret` (or `ExternalSecret`) | Config and keys |
| `PodDisruptionBudget` | web minAvailable 1 |
| `NetworkPolicy` | Default deny. web ↔ db/redis, workers → db/redis/egress 443, nothing → anchorer except egress to the RPC |
| `ServiceMonitor` (if Prometheus Operator is present) | Metrics scraping |
| Pod security | `runAsNonRoot`, `readOnlyRootFilesystem`, dropped capabilities, seccomp `RuntimeDefault`, resource requests/limits |

Postgres and Redis are external in the chart (managed services). For kind, Bitnami-free manifests in `deploy/helm/dev-deps/` install plain `postgres:17` and `redis:7` StatefulSets.

## CI/CD (GitHub Actions)
| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | PR / push | pnpm install (cached) → lint → typecheck → vitest (Postgres + Redis **service containers**) → Hardhat compile + test + gas report → Next build → Playwright smoke |
| `images.yml` | push to main / tag | buildx multi-arch (amd64, arm64) → push to **GHCR** → SBOM + provenance → Trivy scan → cosign keyless signing (Should) |
| `kind-e2e.yml` | push to main | kind cluster → install KEDA → `helm install` the app + dev-deps → wait for rollout → smoke: submit form → assert run `success` → assert worker scaled up under a burst of 200 jobs |
| `codeql.yml` + `gitleaks` + Dependabot | schedule / PR | Security scanning |
| Deploy | main | Vercel Git integration (web), Render deploy hook (worker image) |

## Observability
- **Traces:** OpenTelemetry SDK in web and worker, OTLP/HTTP to the collector, then Jaeger. One trace shows `POST /api/forms/x/submit → queue wait → run → 5 steps → Sheets/SMTP/Telegram calls`. This is a strong live-demo moment if time allows.
- **Metrics:** prom-client (list in [07](07_HIVE_ENGINE.md)). The Grafana "ZETA Overview" dashboard shows runs/min, success rate, p95 step latency by action, queue depth, workers, anchor batches, AI tokens.
- **Logs:** pino JSON with `traceId`, `executionId`, `workspaceId`, redaction paths for secrets.
- **Alerts** (Should): DLQ > 0, anchor failures > 2 in a row, p95 run latency > 30 s.

## Free-tier deploy notes (verified 2026-10-09 where cited)
- **Upstash free:** 256 MB, **500K commands/month**. BullMQ polls even when idle, so the polling must be tuned (see [07](07_HIVE_ENGINE.md)). Demo-day runs use local Redis.
- **Render free web service:** sleeps when idle. The worker image exposes a tiny HTTP health port, and an external uptime ping keeps it awake during judging.
- **Vercel Hobby:** for the web role. SSE works within function duration limits; the client polls as a fallback.
- **Neon free:** Postgres with scale-to-zero (the first query after idle is slower, so warm it before the demo).
- **Amoy faucets:** about 0.1 POL/day per faucet. Some check for a small mainnet balance. Start claiming early.

## Runbook (expanded in P3)
`make demo-up` / `pnpm demo:up`:
1. Compose up.
2. Seed.
3. Deploy the contract on anvil, or check the Amoy balance.
4. Start the tunnel.
5. Print the form URL + QR.
6. Pre-warm Gmail, Sheets and the LLM with one test run.

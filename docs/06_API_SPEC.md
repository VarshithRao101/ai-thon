# 06 — API Spec

The API is served by `web` (Next.js route handlers). JSON in and out, validated with zod. The OpenAPI 3.1 spec is generated from the zod schemas and served at `/api/openapi.json`, with a Scalar reference UI at `/docs/api`.

**Auth modes:**
- **S** — session cookie (Better Auth, `httpOnly; Secure; SameSite=Lax`), with the workspace taken from the active session.
- **K** — API key `Authorization: Bearer flk_…` (sha256-hashed at rest, scoped).
- **H** — HMAC signature `X-ZETA-Signature: t=<unix>,v1=<hex>`, computed as `HMAC_SHA256(secret, t + "." + body)`, with 5-minute replay tolerance.
- **P** — public, rate-limited.

**Roles:** O = owner, A = admin, E = editor, V = viewer.

## Auth and workspaces
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| * | `/api/auth/*` | — | — | Better Auth: email sign-up/in, Google OAuth, sign-out, session, verify email, reset password, 2FA, organization APIs |
| GET | `/api/me` | S | V | Current user, active workspace, role, plan, memberships, allowed `permissions` (built in 1B) |
| POST | `/api/auth/organization/set-active` | S | V | Switch the active workspace (Better Auth organization plugin; also `invite-member`, `accept-invitation`, `update-member-role`, `remove-member`) |
| GET/POST | `/api/workspaces` | S | — | List / create workspace |
| POST | `/api/workspaces/{id}/switch` | S | V | Set the active workspace |
| GET/POST | `/api/workspaces/{id}/members` | S | A | List members / invite by email |
| PATCH/DELETE | `/api/workspaces/{id}/members/{userId}` | S | A | Change role / remove member |

## Workflows
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| GET/POST | `/api/workflows` | S | V/E | List (filter: enabled, trigger) / create |
| GET/PUT/DELETE | `/api/workflows/{id}` | S | V/E/A | Read / save draft / delete |
| POST | `/api/workflows/{id}/publish` | S | E | Snapshot the draft → `workflow_versions` (hash) and register triggers |
| GET | `/api/workflows/{id}/versions` | S | V | Version history with definition hashes |
| POST | `/api/workflows/{id}/enable` · `/disable` | S | E | Toggle (audited) |
| POST | `/api/workflows/{id}/test-run` | S | E | Manual run using sample input |
| POST | `/api/workflows/{id}/duplicate` | S | E | Copy |
| GET | `/api/workflows/{id}/code` | S | V | TypeScript export (from the base) |
| GET | `/api/templates` · POST `/api/templates/{key}/use` | S | E | Template gallery |

## Triggers (ingress)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/hooks/{workflowId}` | H or K | Webhook trigger. `Idempotency-Key` supported. Returns `202 {executionId}`. `409` if disabled, `429` if over plan/rate limit |
| GET | `/f/{slug}` | P | Hosted form page (SSR, branded) |
| POST | `/api/forms/{slug}/submit` | P | Validates against the form schema. Has a honeypot field, a per-IP and per-form limit, and requires consent. Returns `{ok, executionId}` |
| GET | `/api/forms/{id}/qr.svg` | S | QR code for the share link |

## Forms
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| GET/POST | `/api/forms` | S | V/E | List / create (linked to a workflow) |
| GET/PUT/DELETE | `/api/forms/{id}` | S | V/E | Read / edit fields / delete |
| GET | `/api/forms/{id}/submissions` | S | E | Decrypted for E and above, paginated, CSV export |

## Executions
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| GET | `/api/executions` | S | V | Filters: workflowId, status, trigger, date range. Cursor pagination |
| GET | `/api/executions/{id}` | S | V | Run + steps + receipt status |
| GET | `/api/executions/{id}/stream` | S | V | **SSE** live events (below) |
| POST | `/api/executions/{id}/retry` | S | E | Resume from the failed step (new attempt, same receipt chain) |
| POST | `/api/executions/{id}/cancel` | S | E | Cancel a queued or running run |
| POST | `/api/executions/{id}/doctor` | S | E | AI Run Doctor diagnosis + suggested patch |
| GET | `/api/executions/export.csv` | S | E | CSV export |

## Integrations (credential vault)
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| GET/POST | `/api/integrations` | S | V/A | List (secrets never returned) / create |
| PUT/DELETE | `/api/integrations/{id}` | S | A | Update / delete (audited) |
| POST | `/api/integrations/{id}/test` | S | E | Live connection test |
| POST | `/api/workspaces/vault/rotate` | S | A | Re-wrap the workspace data key under the newest master key (envelope rotation, D-031; built in 1B) |

## AI
| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST | `/api/ai/generate` | S | E | Copilot: plain English → streamed workflow operations (base route, new provider + validation) |
| POST | `/api/ai/map-fields` | S | E | Form fields ↔ Sheet columns mapping |
| POST | `/api/ai/explain-workflow` | S | V | Plain-language summary of a workflow |

## Ledger and verification
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/ledger/batches` | S | Batches with root, tx hash, leaf count, status |
| GET | `/api/ledger/batches/{id}` | S | Batch detail + receipts |
| POST | `/api/ledger/anchor-now` | S (A) | Force a batch (demo button) |
| GET | `/api/verify/{executionId}` | P | Public: receipt, re-derived hashes from the current logs, proof, batch, chain id, contract, tx. **The browser does the actual verification.** |
| POST | `/api/verify` | P | Upload a receipt JSON → the server returns proof data (the client still verifies) |
| GET | `/verify/{executionId}` | P | Public verify page |
| POST | `/api/demo/tamper` | S (A, demo workspace only) | Tamper simulator: edits one stored step output and records a `tamper_event` |

## SaaS, ops and security
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST/DELETE | `/api/api-keys` | S (A) | Create (shown once) / list / revoke |
| GET | `/api/audit?before=<iso>` | S (A) | Audit log, newest first, 100 per page (built in 1B) |
| GET | `/api/analytics/overview?range=7d` | S | Runs/day, success rate, p50/p95 duration, top workflows, anchored receipts, AI usage |
| GET | `/api/usage` | S | Current-period usage vs. plan limits |
| GET/POST | `/api/notifications` · `/{id}/read` | S | In-app notifications |
| GET | `/api/health` | P | Liveness |
| GET | `/api/ready` | P | Readiness: DB + Redis ping |
| GET | `/metrics` | internal / basic auth | Prometheus |
| GET | `/admin/queues` | S (O) | bull-board UI |

## SSE event format (`/api/executions/{id}/stream`)
```
event: step
data: {"type":"step.started","nodeId":"n3","label":"Append to Sheet","attempt":1,"at":"2026-10-09T10:00:01.120Z"}

event: step
data: {"type":"step.succeeded","nodeId":"n3","durationMs":412,"outputPreview":{"rowNumber":42}}

event: run
data: {"type":"run.completed","status":"success","durationMs":2310,"receipt":{"leafHash":"0x…","status":"pending"}}

event: ledger
data: {"type":"receipt.anchored","batchId":17,"txHash":"0x…","explorerUrl":"https://amoy.polygonscan.com/tx/0x…"}
```

## Errors
Errors use an RFC 9457 `application/problem+json` body:
```json
{ "type": "https://flowledger.dev/errors/workflow-disabled", "title": "Workflow is disabled", "status": 409, "detail": "Enable it to accept triggers.", "traceId": "4bf9…" }
```

## Rate limits (sliding window)
| Bucket | Limit |
|---|---|
| Form submit | 10/min per IP per form, 300/min per form |
| Webhooks | 60/min per workflow (Free), 600/min (Pro) |
| AI endpoints | 20/min per user |
| Auth | Better Auth built-in limiter |

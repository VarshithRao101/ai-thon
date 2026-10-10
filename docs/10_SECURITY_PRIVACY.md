# 10 — Security and Privacy

## Threat model (STRIDE-lite)
| Threat | Asset | Control |
|---|---|---|
| Account takeover | User sessions | Better Auth: scrypt password hashing, `httpOnly; Secure; SameSite=Lax` session cookie, session rotation on login, built-in rate limiting, optional TOTP 2FA, Google OAuth, email verification |
| CSRF | State-changing APIs | SameSite cookies + Better Auth origin check + `Origin`/`Sec-Fetch-Site` check on our mutating routes |
| Cross-tenant data access | Workflows, runs, submissions | Workspace taken from the session only, checked in the repository layer, **plus Postgres RLS**. Tests try cross-tenant ids and expect 404 |
| Privilege escalation | Roles | RBAC matrix below, enforced server-side by `requireRole()`; every role change audited |
| Credential theft | Integration secrets | **Envelope encryption** below. Secrets never returned by the API and never put in job data, logs or traces |
| Webhook forgery / replay | Trigger ingress | HMAC-SHA256 signature with a timestamp (5-minute window) or a scoped API key. Idempotency keys |
| Spam form submissions | Forms, quotas | Honeypot field, per-IP sliding-window limit, per-form cap, optional Cloudflare Turnstile, plan quotas |
| SSRF via the HTTP node | Internal network | Resolve DNS, then block private, loopback, link-local and metadata ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7). Allow only http/https. Cap redirects and the response size |
| Code injection via Condition | Worker | Base template expression validator (whitelist), kept and fuzz-tested. No `eval` of user strings elsewhere |
| Prompt injection | AI nodes | Data wrapping, schema validation, caps ([09](09_AI_FEATURES.md)) |
| XSS | UI, hosted forms | React escaping, no `dangerouslySetInnerHTML` on user data, strict CSP, sanitized Markdown |
| Log tampering | Audit and run logs | Proof-of-Execution ([08](08_BLOCKCHAIN_LEDGER.md)) |
| Secret leakage in repo | Keys | `.env*` gitignored, gitleaks in CI, env schema validated at boot (fails fast, prints names not values) |
| Supply chain | Dependencies, images | Lockfile, Dependabot, `pnpm audit`, Trivy image scan, SBOM, CodeQL, pinned base image digests |

## Tenant isolation as built (1B, D-026)
- The app connects as `flowledger_app` (member of `flowledger_app_role`): not owner, not superuser, no BYPASSRLS. Migrations and system jobs use the owner (`DATABASE_ADMIN_URL`).
- `tdb()` runs every tenant query in a transaction that sets `app.workspace_id`. AsyncLocalStorage carries the context into background runs (dispatch).
- RLS policies cover `workflows` (+ public read), `workflow_executions`, `workflow_execution_logs`, `integrations`, `api_keys` and `audit_events`.
- The only cross-tenant read is `resolve_api_key(hash)`, a SECURITY DEFINER function with a pinned `search_path` that ignores revoked and expired keys.
- At startup `instrumentation.ts` checks the connected role and warns, or with `REQUIRE_RLS=true` refuses to start, if RLS would be bypassed.
- Evidence: `test/db/rls.test.ts` (8 tests on real Postgres via PGlite) and `scripts/e2e-tenancy.mjs` (59 live checks).

## Known gaps (tracked)
- **SSRF in template code:** the "database" connection test and the Database Query step connect to any user-supplied Postgres URL from the server. 1E applies the SSRF guard (block private, loopback and link-local ranges) to these and to the HTTP node.

## RBAC matrix
| Action | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| View workflows, runs, ledger | Yes | Yes | Yes | Yes |
| Create / edit / publish / enable workflows | Yes | Yes | Yes | — |
| Retry / cancel runs, Run Doctor | Yes | Yes | Yes | — |
| View decrypted form submissions | Yes | Yes | Yes | — |
| Manage integrations (vault), API keys | Yes | Yes | — | — |
| Invite members / change roles | Yes | Yes (not owners) | — | — |
| Billing / plan, delete workspace, transfer ownership | Yes | — | — | — |
| Tamper simulator (demo workspace) | Yes | Yes | — | — |

## Credential vault: envelope encryption
- **KEK** (key-encryption key): 32 bytes from env `VAULT_MASTER_KEY_V{n}`. It never touches the DB.
- **DEK** (data key): one per workspace, random 32 bytes, stored encrypted by the KEK (AES-256-GCM) in `workspaces.dek_enc` with `key_version`.
- Secrets are encrypted with the workspace DEK using AES-256-GCM, a random 96-bit IV and the auth tag. This extends the base `iv:tag:data` format with a version prefix: `v1:iv:tag:data`.
- **Rotation:** add `VAULT_MASTER_KEY_V2`, then `POST /api/workspaces/vault/rotate` (or a job) re-wraps each workspace's DEK. Only DEKs are rewritten, never every secret.
- **Binding:** the workspace id is AES-GCM additional authenticated data, so a ciphertext copied into another workspace fails authentication.
- **Implemented in 1B:** `lib/vault/crypto.ts` (12 unit tests, including tamper, AAD binding, rotation and legacy) and `lib/vault/index.ts`.
- Decryption happens only inside the worker step or the test-connection handler, held in memory just long enough to use.

## Sessions and cookies
| Cookie | Purpose | Category | Lifetime |
|---|---|---|---|
| `better-auth.session_token` | Login session | Strictly necessary | 7 days, rolling |
| `fl_ws` | Active workspace | Strictly necessary | Session |
| `fl_consent` | Your cookie choices | Strictly necessary | 180 days |
| `fl_theme` | UI preference | Functional (opt-in) | 1 year |
| Analytics (if any) | Product analytics | Analytics (opt-in, **off by default**) | — |

The consent banner offers **Accept all / Reject non-essential / Customize**, with equal-weight buttons. Nothing non-essential loads before consent.

## HTTP hardening
- CSP: `default-src 'self'`; `script-src 'self' 'nonce-…'`; `connect-src 'self' <RPC> <AI>`; `frame-ancestors 'none'`. Hosted forms use a relaxed `frame-ancestors` only if embedding is enabled.
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic and geolocation off).

## Privacy: India's DPDP Act 2023 (and its Rules)
| Principle | How we comply |
|---|---|
| Notice + consent | Hosted forms show a consent checkbox with the purpose text configured by the workspace. The consent timestamp is stored |
| Purpose limitation, minimization | Only the form's fields are stored. AI sees only the fields the step references |
| Data principal rights | Export and delete a submission (owner UI + API). Deletion crypto-shreds the receipt link |
| Security safeguards | Encryption at rest for submissions and secrets, RBAC, audit log, Proof-of-Execution |
| Breach readiness | Audit trail + tamper-evident logs + incident runbook (docs/runbook in P3) |
| Retention | Plan-based retention with an automatic sweep |

Roles: N-Flow is the **processor** for workspace data. The workspace owner is the **data fiduciary** for their forms. This is stated in the Terms and the DPA summary. These pages are templates and **not legal advice** (see [18](18_LEGAL_PAGES.md)).

## Secrets handling (team rules)
- `.env.local` for dev only. Deployed secrets go in platform env (Vercel/Render) or Kubernetes Secrets (External Secrets operator noted as the production path).
- Never paste keys in chat logs, docs, screenshots or commits. Rotate any key that leaks.
- The anchorer wallet holds testnet funds only.

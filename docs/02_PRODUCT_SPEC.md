# 02 — Product Spec

## Problem
Small businesses, colleges, clinics and startups in India move data by hand. A typical week looks like this:
- copy form responses into Google Sheets
- send follow-up emails one by one
- ping the team on Telegram or WhatsApp

Tools like Zapier are priced in USD and get expensive as runs grow (sourced in [13](13_BUSINESS_MARKET.md)). Their run history also lives in the vendor's database, so it can be edited and nobody outside can prove what actually ran. That matters when the data is personal and the DPDP Act applies.

## Solution: FlowLedger
A no-code automation platform with four parts:
1. **Describe it in plain English** → the AI Copilot builds the workflow on a visual canvas.
2. **Connect triggers and actions:** forms, webhooks and schedules trigger Sheets, email, Telegram, Discord, Slack, AI steps and HTTP calls.
3. **Run reliably** on the Hive engine: a queue, horizontally scalable workers, retries, a dead-letter queue (DLQ), and resume from the failed step.
4. **Prove it:** each run gets a cryptographic receipt that is anchored on-chain. Anyone can verify it on a public page without trusting FlowLedger.

## Personas
| Persona | Need | Example |
|---|---|---|
| **Riya, event organizer** (college fest / hackathon) | Registrations → Sheet → confirmation email → team alert | The demo's hero flow |
| **Dr. Rao, clinic owner** | Appointment form → Sheet → reminder email → staff Telegram | Template #3 |
| **Arjun, startup founder** | Lead form → AI lead score → hot leads to Telegram, all leads to the CRM sheet | Template #2 |
| **Workspace admin** | Team access, API keys, audit trail, usage limits | Settings and Ledger screens |

## MVP scope (official) → our feature
| Official MVP item | FlowLedger feature |
|---|---|
| Workflow builder | React Flow canvas: node palette, config panel, AI Copilot side panel, versioned publish |
| Triggers | Form submitted (hosted form + QR), webhook (HMAC or API key), schedule (cron), manual test run |
| Actions | Google Sheets (append / update / lookup), email (SMTP; Resend as a fallback), Telegram, Discord, Slack, in-app notification, HTTP request, AI steps, logic (condition, switch, delay, transform) |
| Execution logs | Run list with filters, step timeline with input/output (redacted), attempts, durations, live SSE updates, retry from failed step, CSV export, **on-chain receipt badge** |
| Sample workflow | Five one-click templates, plus the seeded "Hackathon registration" demo |
| Enable/disable controls | Per-workflow toggle (disabled → triggers return 409 and are logged as skipped), per-node enable, workspace-wide pause |

## Feature list (MoSCoW)
**Must (the P1 core)**
- Auth: email/password plus Google sign-in. httpOnly session cookies. Workspaces. Roles: owner, admin, editor, viewer.
- Builder with publish/versioning, enable/disable, and test runs.
- Hive engine: queue, workers, retries with backoff, DLQ, idempotency, live run events.
- Triggers: form, webhook, schedule, manual.
- Actions: Sheets, SMTP email, Telegram, AI (generate, classify, extract), condition, HTTP.
- Execution logs, plus the run detail page with its timeline.
- Proof-of-Execution: receipt → Merkle batch → anchored on Amoy → public verify page → tamper simulator.
- AI Copilot (plain English → workflow).
- Landing page, dashboard, pricing, legal pages, cookie consent.

**Should**
- Run Doctor (AI failure explainer and one-click fix).
- AI field mapper.
- Discord and Slack actions, in-app notifications.
- Credential vault with test-connection and key rotation.
- API keys, audit log, usage metering with plan limits.
- Templates gallery, analytics charts.
- Docker Compose for the full stack, and CI.

**Could**
- Helm chart with KEDA, a kind cluster test in CI, Grafana dashboards, OpenTelemetry tracing UI.
- Code export (TypeScript), inherited from the base template.
- 2FA (TOTP), Cloudflare Turnstile on forms.
- Telugu/Hindi copilot prompts.

**Won't (future scope)**
- WhatsApp Business API, SMS, IMAP email triggers.
- Marketplace, on-prem enterprise build, real billing (only a payment provider's test mode, if any).

## Node catalog (P1)
| Kind | Node | Key config | Output |
|---|---|---|---|
| Trigger | **Form Submitted** | form id | `{fields…, submittedAt, consent}` |
| Trigger | **Webhook** | auth mode (HMAC / API key), sample payload | request body |
| Trigger | **Schedule** | cron, timezone | `{firedAt}` |
| Trigger | **Manual** | sample input | sample input |
| Action | **Sheets: Append Row** | spreadsheet id, sheet, column mapping | `{rowNumber, range}` |
| Action | **Sheets: Lookup Row** | spreadsheet id, column, value | row object |
| Action | **Email: Send (SMTP)** | to, subject, body (templated), optional HTML | `{messageId}` |
| Action | **Telegram: Send Message** | chat id, text (Markdown) | `{messageId}` |
| Action | **Discord: Send Message** | webhook URL (from the vault), content | `{ok}` |
| Action | **Notify (in-app)** | audience, title, body | `{notificationId}` |
| Action | **HTTP Request** | method, URL (SSRF-guarded), headers, body | status, JSON |
| AI | **AI: Generate Text** | prompt (templated), tone | `{text}` |
| AI | **AI: Classify** | input, labels[], explain? | `{label, confidence, reason}` |
| AI | **AI: Extract JSON** | input, schema fields | object |
| AI | **AI: Draft Email** | recipient context, goal | `{subject, body}` |
| Logic | **Condition** (base) | expression | branch true / false |
| Logic | **Switch** | value, cases | one branch |
| Logic | **Delay** | duration | `{resumedAt}` |
| Logic | **Transform / Set** | key → template mapping | object |

Template syntax (from the base template): `{{@nodeId:Label.field}}`. The builder shows a field picker, so users never type it by hand.

## Sample workflows (seeded templates)
1. **Hackathon registration** (hero): Form → AI Classify (track) + AI Draft Email → Sheets Append → Email → Telegram team alert.
2. **Lead capture + AI scoring:** Form → AI Classify (hot / warm / cold) → Switch → hot leads to Telegram; all leads → Sheet.
3. **Clinic appointment:** Form → Sheet → confirmation email → Delay (demo: 1 min) → reminder email.
4. **Daily digest:** Schedule 09:00 IST → Sheets Lookup (yesterday) → AI Summarize → email the owner.
5. **Payment webhook:** Webhook (HMAC) → Transform → Sheet → thank-you email → Discord.

## User stories (acceptance tests in P1)
- As a new user, I can sign up with Google or email, create a workspace, and land in a template gallery. **(≤ 3 clicks to the first workflow)**
- As an editor, I type "When someone fills my registration form, save it to a sheet, email them and alert my team on Telegram". The workflow appears with all the nodes configured except credentials.
- As an editor, I publish a workflow. Its hosted form gets a public URL and a QR code.
- As a visitor, I submit the form. Within 10 seconds I get the email, the Sheet has the row, and Telegram is pinged. **(P2 measures this target. Until it is measured, it is a target, not a claim.)**
- As an editor, I watch the run live on the canvas and open the step timeline.
- As an editor, I disable a workflow. New submissions are rejected and logged as "skipped (disabled)".
- As anyone with a receipt link, I open `/verify/<id>` and see ✓ verified against the chain, plus the Polygonscan transaction.
- As an admin, I use the tamper simulator in the demo workspace. The verify page shows ✗ and points at the changed step.
- As an editor, when a step fails I click "Ask Run Doctor". I get a plain-language cause and an "Apply fix" button.

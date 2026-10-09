# 01 — Evaluation Strategy

The judging rubric (organizer dashboard, captured 2026-10-09) is the spec. Every feature has to earn points under one of these six criteria, or it gets cut.

| Criterion | Weight | How we win it | Proof shown in the demo |
|---|---|---|---|
| **Working MVP** — "The core flow must work live." | 30% | One hero flow that is hardened end to end: a hosted form triggers AI, then Google Sheets, email, Telegram, then an on-chain receipt. The engine has retries, idempotency, a dead-letter queue (DLQ) and resume-from-failed-step. Rehearse it 10× live in P2. A local chain is the fallback if the testnet is slow. A recorded video is the last-resort backup. | A judge scans a QR code on their own phone. A row lands in the Sheet, the judge gets the email, Telegram pings, and the canvas lights up node by node. |
| **AI/SaaS relevance** — "AI must meaningfully improve the solution." | 20% | AI does real work in four places: **(1) Copilot** turns plain English into a working workflow. **(2) AI nodes** score leads, extract fields, and draft personalized emails. **(3) Run Doctor** explains a failed run and proposes a one-click fix. **(4) Field mapper** auto-maps form fields to Sheet columns. The SaaS side is real too: workspaces, roles, plan limits, usage metering, API keys. | Type one sentence and the whole workflow appears. Break a step, then click "Ask Run Doctor" and the fix is applied. |
| **UI/UX** — "clear and demo-friendly" | 15% | TRNT BEE brand: black, graphite, honey yellow and metallic gold, with honeycomb motifs. The canvas runs live with nodes pulsing amber → gold. Empty states, skeletons and toasts. A three-click path to the first automation. | The live canvas and a clean dashboard. |
| **Market potential** — "Clear target user and business value." | 15% | Target: Indian SMBs, colleges, clinics, coaching centers and event organizers. Pricing in INR at a fraction of Zapier's USD price (sourced in doc 13). Proof-of-Execution gives tamper-proof audit trails for teams handling personal data under the DPDP Act. | A pricing slide and a "we automated this hackathon's registration" story. |
| **Innovation** — "Fresh thinking or strong execution." | 10% | **Proof-of-Execution:** every automation run gets a cryptographic receipt that anyone can verify **without trusting us**, because verification runs in the browser against the chain. Strong execution too: our own queue engine, containers, Kubernetes with KEDA autoscaling, OpenTelemetry tracing. | The verify page shows ✓. Then the tamper simulator edits a log and the page shows ✗ "tampered at step 2". |
| **Demo & pitch** — "problem, solution and future scope" | 10% | A three-minute script ([17](17_DEMO_AND_PITCH.md)): problem → live demo → architecture → business → future scope. Every team member owns one part and can answer judges' questions about it. | The deck plus the live demo. |

## Priority order when time runs short
1. Hero flow works live (form → Sheets → email → Telegram), with logs and enable/disable.
2. AI Copilot and AI nodes.
3. Proof-of-Execution (receipt → anchor → verify page).
4. UI polish: landing page, dashboard, live canvas.
5. Workspaces, roles, API keys, vault, legal pages.
6. Infra: Docker/Compose, then CI, then Helm/KEDA, then observability.
7. Extras: Run Doctor, field mapper, templates gallery, analytics.

## Top risks and mitigations
| Risk | Mitigation |
|---|---|
| Venue Wi-Fi fails | Phone hotspot. Local chain fallback. Recorded backup video. Pre-seeded runs to show. |
| Testnet faucet or RPC is slow | Get test POL now from several faucets. Anchor every 30 s in demo mode. Anvil local chain as a switchable fallback. |
| Gmail SMTP blocks or rate-limits | Use an app password on a dedicated sender account. Keep Resend as a fallback to our own inbox. Mailpit when running locally. |
| Free-tier limits (Upstash commands) | Tune BullMQ polling. Demo runs on the local Redis container. |
| Judges ask "what did you build vs. the template?" | A "what we built" slide plus attribution. The engine, ledger, forms, integrations, AI features, infra and UI are ours. |
| Hackathon rules restrict code written before the event | Check the rules first (Q3 in [16](16_OPEN_QUESTIONS.md)). |
| Over-engineering breaks the MVP | Infra extras sit behind profiles and flags. The hero flow never depends on them. |

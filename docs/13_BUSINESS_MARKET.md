# 13 — Business and Market

Rule: every number below has a source or is labeled **estimate**. Do not round estimates up on slides.

## Problem, in business terms
- Small teams spend hours on copy-paste work: forms → sheets → emails → team alerts.
- Global automation tools are priced in USD. Zapier's Professional plan is about **$19.99/month billed annually or $29.99 monthly for 750 tasks** ([Lindy](https://wf.lindy.ai/blog/zapier-pricing), [Toolradar](https://toolradar.com/blog/zapier-pricing-2026); third-party write-ups checked 2026-10-09, confirm on zapier.com/pricing before the pitch). That is a lot for an Indian micro-business.
- Run history lives in the vendor's database. When personal data is involved (DPDP Act), teams can't *prove* what their automations did.

## Target users (beachhead → expansion)
1. **Beachhead: college clubs, fest and hackathon organizers** (like this event) — registrations, confirmations, team alerts. Low cost to acquire, viral (every participant sees "Powered by ZETA").
2. **Clinics, coaching centers, small agencies** — appointment and lead forms, reminders, follow-ups.
3. **Startups / SMB ops teams** — lead scoring, webhooks from payments, daily digests.
4. **Compliance-sensitive teams** (later) — verifiable audit trails for DPDP-era data processing.

## Market size (sourced; directional only)
- India has **~8.84 crore enterprises registered on the Udyam portal as of 30 June 2026** (MoS MSME reply in Parliament, reported by [KNN India](https://knnindia.co.in/news/newsdetails/msme/over-884-crore-msmes-registered-on-udyam-platforms-mos-karandlaje)). These are cumulative registrations, not necessarily active businesses.
- Global workflow-automation market estimates disagree widely. Published 2030 forecasts range from roughly **$27B to $78B**, with CAGRs from ~7% to ~26% depending on scope ([StartUs Insights](https://www.startus-insights.com/innovators-guide/workflow-automation-market-report/), [Meticulous Research](https://www.meticulousresearch.com/pressrelease/940/workflow-automation-market), [Business Wire / ResearchAndMarkets](https://www.businesswire.com/news/home/20251021500740/en/$78.25-Billion-Workflow-Automation-Market)). On slides, say "**tens of billions of dollars by 2030, double-digit growth (analyst estimates vary)**". Don't pick the biggest number.
- **SOM (estimate):** if 0.01% of Udyam-registered enterprises (~8,800) paid ₹499/month, that's ~₹4.4 crore ARR. *Illustrative arithmetic, not a forecast.*

## Competitors
| | Zapier | Make | n8n | Pabbly Connect (India) | **ZETA** |
|---|---|---|---|---|---|
| Pricing currency | USD | USD | USD / self-host | INR / USD | **INR** |
| AI builds the workflow | Yes (Copilot) | Partial | Partial | No (verify) | **Yes + Run Doctor** |
| Hosted forms built in | Interfaces (verify) | No (verify) | Form trigger | No (verify) | **Yes + QR** |
| Self-host / containers | No | No | Yes (Sustainable Use License) | No | **Yes (Docker, Helm, KEDA)** |
| **Verifiable execution proof** | No | No | No | No | **Yes (on-chain Merkle receipts)** |

Competitor features change quickly. Re-check each "Yes/No" against the vendors' sites before the pitch, and mark anything unverified "(verify)".

## Pricing (INR; estimate, not validated with customers)
| Plan | Price | Limits |
|---|---|---|
| **Free** | ₹0 | 1 workspace, 3 active workflows, 300 runs/month, 1 form, receipts anchored daily, 90-day retention |
| **Pro** | **₹499/month** | 20 workflows, 5,000 runs, unlimited forms, AI nodes (token quota), receipts anchored every 5 min, 1-year retention, 3 members |
| **Business** | ₹1,999/month | Unlimited workflows, 50,000 runs, 10 members, roles + audit log export, SLA email support, custom form domain |
| **Enterprise** | Talk to us | Self-hosted (Helm), SSO, private chain / customer-chosen anchoring, DPA |

## Unit economics (estimate, to be measured in P2)
- Variable cost per run is mostly LLM tokens (if AI nodes are used), the integration APIs (free for Sheets/SMTP/Telegram at small volume), and anchoring. One anchor batch covers up to 1,000 runs, so the chain cost per run is a fraction of a paisa on mainnet-class Polygon fees. Measure Amoy gas in P2 and *label it testnet*.
- Infrastructure: one small container set serves many workspaces. Workers autoscale on queue depth.

## Go-to-market
1. **Campus launch:** free for college clubs and hackathons, with "Powered by ZETA" on hosted forms (viral loop).
2. **Template-led SEO:** "Google Form to Sheet + WhatsApp/Telegram alert", in Telugu/Hindi as well.
3. **Partnerships:** incubators (e.g. T-Hub, WE Hub in Telangana; verify program fit), CA and IT consultants who set up tools for SMBs.
4. **Compliance angle:** "DPDP-ready audit trail" for clinics and education.

## Moat
Proof-of-Execution (our receipt format + verify page + hash-chain design), INR-first UX, templates for Indian workflows, and a self-hostable stack.

## Future scope (pitch slide)
- WhatsApp Business API, SMS, UPI/Razorpay webhook templates.
- Telugu/Hindi voice → workflow (speech-to-text → Copilot).
- IoT triggers over MQTT (sensors → workflows), already IoT-ready via the webhook trigger.
- Marketplace for community templates and plugins.
- Enterprise: SSO/SAML, private or consortium chain anchoring, on-prem Helm.
- Verifiable *AI* actions: receipts that also commit to prompt and model hashes for AI-made decisions.

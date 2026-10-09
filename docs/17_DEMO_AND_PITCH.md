# 17 — Demo and Pitch

## 3-minute live demo script
| Time | Who | Action on screen | Line |
|---|---|---|---|
| 0:00–0:20 | Lead | Landing page, then the problem slide | "Every club, clinic and startup copy-pastes form data into sheets, emails and WhatsApp. Zapier costs dollars, and nobody can prove what their automations actually did." |
| 0:20–0:50 | Frontend+AI | Builder → Copilot: *"When someone registers, figure out their track, save them to our sheet, email them a personal confirmation and alert our team on Telegram."* Nodes drop in, already wired | "One sentence. AI built a five-step workflow, picked the integrations and mapped the fields." |
| 0:50–1:30 | Backend | Publish → **QR on screen** → a judge scans and submits on their phone → the canvas lights up live: AI ✓ → Sheet ✓ → Email ✓ → Telegram ✓. Sheet, Telegram and the judge's inbox are visible | "That ran on our Hive engine: a queue, autoscaling workers, retries. Sir/Ma'am, please check your inbox." |
| 1:30–2:10 | Blockchain+DevOps | Run detail → receipt "✓ On-chain" → **public verify page**: four checks tick, Polygonscan transaction → **tamper simulator** edits the Sheet row number → verify shows **✗ Tampered at step 3** → Restore | "Every run gets a cryptographic receipt anchored on Polygon. Anyone can verify it in their own browser without trusting us. Edit one byte and it breaks." |
| 2:10–2:30 | Frontend+AI | Break a step on purpose → failed run → **Ask Run Doctor** → Apply fix → green | "When something fails, AI explains why in plain English and fixes it." |
| 2:30–2:50 | Lead | Architecture slide (Compose / K8s / KEDA / OTel), then the pricing slide (₹499) | "Containerized, autoscaling, observable. Priced in rupees for 8.8 crore registered MSMEs." |
| 2:50–3:00 | Lead | Future scope slide | "Next: WhatsApp, Telugu voice-to-workflow, and verifiable AI decisions." |

## Pre-demo checklist (T-30 min)
- [ ] Stack up (`pnpm demo:up`), tunnel URL live, QR printed on a slide **and** on paper.
- [ ] Wallet has ≥ 0.05 test POL. Anchorer in demo mode (30 s).
- [ ] One warm-up run done: Gmail, Sheets, Telegram and the LLM all respond.
- [ ] Sheet, Telegram group and Mailpit/Gmail tabs open. Projector mode on. Notifications off.
- [ ] Tamper simulator restored. Seeded runs present.
- [ ] Phone hotspot ready as backup internet.

## Fallback ladder
1. Testnet slow → switch `CHAIN_*` to local anvil (one env flip, already deployed).
2. LLM down → Copilot offline template fallback; AI nodes use the fallback provider.
3. Gmail blocked → show the Mailpit inbox (local SMTP) and say so honestly.
4. Internet down → whole stack on localhost + anvil + Mailpit, demoed on the laptop's own browser.
5. Total failure → 90-second recorded backup video.

## Pitch deck outline (10 slides, black and gold)
1. **Title:** FlowLedger — *Automate anything. Prove everything.* (bee logo, Team Hydra, TRNT BEE)
2. **Problem:** manual work + USD pricing + unverifiable logs (one stat each, sourced)
3. **Solution:** three pillars: AI Copilot · Hive engine · Proof-of-Execution
4. **Live demo** (switch to the app)
5. **How it works:** architecture diagram (doc 03)
6. **Proof-of-Execution:** receipt → Merkle → Polygon → browser verify (doc 08)
7. **AI that does real work:** Copilot, AI nodes, Run Doctor, field mapper (measured golden-set rate from P2)
8. **Market and business:** target users, INR pricing, go-to-market (doc 13; sourced numbers only)
9. **What we built vs. what we reused:** honest attribution, plus the engineering list
10. **Future scope + team** (owners per area)

## Judge Q&A prep
| Likely question | Answer owner | Short answer |
|---|---|---|
| Why blockchain and not just a database? | Blockchain | The vendor can silently edit its own DB. An on-chain Merkle root is an independent timestamp and commitment. One transaction covers hundreds of runs, so it's cheap. |
| Isn't putting data on-chain a privacy problem? | Blockchain | Only 32-byte Merkle roots go on-chain. Hashes are salted, so deleting the salt makes them unlinkable (DPDP erasure). |
| What happens if a worker crashes mid-run? | Backend | The stalled job is redelivered. Completed steps are checkpointed and skipped. Idempotency keys prevent duplicates where providers support them. |
| How does it scale? | DevOps | KEDA scales workers on Redis queue depth, and the HPA scales web on CPU. We prove the chart in a kind cluster in CI. |
| What did you build vs. the template? | Lead | Slide 9: engine, ledger and contract, forms, five integrations, AI features, workspaces/RBAC/vault upgrade, infra, the full UI redesign. |
| Is the AI accurate? | AI | We only quote what we measured: x/20 on our golden prompt set (P2), and outputs are schema-validated. |
| Business model? | Lead | Freemium SaaS in INR, campus-led growth through "Powered by" forms, and a compliance angle for clinics and education. |
| Why not just use Zapier or n8n? | Lead | Zapier is USD-priced and has no execution proof. n8n's license restricts SaaS resale. We're INR-first, AI-first and verifiable. |

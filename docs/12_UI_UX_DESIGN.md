# 12 — UI/UX Design

Visual board: [../design/ui-preview.html](../design/ui-preview.html). Open it in a browser.

## Brand
- **Logo:** the TRNT BEE geometric bee ([../brand/trntbee-logo.jpeg](../brand/trntbee-logo.jpeg)). In P1A we cut it into a transparent PNG and trace it to SVG. The dark UI uses the bee in **honey gold on black**; the favicon uses a black bee on honey.
- **Name lockup:** bee mark + "Flow**Ledger**" (Ledger in gold) + a small "by TRNT BEE".
- **Metaphor:** a hive. Workflows are flows, workers are "Worker Bees", receipts are hexagon badges. The honeycomb hexagon appears in backgrounds, receipt badges and loaders. It is used sparingly.
- **Voice:** confident, short, plain. "Your automation ran. Here's the proof."

## Color tokens (sampled from the logo; dark-first)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0A` | App background (near-black) |
| `--surface` | `#121212` | Cards, panels |
| `--surface-2` | `#1A1A1A` | Raised: popovers, node bodies |
| `--border` | `#2A2A2A` | Hairlines |
| `--graphite` | `#3F3F46` | Disabled, idle edges |
| `--text` | `#F5F5F4` | Primary text |
| `--text-muted` | `#A1A1AA` | Secondary text |
| `--yellow` | `#FFE73C` | Highlight, focus glow center (logo light) |
| `--honey` | `#FFC326` | **Primary**: buttons, active states (logo mid) |
| `--amber` | `#FFBC12` | Running state, pulses |
| `--gold` | `#E49000` | Accents, links on dark, chart series 1 (logo shadow) |
| `--gold-deep` | `#C27503` | Gradients' end, pressed state |
| `--metal` | `#D4AF37` | Metallic gold for hairline borders on premium cards and verified badges |
| `--success` | `#4ADE80` | Success (kept slightly cool so gold stays the hero) |
| `--danger` | `#F87171` | Errors, tamper ✗ |
| `--info` | `#93C5FD` | Info |

- **Primary gradient:** `linear-gradient(135deg,#FFE73C 0%,#FFC326 35%,#E49000 75%,#C27503 100%)`.
- **Text on honey** is always `#0A0A0A`. Contrast: black on `#FFC326` ≈ 12:1, and `#FFC326` on `#0A0A0A` ≈ 12:1 (both AA/AAA). We check the final tokens with a contrast tool in P1H.
- **Light mode** (Should): `--bg #FAFAF7`, `--surface #FFFFFF`, gold darkened to `#B36B00` for text contrast.

## Typography (Google Fonts, free)
- **Display / headings:** *Sora* 600/700. Geometric, matches the bee's angles.
- **Body / UI:** *Inter* 400/500/600.
- **Mono** (hashes, code, ids): *JetBrains Mono* 400/500.
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48 / 64. Line height 1.5 for body, 1.15 for display.

## Shape, depth, motion
- Radius: 10 px for controls, 14 px for cards, 999 px for pills. **Hexagon** for receipt badges and avatars of workers.
- Depth comes from borders plus a faint inner glow instead of heavy shadows: `0 0 0 1px var(--border), 0 8px 30px rgba(0,0,0,.45)`. Focus ring: `0 0 0 2px #0A0A0A, 0 0 0 4px var(--honey)`.
- **Motion** (Motion library, all respecting `prefers-reduced-motion`):
  - page fade-up (180 ms, ease-out)
  - copilot nodes "drop in" one by one (60 ms stagger)
  - **live run:** edges show flowing gold dots while data moves; nodes pulse amber while running → flash gold with a ✓ on success → red shake on error
  - verify page: four checks tick in sequence (250 ms each), then a hexagon "VERIFIED" stamp
  - Number Ticker on dashboard KPIs; Border Beam on the pricing "Pro" card; **Animated Beam** on the landing page showing Form → FlowLedger → Sheets/Gmail/Telegram/Chain

## Layout
- App shell: a collapsible **left sidebar** (Dashboard, Workflows, Runs, Forms, Connections, Ledger, Templates, Settings) + a top bar (workspace switcher, ⌘K command palette, notifications bell, user menu).
- Breakpoints: ≥1280 full; 768–1279 sidebar collapses to icons; <768 bottom tab bar. The builder becomes read-only with run viewing on phones, and the **hosted forms are mobile-first**, since the judge's phone matters.

## Screens
| # | Screen | Key content | States |
|---|---|---|---|
| 1 | **Landing** `/` | Hero ("Automate anything. **Prove** everything.") + CTA "Start free" / "Watch it run"; Animated Beam integrations diagram; 3-step how-it-works; bento features (Copilot, Hive engine, Proof-of-Execution, Forms, Vault, Analytics); live counter of anchored receipts (real, from the API); pricing (INR); FAQ; footer with legal + open-source links | Cookie banner on first visit |
| 2 | **Auth** `/sign-in`, `/sign-up` | Split screen: left a honeycomb illustration + quote, right the form. Google button, email + password, magic link (Could), forgot password, terms consent line | Errors inline, loading on button |
| 3 | **Onboarding** | Workspace name → "What do you want to automate?" (copilot prompt **or** pick a template) → land in the builder | Skippable |
| 4 | **Dashboard** `/app` | KPI tiles (runs today, success rate, p95 duration, receipts anchored, AI tokens); runs-per-day area chart (gold); success/failure donut; recent runs list with live status; "Needs attention" (failed runs → Doctor); quick actions | Empty state: "Create your first automation" with copilot box |
| 5 | **Workflows** `/app/workflows` | Cards/table: name, trigger icon, **enable toggle**, last run status dot, runs (7d), version, updated. Search, filter, "New with AI", "From template" | Empty, loading skeletons |
| 6 | **Builder** `/app/workflows/[id]` | Canvas (dot grid, gold edges); left **node palette** (Triggers / Actions / AI / Logic, searchable); right **config panel** (forms generated from plugin `configFields`, field picker for templates, "Test step"); bottom **run drawer** (live log); top bar: name, **Draft / Published v3** badge, enable toggle, Test run, Publish, Share form; floating **Copilot** panel (chat + "Generate", diff preview, Apply) | Validation issues list (from the base `workflow-issues-overlay`); unsaved changes guard |
| 7 | **Runs** `/app/runs` | Table: status, workflow, trigger, started, duration, attempts, **receipt badge** (Pending / ✓ On-chain); filters; CSV export | Live row insertion via SSE |
| 8 | **Run detail** `/app/runs/[id]` | Header (status, duration, trigger, version hash); **timeline** of steps (expand → redacted input/output, attempts, error); **mini canvas** replay; "Retry from failed step"; **Ask Run Doctor** card; **Receipt** panel (receipt hash, batch, tx link, "Open public verify page") | Running (live), failed, skipped |
| 9 | **Forms** `/app/forms` + editor | Field list editor (drag to reorder, types: text, email, phone, select, textarea, checkbox), consent text, success message, theme (honey/dark); **Share**: URL, **QR code**, embed snippet; submissions table | Closed form state |
| 10 | **Hosted form** `/f/[slug]` | Mobile-first card, workspace logo, fields, consent checkbox, honey submit button, success screen ("You're in! Check your inbox"), "Powered by FlowLedger" | Validation, rate-limit message |
| 11 | **Connections (vault)** `/app/connections` | Grid of integrations with status (OK / Error / Untested), last tested, "Test", "Rotate", "Edit"; add-connection wizard per plugin `formFields`; secrets masked | Error detail with Doctor hint |
| 12 | **Ledger** `/app/ledger` | Batches table (root, leaves, status, tx, block, gas); batch detail (Merkle tree visual: hexagon leaves → root); "Anchor now" (admin); contract address + network badge; **Tamper simulator** (demo workspace) | Chain offline banner |
| 13 | **Public verify** `/verify/[id]` | Standalone page: receipt summary, the **four verification layers** with animated checks, Polygonscan link, "How this works" accordion, download receipt JSON; owner-only data-integrity layer when signed in | ✓ Verified / ⏳ Pending anchor / ✗ Tampered (step highlighted) |
| 14 | **Templates** `/app/templates` | Gallery cards with mini-diagram, "Use template", "Explain" (AI) | — |
| 15 | **Settings** | Workspace (name, logo, AI data sharing toggle, retention); **Members & roles**; **API keys** (create, shown once); **Webhooks** (secret reveal/rotate); **Usage & plan** (meters vs. limits, upgrade CTA); **Audit log**; Profile (2FA) | — |
| 16 | **System** (owner) | bull-board embed (queues, DLQ re-drive), worker list, links to Grafana/Jaeger when running | — |
| 17 | **Legal** `/legal/*` | Privacy, Terms, Cookies, DPDP notice, Open-source licenses | — |
| 18 | **Errors** | 404 "This flow lost its way" (bee illustration), 500 with traceId, maintenance | — |

## Components (shadcn re-themed + ours)
`Button` (honey primary, ghost, outline-metal), `Badge` (status: queued gray, running amber pulse, success green, error red, skipped graphite; **HexBadge** for receipts), `NodeCard` (icon tile, title, subtitle, status ring, handles), `AnimatedEdge`, `KpiTile` (Number Ticker), `Timeline`, `CodeHash` (truncated hash with copy and explorer link), `EmptyState` (bee illustration), `CommandPalette` (⌘K), `ConsentBanner`, `QrCard`, `CopilotPanel`, `DoctorCard`, `VerifyLayers`.

## Accessibility
- All interactive elements are keyboard-reachable. The canvas has a list-view alternative (the "Steps" tab).
- Status is never shown by color alone: icons plus text.
- Visible focus rings (honey). Reduced-motion support. Form labels plus `aria-describedby` on errors. Contrast AA minimum.

## Demo-friendliness checklist
- A 125% zoom preset for projector mode (`?projector=1` enlarges type and nodes).
- No hover-only information during the demo.
- Toasts for every background event (run completed, receipt anchored).
- Seeded data, so no screen is empty on stage.

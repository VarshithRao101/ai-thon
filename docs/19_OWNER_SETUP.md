# 19 — Owner Setup (accounts and keys)

**Ownership (updated 2026-10-10, D-046):** the project owner does every step in this file. Claude builds the code and wires each key as it lands. The schedule is in [PLAN.md](../PLAN.md).

## Rules for every key
- **Never** paste a key, password or token into WhatsApp, Telegram, Discord, GitHub, or a chat with Claude.
- Use a **new demo Gmail**, not anyone's personal account.
- When you finish an item, report "done" plus the *non-secret* part (an address, an email, a Sheet ID). Never the secret itself.
- **Where secrets go:**
  - *Platform keys* (Gemini, Groq, RPC) go into `apps/web/.env.local` on the demo laptop. Open it with Notepad and fill in the `NAME=value` line. The file is gitignored.
  - *Connector secrets* (Gmail app password, service-account JSON, Telegram token) are pasted into the app's **Connections** dialog when we say it's ready. They're stored encrypted. Until then, keep them in a password manager or a private note.

## 1. Fund the testnet wallet (15 min; start first)
- Address: **`0xc7aC6059DD12b92E2fff7fea69a008f3a8664dC3`** (Polygon **Amoy testnet only**; it never holds real money).
- Request free **Amoy POL** from every faucet that works for you:
  - https://faucet.polygon.technology (pick Polygon Amoy; may need a login)
  - https://www.alchemy.com/faucets/polygon-amoy
  - https://faucet.quicknode.com/polygon/amoy
  - https://faucets.chain.link/polygon-amoy
- Some ask for a login or a small mainnet balance. If one refuses, try the next.
- **Target: ≥ 0.2 POL.** Check the balance at https://amoy.polygonscan.com/address/0xc7aC6059DD12b92E2fff7fea69a008f3a8664dC3
- Report: the balance.

## 2. Gemini API key (5 min)
1. https://aistudio.google.com → **Get API key** → **Create API key**.
2. In `apps/web/.env.local` set `GOOGLE_GENERATIVE_AI_API_KEY=` to the key.
3. From AI Studio's model list, copy two **exact model IDs**: a fast "Flash" model into `AI_MODEL_FAST=`, and a stronger "Pro" model into `AI_MODEL_SMART=`. We never hardcode model names.
4. *(Optional backup)* https://console.groq.com → API Keys. Set `GROQ_API_KEY=`, `AI_FALLBACK_PROVIDER=groq`, and copy one model ID from Groq's model list into `AI_FALLBACK_MODEL=`.
- Report: "Gemini done" plus the two model IDs (IDs are not secret).

## 3. Gmail sender (10 min)
1. Create a new Gmail account for the demo (e.g. `flowledger.demo…@gmail.com`).
2. Turn on **2-Step Verification** (Google Account → Security).
3. Go to https://myaccount.google.com/apppasswords, create an app password named "FlowLedger" and keep the **16-character password**.
- Report: the Gmail address.

## 4. Google Sheets (20 min)
1. https://console.cloud.google.com → create a project named `flowledger`. Use a personal Google account: college Workspace accounts often block service-account keys.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create** `flowledger-sheets` (no roles needed) → open it → **Keys → Add key → JSON**. Keep the downloaded file private.
4. Create a Google Sheet named **FlowLedger Demo — Registrations** with this header row in row 1:
   `Submitted At | Name | Email | College | Idea | Track | Run ID`
5. **Share** the Sheet with the service account's email (`client_email` in the JSON, ending in `iam.gserviceaccount.com`) as **Editor**.
6. Copy the **spreadsheet ID** from the URL: the part between `/d/` and `/edit`.
- Report: the spreadsheet ID and the service-account email.

## 5. Telegram (10 min)
1. In Telegram, open **@BotFather** → `/newbot` → name it "FlowLedger Bot", with a username ending in `bot`. Keep the **token**.
2. Create a group named **FlowLedger Live**, add the bot, then send `/start@<your_bot_username>` in the group.
3. To get the **chat id**, open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser **on the laptop only** (the URL contains the token, so never share it). Find `"chat":{"id":-100…`; that negative number is the chat id.
- Report: the chat id (not secret) and the bot username.

## 6. Optional: a reliable chain RPC (5 min)
https://dashboard.alchemy.com → create an app on **Polygon Amoy** → copy its HTTPS URL into `CHAIN_RPC_URL=` in `.env.local`. Without it we use the public publicnode Amoy RPC.

## 7. Non-key work
- **Verify competitor facts** in [13](13_BUSINESS_MARKET.md): open zapier.com/pricing, make.com/pricing and pabbly.com/connect, and screenshot today's prices and whether each has an AI builder or forms. Update the "(verify)" cells.
- **Draft the deck** ([17](17_DEMO_AND_PITCH.md)) in black and gold: slides 1 (title), 2 (problem), 8 (market), 10 (future scope and team).
- **Demo props:** a phone with mobile data to use as a hotspot, the Telegram group open on a second screen, and the demo Gmail logged in on a spare phone.

## 8. cloudflared (5 min)
`winget install Cloudflare.cloudflared` on the demo laptop. It gives the hosted form a public HTTPS link for judges' phones (PLAN.md, Block D).

## Check your progress
`pnpm keys:check` lists which `.env.local` keys are filled (names only). Each connection in the app has a **Test** button.

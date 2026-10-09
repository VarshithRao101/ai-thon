# 09 — AI Features

The rubric says "AI must meaningfully improve the solution." Each feature below removes real work for a non-technical user. None is decoration.

## Provider layer
- The **AI SDK** (`ai`, Apache-2.0) with `@ai-sdk/google` (Gemini, free tier) as primary and `@ai-sdk/groq` (free tier) as the automatic fallback on error or 429.
- **Model names come only from env:** `AI_PRIMARY_PROVIDER`, `AI_MODEL_FAST`, `AI_MODEL_SMART`, `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`.
- Every call is logged to `ai_calls`: feature, provider, model, tokens, latency, ok. The dashboard shows AI usage.
- Structured output everywhere: `generateObject` / `streamObject` with zod schemas, so there's no regex parsing of model text.
- **Free-tier caveat:** free LLM tiers may use prompts to improve their models. The privacy policy says so, and the workspace setting **"Send form data to AI"** defaults to ON for the demo workspace and OFF for new workspaces. We recommend paid tiers for production.

## 1. Copilot: plain English → working workflow
**Flow:** user prompt → system prompt built from the plugin registry (the base template's `generateAIActionPrompts`, plus our node catalog and template syntax) → model streams **typed operations** (`addNode`, `addEdge`, `updateNode`, `setName` from the base protocol, now zod-validated) → the canvas animates nodes appearing.

**After generation:**
1. **Validate** with the same validator as publish ([07](07_HIVE_ENGINE.md)).
2. **Self-repair loop:** if validation fails, send the errors back for one repair round.
3. **Auto-layout** with `@dagrejs/dagre` (MIT), top to bottom.
4. **Credential chips:** nodes needing a connection show "Connect Google Sheets →", which opens the vault for that integration type.

**Further capabilities:**
- **Multi-turn edits:** "also send a Discord message when the score is hot" → diff operations against the current graph.
- **Offline fallback:** if both providers fail, keyword-match the prompt to the 5 templates, so the demo never hangs.
- **Explain workflow:** a plain-language summary of any workflow, for the template gallery and judges.

## 2. AI nodes inside workflows
| Node | Output schema | Hero-flow use |
|---|---|---|
| AI: Classify | `{label: enum(labels), confidence: 0–1 (model-reported), reason}` | Registration → track (AI/Web/Blockchain) or lead → hot/warm/cold |
| AI: Extract JSON | dynamic zod object from the fields the user defines | Pull name, college and skills out of free text |
| AI: Draft Email | `{subject, body}` (body ≤ 1,200 chars, plain text, HTML-escaped when sent) | A personalized confirmation email |
| AI: Generate Text | `{text}` | Any text |
| AI: Summarize | `{summary, bullets[]}` | Daily digest template |

**Prompt-injection guardrails:**
- Form content is **untrusted data**. It is wrapped in `<user_data>` tags, and the system prompt says to treat it only as data.
- Outputs are schema-validated and length-capped.
- AI output is never executed as code, never used as a URL for the HTTP node without the SSRF guard, and never used to pick a recipient outside the configured template fields.

## 3. Run Doctor: failed run → plain-language fix
**Input:**
- the failed step's error class and message
- its redacted input preview
- the node's config schema and current config
- the last successful run of the same node, if any

**Output (zod):**
```ts
{ cause: string; explanation: string;              // plain language, ≤ 3 sentences
  fixType: "config_patch" | "reconnect_credential" | "retry_later" | "external_issue";
  patch?: JsonPatchOp[];                            // RFC 6902, applied to node.config only
  confidence: "low" | "medium" | "high" }
```
**UI:** "Ask Run Doctor" on any failed step → a card with the cause, the explanation and a highlighted diff of the patch → **Apply fix**. Applying patches the draft, re-publishes after confirmation, and retries from the failed step.

**Guardrails:**
- The patch can only touch `node.config` keys that exist in that node's schema.
- It never touches credentials.
- It must pass the validator.

**Demo:** a Sheet column renamed on purpose → Doctor suggests remapping → Apply → green.

## 4. Field mapper
Given the form fields and the Sheet's header row (read live), it proposes `{formField → column}` with a confidence per pair. Low-confidence pairs are highlighted for the user to confirm. It can also suggest new columns to create.

## Evaluation (honest numbers only)
- A golden set of 20 copilot prompts (`eval/copilot-golden.json`). The pass condition: the validator passes **and** the expected node types are present.
- A run script prints the pass rate per model. We quote only a measured rate, as "x/20 on our test set", and never say "accurate".
- Run Doctor: 8 seeded failure cases → measure the share of correct `fixType` values.

## Cost control
- Copilot uses `AI_MODEL_SMART`. Nodes, mapper and Doctor use `AI_MODEL_FAST`.
- Per-workspace monthly token quota by plan. Over the quota, AI nodes fail with class `validation` and a message to upgrade.

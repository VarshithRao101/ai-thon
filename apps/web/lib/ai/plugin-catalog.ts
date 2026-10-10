import { flattenConfigFields, getAllIntegrations } from "@/plugins";
import type { Catalog, CatalogEntry } from "./plan";

// Apps with hand-tuned Copilot entries in COPILOT_ACTIONS (lib/ai/plan.ts).
const BUILT_IN = new Set(["ai", "google-sheets", "smtp-email", "telegram"]);

// Words that name each app in a request, beyond its label and type.
const ALIASES: Record<string, string[]> = {
  "ai-gateway": ["ai gateway", "gpt", "openai", "image"],
  blob: ["blob", "file storage", "upload"],
  fal: ["fal", "image", "video"],
  firecrawl: ["firecrawl", "scrape", "crawl", "website"],
  github: ["github", "issue", "repo", "pull request"],
  linear: ["linear", "ticket"],
  perplexity: ["perplexity", "web search", "research"],
  resend: ["resend"],
  slack: ["slack"],
  stripe: ["stripe", "invoice", "payment", "customer"],
  superagent: ["superagent", "guard", "redact"],
  v0: ["v0", "generate ui", "website builder"],
  webflow: ["webflow", "cms"],
  clerk: ["clerk"],
};

const NON_WORD = /[^a-z0-9]+/g;

function mentions(text: string, words: string[]): boolean {
  const hay = ` ${text.toLowerCase().replace(NON_WORD, " ")} `;
  return words.some((w) => hay.includes(` ${w.replace(NON_WORD, " ")} `));
}

function entryFor(
  plugin: ReturnType<typeof getAllIntegrations>[number],
  action: ReturnType<typeof getAllIntegrations>[number]["actions"][number]
): CatalogEntry {
  const config: Record<string, string> = {};
  for (const f of flattenConfigFields(action.configFields)) {
    if (f.type === "schema-builder") {
      continue;
    }
    const choices = f.options?.map((o) => o.value).join(" | ");
    const hint = choices ? `one of: ${choices}` : (f.example ?? "");
    config[f.key] =
      `${f.label}${f.required ? "" : " (optional)"}${hint ? `, e.g. ${hint}` : ""}`;
  }
  return {
    label: action.label,
    use: `${action.description} (${plugin.label})`,
    config,
    outputs: (action.outputFields ?? []).map((o) => o.field),
    integration: plugin.formFields.length > 0 ? plugin.type : undefined,
    app: plugin.label,
  };
}

/**
 * Copilot entries for the other apps: those the workspace connected, plus any
 * the request names ("post it to Slack"). Leaving the rest out keeps the
 * prompt short, which keeps plans accurate (scripts/eval-copilot.ts).
 */
export function pluginCatalog(
  connectedTypes: readonly string[],
  request = ""
): Catalog {
  const connected = new Set(connectedTypes);
  const out: Record<string, CatalogEntry> = {};
  for (const plugin of getAllIntegrations()) {
    if (BUILT_IN.has(plugin.type)) {
      continue;
    }
    const words = [
      plugin.type,
      plugin.label.toLowerCase(),
      ...(ALIASES[plugin.type] ?? []),
    ];
    if (!(connected.has(plugin.type) || mentions(request, words))) {
      continue;
    }
    for (const action of plugin.actions) {
      out[`${plugin.type}/${action.slug}`] = entryFor(plugin, action);
    }
  }
  return out;
}

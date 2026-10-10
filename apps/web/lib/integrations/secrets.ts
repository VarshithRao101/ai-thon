import "server-only";

import type { IntegrationConfig } from "@/lib/types/integration";
import { getIntegration as getPlugin } from "@/plugins";

/**
 * Write-only secrets (D-054). Once saved, password-type connector fields
 * (bot tokens, app passwords, service-account keys, API keys) never leave the
 * server again: reads return a mask, and an update that sends the mask back
 * keeps the stored value. Non-secret fields (email address, chat id, sheet id)
 * stay readable so the edit form still makes sense.
 */
export const SECRET_MASK = "••••••••";

// Keys treated as secret even if a plugin forgot to mark them as passwords.
const ALWAYS_SECRET = /(key|token|secret|password|private|credential|json)/i;

function secretKeys(type: string, config: IntegrationConfig): Set<string> {
  const plugin = getPlugin(type as never);
  const marked = (plugin?.formFields ?? [])
    .filter((f) => f.type === "password")
    .map((f) => f.configKey);
  return new Set([
    ...marked,
    ...Object.keys(config).filter((k) => ALWAYS_SECRET.test(k)),
  ]);
}

export function maskSecrets(
  type: string,
  config: IntegrationConfig
): IntegrationConfig {
  const secret = secretKeys(type, config);
  const out: IntegrationConfig = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = secret.has(key) && value ? SECRET_MASK : value;
  }
  return out;
}

/**
 * An edit sends only the fields the person changed: keep every stored value
 * the client left empty, unchanged or masked.
 */
export function mergeSecrets(
  _type: string,
  incoming: IntegrationConfig,
  stored: IntegrationConfig
): IntegrationConfig {
  const merged: IntegrationConfig = { ...stored };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== "" && value !== SECRET_MASK) {
      merged[key] = value;
    }
  }
  return merged;
}

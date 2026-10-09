import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption primitives (docs/10 "Credential vault").
 *
 *   master key (KEK, env, versioned) ──wraps──▶ workspace data key (DEK, DB)
 *   workspace DEK ──seals──▶ integration secrets (DB)
 *
 * AES-256-GCM with a fresh 96-bit IV per seal. The workspace id is bound in as
 * additional authenticated data, so a ciphertext copied into another
 * workspace's row fails authentication instead of decrypting.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SECRET_PREFIX = "v2:";
const WRAPPED_KEY_VERSION = /^k(\d+):/;
const MASTER_KEY_ENV = /^VAULT_MASTER_KEY_V(\d+)$/;
const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

function unb64(text: string): Buffer {
  return Buffer.from(text, "base64url");
}

export function generateDataKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** Seal with AES-256-GCM. Output: `iv.tag.ciphertext` (base64url). */
export function seal(
  key: Buffer,
  plaintext: Buffer | string,
  aad: string
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(body)}`;
}

export function open(key: Buffer, sealed: string, aad: string): Buffer {
  const parts = sealed.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed sealed value");
  }
  const [iv, tag, body] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, unb64(iv));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(unb64(tag));
  return Buffer.concat([decipher.update(unb64(body)), decipher.final()]);
}

const dekAad = (workspaceId: string) => `flowledger:dek:${workspaceId}`;
const secretAad = (workspaceId: string) => `flowledger:secret:${workspaceId}`;

/** Wrap a workspace DEK with master key version `version`. Output: `k<version>:<sealed>`. */
export function wrapDataKey(
  dek: Buffer,
  kek: Buffer,
  version: number,
  workspaceId: string
): string {
  return `k${version}:${seal(kek, dek, dekAad(workspaceId))}`;
}

export function wrappedKeyVersion(wrapped: string): number {
  const match = WRAPPED_KEY_VERSION.exec(wrapped);
  if (!match?.[1]) {
    throw new Error("Malformed wrapped data key");
  }
  return Number(match[1]);
}

export function unwrapDataKey(
  wrapped: string,
  keks: ReadonlyMap<number, Buffer>,
  workspaceId: string
): Buffer {
  const version = wrappedKeyVersion(wrapped);
  const kek = keks.get(version);
  if (!kek) {
    throw new Error(`Master key version ${version} is not configured`);
  }
  return open(
    kek,
    wrapped.slice(wrapped.indexOf(":") + 1),
    dekAad(workspaceId)
  );
}

export function encryptSecret(
  dek: Buffer,
  plaintext: string,
  workspaceId: string
): string {
  return SECRET_PREFIX + seal(dek, plaintext, secretAad(workspaceId));
}

export function decryptSecret(
  dek: Buffer,
  ciphertext: string,
  workspaceId: string
): string {
  if (!ciphertext.startsWith(SECRET_PREFIX)) {
    throw new Error("Not a vault v2 ciphertext");
  }
  return open(
    dek,
    ciphertext.slice(SECRET_PREFIX.length),
    secretAad(workspaceId)
  ).toString("utf8");
}

export function isVaultCiphertext(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}

/** Decrypt the base template's format (`iv:tag:data` hex, single global key). */
export function decryptLegacy(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid legacy encrypted data format");
  }
  const [iv, tag, data] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
}

/**
 * Master keys from env: VAULT_MASTER_KEY_V1, _V2, … (64 hex chars each). The
 * highest version is current. Falls back to the template's
 * INTEGRATION_ENCRYPTION_KEY as version 1 so existing setups keep working.
 */
export function loadMasterKeys(env: Record<string, string | undefined>): {
  keys: Map<number, Buffer>;
  current: number;
} {
  const keys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    const match = MASTER_KEY_ENV.exec(name);
    if (match?.[1] && value) {
      keys.set(Number(match[1]), parseKey(name, value));
    }
  }
  if (keys.size === 0 && env.INTEGRATION_ENCRYPTION_KEY) {
    keys.set(
      1,
      parseKey("INTEGRATION_ENCRYPTION_KEY", env.INTEGRATION_ENCRYPTION_KEY)
    );
  }
  if (keys.size === 0) {
    throw new Error(
      "No vault master key: set VAULT_MASTER_KEY_V1 (or INTEGRATION_ENCRYPTION_KEY)"
    );
  }
  return { keys, current: Math.max(...keys.keys()) };
}

function parseKey(name: string, hex: string): Buffer {
  if (!HEX_32_BYTES.test(hex)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

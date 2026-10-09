import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptLegacy,
  decryptSecret,
  encryptSecret,
  generateDataKey,
  isVaultCiphertext,
  loadMasterKeys,
  unwrapDataKey,
  wrapDataKey,
  wrappedKeyVersion,
} from "./crypto";

const KEK_V1 = randomBytes(32);
const KEK_V2 = randomBytes(32);

describe("vault envelope encryption", () => {
  it("round-trips a secret through the workspace data key", () => {
    const dek = generateDataKey();
    const sealed = encryptSecret(dek, '{"apiKey":"sk_live_123"}', "ws_a");
    expect(isVaultCiphertext(sealed)).toBe(true);
    expect(sealed).not.toContain("sk_live_123");
    expect(decryptSecret(dek, sealed, "ws_a")).toBe('{"apiKey":"sk_live_123"}');
  });

  it("uses a fresh IV every time (same input, different ciphertext)", () => {
    const dek = generateDataKey();
    expect(encryptSecret(dek, "x", "ws_a")).not.toBe(
      encryptSecret(dek, "x", "ws_a")
    );
  });

  it("refuses a ciphertext moved to another workspace (AAD binding)", () => {
    const dek = generateDataKey();
    const sealed = encryptSecret(dek, "secret", "ws_a");
    expect(() => decryptSecret(dek, sealed, "ws_b")).toThrow();
  });

  it("detects tampering with any single ciphertext byte", () => {
    const dek = generateDataKey();
    const sealed = encryptSecret(dek, "secret value", "ws_a");
    const [prefix, iv, tag, body] = sealed.replace(":", ".").split(".");
    const bytes = Buffer.from(body as string, "base64url");
    for (let i = 0; i < bytes.length; i++) {
      const tampered = Buffer.from(bytes);
      tampered[i] = (tampered[i] as number) ^ 0x01;
      const forged = `${prefix}:${iv}.${tag}.${tampered.toString("base64url")}`;
      expect(() => decryptSecret(dek, forged, "ws_a")).toThrow();
    }
  });

  it("wraps and unwraps the data key with a versioned master key", () => {
    const dek = generateDataKey();
    const wrapped = wrapDataKey(dek, KEK_V1, 1, "ws_a");
    expect(wrappedKeyVersion(wrapped)).toBe(1);
    const keys = new Map([[1, KEK_V1]]);
    expect(unwrapDataKey(wrapped, keys, "ws_a").equals(dek)).toBe(true);
    expect(() => unwrapDataKey(wrapped, keys, "ws_b")).toThrow();
  });

  it("rotates the master key without touching sealed secrets", () => {
    const dek = generateDataKey();
    const secret = encryptSecret(dek, "token", "ws_a");
    const keys = new Map([
      [1, KEK_V1],
      [2, KEK_V2],
    ]);
    const v1 = wrapDataKey(dek, KEK_V1, 1, "ws_a");
    const v2 = wrapDataKey(unwrapDataKey(v1, keys, "ws_a"), KEK_V2, 2, "ws_a");
    expect(wrappedKeyVersion(v2)).toBe(2);
    const recovered = unwrapDataKey(v2, new Map([[2, KEK_V2]]), "ws_a");
    expect(decryptSecret(recovered, secret, "ws_a")).toBe("token");
  });

  it("fails clearly when a needed master key version is missing", () => {
    const wrapped = wrapDataKey(generateDataKey(), KEK_V2, 2, "ws_a");
    expect(() =>
      unwrapDataKey(wrapped, new Map([[1, KEK_V1]]), "ws_a")
    ).toThrow("version 2 is not configured");
  });

  it("still reads the base template's legacy format", () => {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = cipher.update("legacy", "utf8", "hex") + cipher.final("hex");
    const legacy = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data}`;
    expect(isVaultCiphertext(legacy)).toBe(false);
    expect(decryptLegacy(legacy, key)).toBe("legacy");
  });
});

describe("loadMasterKeys", () => {
  const hex = (b: Buffer) => b.toString("hex");

  it("picks the highest configured version as current", () => {
    const { keys, current } = loadMasterKeys({
      VAULT_MASTER_KEY_V1: hex(KEK_V1),
      VAULT_MASTER_KEY_V2: hex(KEK_V2),
    });
    expect(current).toBe(2);
    expect(keys.size).toBe(2);
  });

  it("falls back to INTEGRATION_ENCRYPTION_KEY as version 1", () => {
    const { keys, current } = loadMasterKeys({
      INTEGRATION_ENCRYPTION_KEY: hex(KEK_V1),
    });
    expect(current).toBe(1);
    expect(keys.get(1)?.equals(KEK_V1)).toBe(true);
  });

  it("rejects malformed keys without echoing them", () => {
    expect(() =>
      loadMasterKeys({ VAULT_MASTER_KEY_V1: "not-a-key-value-xyz" })
    ).toThrow("VAULT_MASTER_KEY_V1 must be 64 hex characters");
    try {
      loadMasterKeys({ VAULT_MASTER_KEY_V1: "not-a-key-value-xyz" });
    } catch (error) {
      expect((error as Error).message).not.toContain("not-a-key-value-xyz");
    }
  });

  it("requires at least one key", () => {
    expect(() => loadMasterKeys({})).toThrow("No vault master key");
  });
});

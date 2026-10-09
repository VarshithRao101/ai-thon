import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
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

/** Unwrapped workspace data keys stay in memory briefly to avoid a DB read per secret. */
const DEK_CACHE_TTL_MS = 5 * 60_000;
const dekCache = new Map<string, { dek: Buffer; expiresAt: number }>();

let masterKeysMemo: ReturnType<typeof loadMasterKeys> | undefined;
function masterKeys() {
  masterKeysMemo ??= loadMasterKeys(process.env);
  return masterKeysMemo;
}

async function readWrappedKey(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ dekEnc: workspaces.dekEnc })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!row) {
    throw new Error("Workspace not found");
  }
  return row.dekEnc;
}

/** The workspace's data key, created on first use (race-safe). */
async function workspaceDataKey(workspaceId: string): Promise<Buffer> {
  const cached = dekCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.dek;
  }
  const { keys, current } = masterKeys();
  let wrapped = await readWrappedKey(workspaceId);
  if (!wrapped) {
    const kek = keys.get(current) as Buffer;
    const candidate = wrapDataKey(generateDataKey(), kek, current, workspaceId);
    await db
      .update(workspaces)
      .set({ dekEnc: candidate, dekKeyVersion: current })
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.dekEnc)));
    // Re-read: if a concurrent request won the race, use its key.
    wrapped = (await readWrappedKey(workspaceId)) as string;
  }
  const dek = unwrapDataKey(wrapped, keys, workspaceId);
  dekCache.set(workspaceId, { dek, expiresAt: Date.now() + DEK_CACHE_TTL_MS });
  return dek;
}

export async function sealForWorkspace(
  workspaceId: string,
  plaintext: string
): Promise<string> {
  return encryptSecret(
    await workspaceDataKey(workspaceId),
    plaintext,
    workspaceId
  );
}

export async function openForWorkspace(
  workspaceId: string,
  ciphertext: string
): Promise<string> {
  if (!isVaultCiphertext(ciphertext)) {
    // Written by the base template before the vault existed (single global key).
    const legacyKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!legacyKey) {
      throw new Error(
        "Legacy ciphertext found but INTEGRATION_ENCRYPTION_KEY is not set"
      );
    }
    return decryptLegacy(ciphertext, Buffer.from(legacyKey, "hex"));
  }
  return decryptSecret(
    await workspaceDataKey(workspaceId),
    ciphertext,
    workspaceId
  );
}

/**
 * Master-key rotation for one workspace: re-wrap its data key under the newest
 * VAULT_MASTER_KEY_V<n>. Sealed secrets are untouched (that is the point of
 * envelope encryption), so this is O(1) per workspace.
 */
export async function rotateWorkspaceMasterKey(
  workspaceId: string
): Promise<{ from: number; to: number; rotated: boolean }> {
  const { keys, current } = masterKeys();
  const wrapped = await readWrappedKey(workspaceId);
  if (!wrapped) {
    await workspaceDataKey(workspaceId);
    return { from: current, to: current, rotated: false };
  }
  const from = wrappedKeyVersion(wrapped);
  if (from === current) {
    return { from, to: current, rotated: false };
  }
  const dek = unwrapDataKey(wrapped, keys, workspaceId);
  const rewrapped = wrapDataKey(
    dek,
    keys.get(current) as Buffer,
    current,
    workspaceId
  );
  await db
    .update(workspaces)
    .set({ dekEnc: rewrapped, dekKeyVersion: current })
    .where(eq(workspaces.id, workspaceId));
  dekCache.delete(workspaceId);
  return { from, to: current, rotated: true };
}

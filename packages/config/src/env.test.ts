import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "./env";

const KEY = "a".repeat(64);
const base = {
  DATABASE_URL: "postgres://u:p@localhost:5433/flowledger",
  INTEGRATION_ENCRYPTION_KEY: KEY,
};
const web = {
  ...base,
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("loadEnv", () => {
  it("accepts a valid web env and applies defaults", () => {
    const env = loadEnv("web", web);
    expect(env.NODE_ENV).toBe("development");
    expect(env.AI_PRIMARY_PROVIDER).toBe("google");
    expect(env.AI_MODEL_FAST).toBeUndefined();
  });

  it("lists every missing variable by name", () => {
    try {
      loadEnv("worker", {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const vars = (error as EnvError).problems.map((p) => p.variable).sort();
      expect(vars).toEqual([
        "DATABASE_URL",
        "INTEGRATION_ENCRYPTION_KEY",
        "REDIS_URL",
      ]);
      expect((error as EnvError).message).toContain("is required but not set");
    }
  });

  it("never echoes secret values in the error message", () => {
    const leaked = "0xDEADBEEF-this-is-a-secret-value";
    try {
      loadEnv("anchorer", {
        ...base,
        CHAIN_RPC_URL: "http://localhost:8545",
        ANCHOR_CONTRACT_ADDRESS: `0x${"1".repeat(40)}`,
        ANCHORER_PRIVATE_KEY: leaked,
      });
      expect.unreachable();
    } catch (error) {
      const message = (error as EnvError).message;
      expect(message).toContain("ANCHORER_PRIVATE_KEY");
      expect(message).not.toContain(leaked);
    }
  });

  it("treats empty strings as unset", () => {
    expect(() => loadEnv("scheduler", { ...base, REDIS_URL: "" })).toThrow(
      /REDIS_URL: is required/
    );
  });

  it("coerces numeric chain settings and validates their bounds", () => {
    const env = loadEnv("anchorer", {
      ...base,
      CHAIN_ID: "80002",
      CHAIN_RPC_URL: "https://rpc-amoy.polygon.technology",
      ANCHOR_CONTRACT_ADDRESS: `0x${"a".repeat(40)}`,
      ANCHORER_PRIVATE_KEY: `0x${"b".repeat(64)}`,
    });
    expect(env.CHAIN_ID).toBe(80_002);
    expect(env.ANCHOR_INTERVAL_MS).toBe(30_000);
    expect(() =>
      loadEnv("anchorer", {
        ...base,
        CHAIN_RPC_URL: "http://localhost:8545",
        ANCHOR_CONTRACT_ADDRESS: `0x${"a".repeat(40)}`,
        ANCHORER_PRIVATE_KEY: `0x${"b".repeat(64)}`,
        ANCHOR_INTERVAL_MS: "100",
      })
    ).toThrow(/ANCHOR_INTERVAL_MS/);
  });

  it("rejects a malformed encryption key", () => {
    expect(() =>
      loadEnv("web", { ...web, INTEGRATION_ENCRYPTION_KEY: "short" })
    ).toThrow(/INTEGRATION_ENCRYPTION_KEY: must be 64 hex characters/);
  });
});

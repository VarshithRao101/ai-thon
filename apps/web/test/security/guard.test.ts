import { describe, expect, it } from "vitest";
import { checkBodySize, checkOrigin, checkRate } from "@/lib/security/guard";

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("https://ai-thon-zeta.vercel.app/api/workflows/create", {
    method,
    headers,
  });

describe("API guards", () => {
  it("blocks cross-site writes but allows our own pages, scripts and reads", () => {
    expect(
      checkOrigin(req("POST", { origin: "https://evil.example" }))?.status
    ).toBe(403);
    expect(
      checkOrigin(req("POST", { origin: "https://ai-thon-zeta.vercel.app" }))
    ).toBeNull();
    expect(checkOrigin(req("POST"))).toBeNull();
    expect(
      checkOrigin(req("GET", { origin: "https://evil.example" }))
    ).toBeNull();
  });

  it("refuses oversized bodies", () => {
    expect(
      checkBodySize(req("POST", { "content-length": "5000000" }))?.status
    ).toBe(413);
    expect(checkBodySize(req("POST", { "content-length": "2000" }))).toBeNull();
  });

  it("rate-limits sensitive scopes per user", () => {
    const user = `u-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkRate(user, "integrations.try")).toBeNull();
    }
    expect(checkRate(user, "integrations.try")?.status).toBe(429);
    expect(checkRate(`${user}-other`, "integrations.try")).toBeNull();
  });
});

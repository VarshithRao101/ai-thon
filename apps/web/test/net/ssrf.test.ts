import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  BlockedUrlError,
  isPrivateAddress,
} from "@/lib/net/ssrf";

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("%s is private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "142.250.183.14",
    "2606:4700::1111",
  ])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it.each([
    "http://localhost:5433/",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]:3000/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "not a url",
  ])("blocks %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("allows a public IP literal", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(
      URL
    );
  });
});

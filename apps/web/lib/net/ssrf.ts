import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for user-supplied URLs (docs/10 "Known gaps"): http(s) only, and
 * every address the host resolves to must be public. Redirects are followed
 * manually so each hop is checked too. Remaining risk: DNS rebinding between
 * the check and the connection (documented).
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
const UNIQUE_LOCAL = /^f[cd]/;
const LINK_LOCAL = /^fe[89ab]/;
const BRACKETS = /^\[|\]$/g;

/** Dotted quad → integer (arithmetic, not bit operations). */
function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(ipv4ToInt(base) / size);
  });
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") {
    return true;
  }
  const mapped = IPV4_MAPPED.exec(lower);
  if (mapped?.[1]) {
    return isPrivateV4(mapped[1]);
  }
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast
  return (
    UNIQUE_LOCAL.test(lower) || LINK_LOCAL.test(lower) || lower.startsWith("ff")
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateV4(ip);
  }
  if (version === 6) {
    return isPrivateV6(ip);
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Not a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BlockedUrlError("Only http and https URLs are allowed");
  }
  if (process.env.HTTP_STEP_ALLOW_PRIVATE === "true") {
    return url;
  }
  const host = url.hostname.replace(BRACKETS, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    throw new BlockedUrlError(
      "Requests to local or internal hosts are blocked"
    );
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new BlockedUrlError(`Could not resolve ${host}`);
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedUrlError(
      "Requests to private network addresses are blocked"
    );
  }
  return url;
}

const MAX_REDIRECTS = 3;

/** fetch() for user-supplied URLs: every hop must be public. */
export async function safeFetch(
  raw: string,
  init: RequestInit = {}
): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new BlockedUrlError("Too many redirects");
}

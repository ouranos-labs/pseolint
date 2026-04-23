import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF guard for audit targets.
 *
 * Two layers:
 *   1. `isPrivateOrReservedHost(hostname)` — fast, synchronous string check.
 *      Catches literal private IPs ("10.0.0.5"), loopback names ("localhost"),
 *      link-local suffixes (".local"), and internal/metadata hostnames.
 *   2. `validateTargetHost(hostname)` — async. Resolves the hostname via DNS
 *      and rejects if the resulting address (v4 or v6) falls into a private /
 *      reserved / link-local / multicast range. Mitigates DNS rebinding where
 *      a public hostname returns 127.0.0.1.
 *
 * Usage:
 *   const hostname = new URL(userSuppliedUrl).hostname;
 *   await validateTargetHost(hostname); // throws SSRFError on blocked targets
 *
 * Library consumers should call this BEFORE enqueuing a crawl. The audit
 * engine itself wraps its own fetches with this check when `guardSsrf` is
 * enabled in AuditOptions, but defense-in-depth at the API boundary is the
 * primary mitigation.
 */

export class SSRFError extends Error {
  readonly hostname: string;
  readonly reason: string;

  constructor(hostname: string, reason: string) {
    super(`Target host "${hostname}" is not permitted: ${reason}`);
    this.name = "SSRFError";
    this.hostname = hostname;
    this.reason = reason;
  }
}

const BLOCKED_HOSTNAME_EXACT = new Set([
  "localhost",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
  "0",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".arpa",
  ".intranet",
  ".lan",
  ".home",
  ".private",
  ".corp",
];

const IPV4_MAPPED_IPV6 = /^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/i;

/**
 * IPv4 range predicate — true if the address is private / reserved /
 * link-local / loopback / multicast / broadcast / CGNAT. Expects a valid
 * dotted-quad; caller must ensure that (e.g. via `net.isIP`).
 */
export function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 — IETF
  if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 — TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 — benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 — TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // 203.0.113.0/24 — TEST-NET-3
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 — multicast
  if (a >= 240) return true; // 240.0.0.0/4 — reserved + 255.255.255.255 broadcast
  return false;
}

/**
 * IPv6 range predicate — true for loopback, ULA, link-local, unspecified,
 * multicast, and IPv4-mapped addresses (after unwrapping to the v4 check).
 */
export function isPrivateIPv6(addr: string): boolean {
  const normalized = addr.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 ULA
  if (normalized.startsWith("ff")) return true; // ff00::/8 multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:0:a.b.c.d) — unwrap and delegate
  const mapped = normalized.match(IPV4_MAPPED_IPV6);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Synchronous string-only check. Rejects:
 *   - literal private / reserved IP addresses
 *   - exact blocked hostnames (localhost, 0, etc.)
 *   - suffix-blocked hostnames (.local, .internal, .arpa, ...)
 *
 * Returns `null` if the host is acceptable, or a human-readable reason
 * string if it should be blocked.
 */
export function isPrivateOrReservedHost(hostname: string): string | null {
  if (!hostname) return "empty hostname";
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAME_EXACT.has(lower)) {
    return `reserved hostname (${lower})`;
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) return `reserved TLD / suffix (${suffix})`;
  }

  const version = isIP(hostname); // 4 | 6 | 0
  if (version === 4 && isPrivateIPv4(hostname)) return "private / reserved IPv4 range";
  if (version === 6) {
    const bare = hostname.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    if (isPrivateIPv6(bare)) return "private / reserved IPv6 range";
  }
  return null;
}

export interface ValidateTargetHostOptions {
  /** Override the DNS resolver — useful for tests or custom resolvers. */
  resolver?: {
    resolve4: (hostname: string) => Promise<string[]>;
    resolve6: (hostname: string) => Promise<string[]>;
  };
}

/**
 * Full SSRF check: the string check above PLUS a DNS lookup to guarantee the
 * resolved address isn't in a private range. Throws `SSRFError` on failure.
 *
 * Time-of-check-vs-time-of-use: an attacker-controlled DNS server can return
 * a public IP on first lookup and a private IP on the subsequent fetch ("DNS
 * rebinding"). Mitigations: cache the resolved IP and dial to THAT IP (host
 * header preserved), or use a resolver that refuses re-resolution within a
 * TTL window. This function validates; it does not pin. For the audit
 * engine's own fetches, the pinning layer is layered on top via `safeFetch`.
 */
export async function validateTargetHost(
  hostname: string,
  options: ValidateTargetHostOptions = {},
): Promise<void> {
  const stringReason = isPrivateOrReservedHost(hostname);
  if (stringReason) throw new SSRFError(hostname, stringReason);

  // Literal IPs pass the DNS step trivially (isIP > 0 ⇒ not a name to resolve).
  if (isIP(hostname) !== 0) return;

  const resolver = options.resolver ?? {
    resolve4: (h) => dns.resolve4(h),
    resolve6: (h) => dns.resolve6(h),
  };

  const [v4, v6] = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);

  const addrs: Array<{ kind: "v4" | "v6"; addr: string }> = [];
  if (v4.status === "fulfilled") for (const a of v4.value) addrs.push({ kind: "v4", addr: a });
  if (v6.status === "fulfilled") for (const a of v6.value) addrs.push({ kind: "v6", addr: a });

  if (addrs.length === 0) {
    throw new SSRFError(hostname, "DNS resolution failed");
  }

  for (const { kind, addr } of addrs) {
    const isPrivate = kind === "v4" ? isPrivateIPv4(addr) : isPrivateIPv6(addr);
    if (isPrivate) {
      throw new SSRFError(hostname, `resolves to private ${kind} address ${addr}`);
    }
  }
}

import { promises as dns } from "node:dns";
import net from "node:net";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
// Cap DNS lookup so unreachable internal hostnames (metadata.google.internal,
// corporate sinkholes, etc.) reject quickly instead of hanging on the OS
// resolver's longer default timeout. 2s is well above public-DNS p99.
const DNS_TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("dns lookup timeout")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
const PRIVATE_V4 = [
  ["0.0.0.0", "0.255.255.255"],
  ["10.0.0.0", "10.255.255.255"],
  ["100.64.0.0", "100.127.255.255"],
  ["127.0.0.0", "127.255.255.255"],
  ["169.254.0.0", "169.254.255.255"],
  ["172.16.0.0", "172.31.255.255"],
  ["192.0.0.0", "192.0.0.255"],
  ["192.168.0.0", "192.168.255.255"],
  ["198.18.0.0", "198.19.255.255"],
  ["224.0.0.0", "239.255.255.255"],
  ["240.0.0.0", "255.255.255.255"],
] as const;

function ipv4ToInt(ip: string): number {
  const p = ip.split(".").map((s) => parseInt(s, 10));
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return PRIVATE_V4.some(([s, e]) => n >= ipv4ToInt(s) && n <= ipv4ToInt(e));
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length);
    if (net.isIPv4(v4)) return isPrivateV4(v4);
  }
  return false;
}

export async function isSafePublicUrl(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (!ALLOWED_SCHEMES.has(u.protocol)) return false;
  const host = u.hostname;
  if (net.isIP(host)) {
    if (net.isIPv4(host) && isPrivateV4(host)) return false;
    if (net.isIPv6(host) && isPrivateV6(host)) return false;
    return true;
  }
  // `dns.lookup` uses the OS resolver (getaddrinfo) which is far more reliable
  // for short-lived requests than c-ares-based resolve4/resolve6 — those time
  // out under cold-start conditions and falsely reject valid public domains.
  try {
    const addrs = await withTimeout(dns.lookup(host, { all: true }), DNS_TIMEOUT_MS);
    if (addrs.length === 0) return false;
    for (const { address, family } of addrs) {
      if (family === 4 && isPrivateV4(address)) return false;
      if (family === 6 && isPrivateV6(address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeUrl(raw: string): Promise<void> {
  if (!(await isSafePublicUrl(raw))) {
    throw new Error("URL appears to be internal, unreachable, or uses a disallowed scheme.");
  }
}

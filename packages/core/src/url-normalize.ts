import { normalize, win32 } from "node:path";
import type { NormalizeUrlOptions } from "./types.js";

const DEFAULTS: Required<NormalizeUrlOptions> = {
  stripQuery: true,
  stripWwwHost: false
};

export function mergeNormalizeUrlOptions(options?: NormalizeUrlOptions): Required<NormalizeUrlOptions> {
  return {
    stripQuery: options?.stripQuery ?? DEFAULTS.stripQuery,
    stripWwwHost: options?.stripWwwHost ?? DEFAULTS.stripWwwHost
  };
}

/**
 * Stable URL/path identity for audits: deduping crawl entries and matching edges.
 * HTTP(S): lowercase host, strip fragment, optional query strip, optional `www.` strip,
 * drop default ports, trim trailing slash on non-root paths.
 * Filesystem: Node path.normalize.
 */
export function normalizeAuditUrl(url: string, options?: NormalizeUrlOptions): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return normalizeHttpUrl(trimmed, mergeNormalizeUrlOptions(options));
    } catch {
      // 2026-05-03 calibration round 2: malformed URLs scraped from page
      // HTML (bare "https://", non-ASCII garbage, etc.) crashed `new URL()`
      // and aborted entire audits. Multiple call sites feed user-controlled
      // strings here (parser hrefs, canonical raw, hreflang href). Return
      // the trimmed input on parse failure so the audit continues; the
      // surrounding rule will surface its own "malformed URL" finding when
      // it makes sense to.
      return trimmed;
    }
  }
  // Drive-letter (D:\…) and UNC (\\host\…) paths are Windows paths regardless
  // of the host OS — posix normalize() treats their backslashes as filename
  // characters and leaves "D:\a\b\..\c" unresolved. Anything else stays on the
  // platform normalizer (posix filenames may legitimately contain backslashes).
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    return win32.normalize(trimmed);
  }
  return normalize(trimmed);
}

function normalizeHttpUrl(url: string, opts: Required<NormalizeUrlOptions>): string {
  const u = new URL(url);
  u.hash = "";
  if (opts.stripQuery) {
    u.search = "";
  }
  let hostname = u.hostname.toLowerCase();
  if (opts.stripWwwHost && hostname.startsWith("www.")) {
    hostname = hostname.slice(4);
  }
  u.hostname = hostname;
  if (u.protocol === "http:" && u.port === "80") {
    u.port = "";
  }
  if (u.protocol === "https:" && u.port === "443") {
    u.port = "";
  }
  let pathname = u.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  u.pathname = pathname || "/";
  return u.href;
}

/**
 * Why an audit run failed, as a stable code the progress page can explain in
 * one cause sentence and one action, with the engine's raw text kept for a
 * "Technical details" disclosure.
 *
 * Storage: no new column (an ALTER ordered against a deploy is exactly what
 * took the app down when 0023 shipped ahead of its DDL). The code rides in the
 * existing `audit.error_message` as a bracketed prefix:
 *
 *   "[http_5xx] Failed to fetch source URL: https://x.com: Failed to fetch source: 503"
 *   "[timeout!] Audit didn't finish within 15 minutes."
 *
 * A trailing `!` inside the brackets means the caller's rate-limit slot was
 * NOT refunded (the stuck-row sweeper can't know which counters the request
 * bumped), so the UI must not offer a "Try again" that is bound to be refused.
 * Legacy rows without a prefix are classified on read.
 *
 * Isomorphic: imported by run-audit (server), the audits API and the /a page.
 */

export const AUDIT_FAILURE_CODES = [
  "robots_blocked",
  "http_4xx",
  "http_5xx",
  "not_html",
  "no_pages",
  "timeout",
  "origin_degraded",
  "unreachable",
  "unknown",
] as const;

export type AuditFailureCode = (typeof AUDIT_FAILURE_CODES)[number];

/** Classify the engine's error text. Order matters: the most specific signal wins. */
export function classifyAuditFailure(message: string, errorName?: string): AuditFailureCode {
  const m = message ?? "";
  if (errorName === "OriginDegradedError" || /origin looks degraded|OriginDegradedError/i.test(m)) return "origin_degraded";
  if (/robots\.txt|robots/i.test(m) && /disallow|blocked|block/i.test(m)) return "robots_blocked";
  const status = m.match(/\b(?:status|fetch source:|HTTP)\s*:?\s*([45]\d\d)\b/i);
  if (status) return status[1].startsWith("4") ? "http_4xx" : "http_5xx";
  if (/does not look like HTML|not html|content-type/i.test(m)) return "not_html";
  if (/no (?:pages|urls|indexable)|0 pages|zero pages|nothing to audit/i.test(m)) return "no_pages";
  if (/timed? ?out|TimeoutError|ETIMEDOUT|deadline|didn't finish/i.test(m) || errorName === "TimeoutError") return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|unable to access|unreachable|failed to fetch source url|socket hang up|certificate/i.test(m)) {
    return "unreachable";
  }
  return "unknown";
}

const PREFIX_RE = /^\[([a-z_0-9]+)(!?)\]\s?/;

/** Build the stored `error_message`: `[code] raw` (or `[code!] raw` when the slot was not refunded). Max 500 chars. */
export function encodeAuditFailure(code: AuditFailureCode, raw: string, opts: { refunded?: boolean } = {}): string {
  const tag = `[${code}${opts.refunded === false ? "!" : ""}] `;
  return (tag + (raw ?? "")).slice(0, 500);
}

export type ParsedAuditFailure = {
  code: AuditFailureCode;
  /** The engine's own text, without our prefix. */
  raw: string;
  /** False only when we know the caller's rate-limit slot is still spent. */
  refunded: boolean;
};

export function parseAuditFailure(stored: string | null | undefined): ParsedAuditFailure {
  const text = stored ?? "";
  const m = text.match(PREFIX_RE);
  if (m && (AUDIT_FAILURE_CODES as readonly string[]).includes(m[1])) {
    return { code: m[1] as AuditFailureCode, raw: text.slice(m[0].length), refunded: m[2] !== "!" };
  }
  return { code: classifyAuditFailure(text), raw: text, refunded: true };
}

/** One cause sentence + one action per code. `host` fills in the site name. */
export function describeAuditFailure(code: AuditFailureCode, host: string | null): { cause: string; action: string } {
  const site = host ?? "the site";
  switch (code) {
    case "robots_blocked":
      return {
        cause: `${site}'s robots.txt blocks our crawler, so there were no pages we were allowed to read.`,
        action: "Allow the user-agent \"pseolint\" in robots.txt, then run the audit again.",
      };
    case "http_4xx":
      return {
        cause: `${site} answered with a client error (4xx), usually a wrong path, a login wall or a firewall rule.`,
        action: "Check the URL opens in a private browser window, or try the root domain.",
      };
    case "http_5xx":
      return {
        cause: `${site} answered with a server error (5xx) when we requested it.`,
        action: "Make sure the site is up, then run the audit again.",
      };
    case "not_html":
      return {
        cause: "The URL didn't return a web page or a sitemap, so there was nothing to audit.",
        action: "Use the homepage or the sitemap.xml URL instead.",
      };
    case "no_pages":
      return {
        cause: `We couldn't find any indexable pages on ${site}.`,
        action: "Check the sitemap lists your pages and they aren't marked noindex, then try again.",
      };
    case "timeout":
      return {
        cause: "The audit didn't finish in time. Very large sitemaps or slow responses can do this.",
        action: "Run it again; a warm cache usually makes the second run much faster.",
      };
    case "origin_degraded":
      return {
        cause: `We stopped early to protect your server: ${site} slowed down sharply while we were crawling.`,
        action: "Warm the cache by visiting a few pages, then run the audit again.",
      };
    case "unreachable":
      return {
        cause: `We couldn't connect to ${site}.`,
        action: "Check the domain is spelled correctly and the site is live, then try again.",
      };
    default:
      return {
        cause: "The audit stopped because of an unexpected error.",
        action: "Try again. If it keeps happening, try the root domain instead of a deep link.",
      };
  }
}

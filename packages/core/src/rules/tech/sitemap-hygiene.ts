import type { RuleResult } from "../../types.js";

/** Max URLs listed in a rollup finding's relatedUrls (total count goes in the message). */
const RELATED_URLS_CAP = 10;

/** 24 hours in milliseconds: tolerance before a lastmod counts as "in the future". */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** Generated-lastmod heuristic: minimum URLs carrying a lastmod before the check applies. */
const GENERATED_LASTMOD_MIN_URLS = 100;

/** Generated-lastmod heuristic: fraction of lastmods that must share the exact same value. */
const GENERATED_LASTMOD_SHARE = 0.95;

/**
 * W3C Datetime / sitemap `<lastmod>` format, matching every form the cited NOTE
 * permits (https://www.w3.org/TR/NOTE-datetime): year `YYYY`, year and month
 * `YYYY-MM`, complete date `YYYY-MM-DD`, and a complete date followed by a time
 * (`Thh:mm` / `Thh:mm:ss` / fractional seconds) with a timezone designator.
 *
 * `YYYY` and `YYYY-MM` used to be rejected here. That contradicted the very
 * document the finding cites, and there is nothing else to cite instead:
 * Google's build-sitemap page states only that it "uses the <lastmod> value if
 * it's consistently and verifiably accurate" and delegates the format to
 * sitemaps.org, which in turn points at this same W3C profile. A coarse-grained
 * lastmod may be a WEAK signal, but it is not a malformed one, and this rule
 * only reports values that cannot be parsed at all.
 */
const W3C_DATETIME_RE =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;

/** Lowercase a hostname and strip a leading `www.` so www.x.com and x.com compare equal. */
function normalizeHost(hostname: string): string {
  const lowered = hostname.toLowerCase();
  return lowered.startsWith("www.") ? lowered.slice(4) : lowered;
}

/** First N urls, sorted for deterministic output. */
function capRelated(urls: string[]): string[] {
  return [...urls].sort().slice(0, RELATED_URLS_CAP);
}

/**
 * Sitemap hygiene checks over the collected sitemap URL set + lastmod map.
 * Emits ROLLUP findings: one per issue kind, never per-URL.
 *
 * Checks:
 *  - Cross-host URLs: per the Sitemaps protocol, URLs in a sitemap must reside
 *    on the same host as the sitemap; non-compliant URLs are dropped from
 *    consideration (https://www.sitemaps.org/protocol.html). Google's exception:
 *    cross-host submission works only for Search-Console-verified sites or via a
 *    robots.txt `Sitemap:` declaration on the target host
 *    (https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps,
 *    https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
 *  - Unparseable URLs: entries `new URL()` rejects.
 *  - Future lastmod: parseable lastmod more than 24h ahead of `now`.
 *  - Unparseable lastmod: not one of the W3C datetime forms the NOTE permits
 *    (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or a complete date plus time;
 *    https://www.w3.org/TR/NOTE-datetime). Coarse forms are valid per that
 *    profile and are NOT reported here.
 *  - Generated/fake lastmod: ≥100 URLs have a lastmod and ≥95% share the exact
 *    same value. Google uses lastmod only when it is "consistently and verifiably
 *    accurate" and ignores it otherwise
 *    (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
 *
 * `now` is injectable so tests can pin the clock.
 */
export function sitemapHygieneRule(
  sitemapUrls: ReadonlySet<string>,
  lastmodByUrl: ReadonlyMap<string, string> | undefined,
  sourceUrl: string,
  now: Date = new Date(),
): RuleResult[] {
  if (sitemapUrls.size === 0) return [];

  const findings: RuleResult[] = [];

  let sourceHost: string | null = null;
  try {
    sourceHost = normalizeHost(new URL(sourceUrl).hostname);
  } catch {
    sourceHost = null;
  }

  const crossHost: string[] = [];
  const unparseable: string[] = [];

  for (const url of sitemapUrls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      unparseable.push(url);
      continue;
    }
    if (sourceHost !== null && normalizeHost(parsed.hostname) !== sourceHost) {
      crossHost.push(url);
    }
  }

  if (crossHost.length > 0) {
    findings.push({
      ruleId: "tech/sitemap-hygiene",
      severity: "error",
      confidence: "high",
      message:
        `${crossHost.length} sitemap URL(s) are on a different host than ${sourceUrl}. ` +
        `Per the Sitemaps protocol, URLs must reside on the same host as the sitemap; non-compliant URLs are dropped from consideration.`,
      relatedUrls: capRelated(crossHost),
      fix:
        `Move these URLs to a sitemap served from their own host. ` +
        `Google's exception: cross-host submission works only when the site is verified in Search Console for both hosts, ` +
        `or when the target host's robots.txt declares this sitemap via a Sitemap: directive.`,
    });
  }

  if (unparseable.length > 0) {
    findings.push({
      ruleId: "tech/sitemap-hygiene",
      severity: "warning",
      confidence: "high",
      message: `${unparseable.length} sitemap entrie(s) are not valid URLs and cannot be parsed.`,
      relatedUrls: capRelated(unparseable),
      fix: "Sitemap <loc> values must be fully-qualified absolute URLs (including the https:// scheme). Fix or remove these entries.",
    });
  }

  if (lastmodByUrl !== undefined && lastmodByUrl.size > 0) {
    const futureUrls: string[] = [];
    const unparseableLastmod: string[] = [];
    const valueCounts = new Map<string, number>();
    let withLastmod = 0;
    const futureCutoff = now.getTime() + FUTURE_TOLERANCE_MS;

    for (const [url, lastmod] of lastmodByUrl) {
      withLastmod += 1;
      valueCounts.set(lastmod, (valueCounts.get(lastmod) ?? 0) + 1);

      const parsedMs = Date.parse(lastmod);
      if (!W3C_DATETIME_RE.test(lastmod) || Number.isNaN(parsedMs)) {
        unparseableLastmod.push(url);
        continue;
      }
      if (parsedMs > futureCutoff) {
        futureUrls.push(url);
      }
    }

    if (futureUrls.length > 0) {
      findings.push({
        ruleId: "tech/sitemap-hygiene",
        severity: "warning",
        confidence: "high",
        message: `${futureUrls.length} sitemap URL(s) have a <lastmod> date more than 24 hours in the future.`,
        relatedUrls: capRelated(futureUrls),
        fix: "Future lastmod dates signal an inaccurate generator; search engines distrust and ignore unreliable lastmod values. Emit the page's real last-modification time.",
      });
    }

    if (unparseableLastmod.length > 0) {
      findings.push({
        ruleId: "tech/sitemap-hygiene",
        severity: "warning",
        confidence: "high",
        message: `${unparseableLastmod.length} sitemap URL(s) have a <lastmod> value that is not a valid W3C datetime (YYYY, YYYY-MM, YYYY-MM-DD, or a full date and time).`,
        relatedUrls: capRelated(unparseableLastmod),
        fix: "Format <lastmod> as W3C datetime (https://www.w3.org/TR/NOTE-datetime), e.g. 2026-01-15 or 2026-01-15T09:30:00Z. A complete date is the most useful form: Google only uses lastmod when it is consistently and verifiably accurate, which a year-only value cannot demonstrate.",
      });
    }

    if (withLastmod >= GENERATED_LASTMOD_MIN_URLS) {
      let topValue = "";
      let topCount = 0;
      for (const [value, count] of valueCounts) {
        if (count > topCount) {
          topValue = value;
          topCount = count;
        }
      }
      if (topCount / withLastmod >= GENERATED_LASTMOD_SHARE) {
        findings.push({
          ruleId: "tech/sitemap-hygiene",
          severity: "warning",
          confidence: "medium",
          message:
            `${topCount} of ${withLastmod} sitemap URLs share the exact same <lastmod> value ("${topValue}"); ` +
            `this looks generated at build time rather than reflecting real modification dates. ` +
            `Google uses lastmod only when it is "consistently and verifiably accurate" and ignores it otherwise.`,
          fix: "Emit each page's actual last-modification time, or omit <lastmod> entirely rather than stamping every URL with the sitemap-generation time.",
        });
      }
    }
  }

  return findings;
}

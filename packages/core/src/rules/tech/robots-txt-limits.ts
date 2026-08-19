import type { RuleResult } from "../../types.js";

/** Google parses at most the first 500 KiB of robots.txt; rules beyond it are ignored. */
const GOOGLE_ROBOTS_SIZE_LIMIT_BYTES = 500 * 1024;

/**
 * Directives that appear in the wild but that Google's robots.txt parser does
 * not support (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt).
 */
const UNSUPPORTED_DIRECTIVES: ReadonlyArray<{ name: string; note: string }> = [
  {
    name: "noindex",
    note: "unsupported by Google since September 2019 — pages are NOT noindexed by this line",
  },
  {
    name: "crawl-delay",
    note: "ignored by Google (Bing honors it)",
  },
  {
    name: "nofollow",
    note: "not a robots.txt directive — Google ignores it",
  },
  {
    name: "host",
    note: "not supported by Google — use canonical URLs / redirects instead",
  },
];

const UNSUPPORTED_DIRECTIVE_RE = /^\s*(noindex|crawl-delay|nofollow|host)\s*:/i;

/**
 * robots.txt practical-limits checks:
 *  - Size — Google enforces a 500 KiB limit and IGNORES rules beyond it
 *    (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt).
 *  - Unsupported directives — one rollup finding listing which of `noindex`,
 *    `crawl-delay`, `nofollow`, `host` appear as line-leading directives. When
 *    `noindex` is present the finding escalates to WARNING because the operator
 *    may falsely believe the listed pages are excluded from the index.
 */
export function robotsTxtLimitsRule(robotsTxtContent: string): RuleResult[] {
  if (!robotsTxtContent) return [];

  const findings: RuleResult[] = [];

  const byteLength = Buffer.byteLength(robotsTxtContent, "utf8");
  if (byteLength > GOOGLE_ROBOTS_SIZE_LIMIT_BYTES) {
    findings.push({
      ruleId: "tech/robots-txt-limits",
      severity: "warning",
      confidence: "high",
      message:
        `robots.txt is ${byteLength} bytes — over Google's 500 KiB limit. ` +
        `Google ignores all rules beyond the first 500 KiB, so directives past the cutoff are silently dropped.`,
      fix: "Shrink robots.txt below 500 KiB: consolidate repetitive Disallow lines with wildcard patterns, and move per-page exclusions to noindex meta tags or X-Robots-Tag headers.",
    });
  }

  const present = new Set<string>();
  for (const rawLine of robotsTxtContent.split(/\r?\n/)) {
    const m = UNSUPPORTED_DIRECTIVE_RE.exec(rawLine);
    if (m) present.add(m[1].toLowerCase());
  }

  if (present.size > 0) {
    const listed = UNSUPPORTED_DIRECTIVES.filter((d) => present.has(d.name));
    const hasNoindex = present.has("noindex");
    const directiveList = listed.map((d) => `${d.name} (${d.note})`).join("; ");

    findings.push({
      ruleId: "tech/robots-txt-limits",
      severity: hasNoindex ? "warning" : "info",
      confidence: "high",
      message:
        `robots.txt contains directive(s) Google does not support: ${directiveList}.` +
        (hasNoindex
          ? " The noindex line has had no effect since September 2019 — you may falsely believe these pages are excluded from Google's index when they are not."
          : ""),
      fix: hasNoindex
        ? "Remove the unsupported lines. To actually exclude pages from the index, use a noindex robots meta tag or an X-Robots-Tag HTTP header on the pages themselves."
        : "Remove the unsupported lines, or keep crawl-delay only if you specifically target Bing — Google ignores it either way.",
    });
  }

  return findings;
}

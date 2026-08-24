import type { RuleResult } from "../../types.js";

/** Google parses at most the first 500 KiB of robots.txt; rules beyond it are ignored. */
const GOOGLE_ROBOTS_SIZE_LIMIT_BYTES = 500 * 1024;

/**
 * Google's robots.txt announcement retiring the undocumented rules, the ONLY
 * source for the September 2019 date and for `noindex` in robots.txt having no
 * effect. The reference doc lists what IS supported and never mentions
 * `noindex`, `nofollow` or `host` at all, so it cannot carry those claims.
 */
const UNSUPPORTED_RULES_ANNOUNCEMENT =
  "https://developers.google.com/search/blog/2019/07/a-note-on-unsupported-rules-in-robotstxt";

/**
 * Directives that appear in the wild but that Google's robots.txt parser does
 * not support. Each note names the source that actually documents it, because
 * they are not all the same source:
 *
 *   - crawl-delay: the reference doc says so verbatim ("Google supports the
 *     following fields (other fields such as `crawl-delay` aren't supported)")
 *     https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 *   - noindex / nofollow / host: NOT in that doc. Google announced it was
 *     retiring the code that handled these undocumented rules effective
 *     1 September 2019, in the post linked above. Citing the reference doc for
 *     the September 2019 claim was citing a page that does not contain it.
 */
const UNSUPPORTED_DIRECTIVES: ReadonlyArray<{ name: string; note: string }> = [
  {
    name: "noindex",
    note: `unsupported by Google since 1 September 2019 (${UNSUPPORTED_RULES_ANNOUNCEMENT}); pages are NOT noindexed by this line`,
  },
  {
    name: "crawl-delay",
    note: "not a supported field per Google's robots.txt reference (Bing honors it)",
  },
  {
    name: "nofollow",
    note: `not a documented robots.txt directive; Google retired its handling on 1 September 2019 (${UNSUPPORTED_RULES_ANNOUNCEMENT})`,
  },
  {
    name: "host",
    note: "not a supported field per Google's robots.txt reference; use canonical URLs / redirects instead",
  },
];

const UNSUPPORTED_DIRECTIVE_RE = /^\s*(noindex|crawl-delay|nofollow|host)\s*:/i;

/**
 * robots.txt practical-limits checks:
 *  - Size: Google enforces a 500 KiB limit and IGNORES rules beyond it
 *    (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt).
 *  - Unsupported directives: one rollup finding listing which of `noindex`,
 *    `crawl-delay`, `nofollow`, `host` appear as line-leading directives, each
 *    carrying the source that documents it (see UNSUPPORTED_DIRECTIVES: the
 *    reference doc covers `crawl-delay` and the size limit, the 2019
 *    announcement covers `noindex`). When `noindex` is present the finding
 *    escalates to WARNING because the operator may falsely believe the listed
 *    pages are excluded from the index.
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
        `robots.txt is ${byteLength} bytes, over Google's 500 KiB limit. ` +
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
          ? ` The noindex line has had no effect since 1 September 2019, when Google retired its handling of undocumented robots.txt rules (${UNSUPPORTED_RULES_ANNOUNCEMENT}), so you may falsely believe these pages are excluded from Google's index when they are not.`
          : ""),
      fix: hasNoindex
        ? "Remove the unsupported lines. To actually exclude pages from the index, use a noindex robots meta tag or an X-Robots-Tag HTTP header on the pages themselves."
        : "Remove the unsupported lines, or keep crawl-delay only if you specifically target Bing; Google ignores it either way.",
    });
  }

  return findings;
}

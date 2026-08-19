import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/html-size — flags HTML documents approaching or exceeding Googlebot's
 * crawl cutoff. Googlebot fetches only the FIRST 2 MB of a file (uncompressed,
 * per resource — the limit was updated from the old 15 MB figure in the
 * Feb 2026 documentation revision;
 * https://developers.google.com/search/docs/crawling-indexing/googlebot).
 * Content, links, and JSON-LD past the cutoff are simply invisible to Google.
 *
 * This is a PER-FILE limit on the HTML document itself, NOT total page weight
 * with images/CSS/JS — each referenced resource is fetched (and truncated)
 * separately.
 *
 *   - error:   >= 2 MB   (content beyond the cutoff is already being dropped)
 *   - warning: >= 1.5 MB (dangerously close to the cutoff)
 */
const ERROR_BYTES = 2 * 1024 * 1024;
const WARNING_BYTES = 1.5 * 1024 * 1024;

export function htmlSizeRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const bytes = Buffer.byteLength(page.html, "utf8");
    if (bytes < WARNING_BYTES) continue;

    const sizeMb = (bytes / (1024 * 1024)).toFixed(1);
    const overLimit = bytes >= ERROR_BYTES;
    findings.push({
      ruleId: "tech/html-size",
      severity: overLimit ? "error" : "warning",
      confidence: "high",
      message: overLimit
        ? `${page.url} is ${sizeMb} MB of HTML — Googlebot only crawls the first 2 MB of a file, so content, links, and JSON-LD past the cutoff are invisible to Google.`
        : `${page.url} is ${sizeMb} MB of HTML — approaching Googlebot's 2 MB per-file crawl cutoff; anything past it will be invisible to Google.`,
      pageUrl: page.url,
      fix: "Shrink the HTML document itself (this limit is per-file, not total page weight with images): move inlined data/scripts/styles to separate files, trim server-rendered payloads, and make sure critical content, links, and JSON-LD appear early in the document.",
    });
  }
  return findings;
}

import type { ParsedPage, RuleResult } from "../../types.js";

// ponytail: thin-body threshold. Nav/chrome inflate raw word counts; 50 is
// already generous — pages that are genuinely soft-404s rarely exceed it.
// Exported for the server-only probe (soft-404-probe.ts); this module stays
// parser-dependency-free so the browser extension can import soft404Rule (§6/§10).
export const THIN_BODY_THRESHOLD = 50;

// ponytail: how many words of contentText to scan for a pattern signal.
// Scanning the full body risks matching editorial mentions of "404" deep in an
// article; the first 120 words (roughly two paragraphs) is enough to catch
// real error templates.
const CONTENT_SCAN_WORDS = 120;

export const SOFT_404_PATTERNS =
  /\b(not\s*found|404|page\s*missing|does\s*not\s*exist|no\s*longer\s*available|page\s*does\s*not\s*exist)\b/i;

/**
 * Confidence model for soft-404 detection:
 *
 *   Signal A — thin body (wordCount < THIN_BODY_THRESHOLD)
 *   Signal B — soft-404 pattern in title, h1, or opening content
 *
 *   A AND B  → warning / high  (strong: both signals agree)
 *   B only   → info / low      (weak: substantive body, pattern might be
 *                                editorial, e.g. "How we handle 404 errors")
 *   A only   → no finding      (stub/coming-soon pages are legit)
 */
export function soft404Rule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.httpMeta) continue;
    if (page.httpMeta.statusCode !== 200) continue;

    const wordCount = page.contentText.split(/\s+/).filter(Boolean).length;
    const signalA = wordCount < THIN_BODY_THRESHOLD;

    // Signal B: check title, first h1, and opening words of contentText
    const h1 = page.headings.h1[0] ?? "";
    const openingText = page.contentText
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, CONTENT_SCAN_WORDS)
      .join(" ");
    const signalB =
      SOFT_404_PATTERNS.test(page.title) ||
      SOFT_404_PATTERNS.test(h1) ||
      SOFT_404_PATTERNS.test(openingText);

    if (signalA && signalB) {
      // Strong signal: thin body AND pattern match → warning/high
      findings.push({
        ruleId: "tech/soft-404",
        severity: "warning",
        confidence: "high",
        message: `${page.url} returns HTTP 200 but appears to be an error page (title: "${page.title}", ${wordCount} words).`,
        pageUrl: page.url,
        fix: "Return a proper HTTP 404 status code for error pages instead of 200."
      });
    } else if (signalB) {
      // Weak signal: pattern match only, substantive body → info/low
      findings.push({
        ruleId: "tech/soft-404",
        severity: "info",
        confidence: "low",
        message: `${page.url} returns HTTP 200 and mentions error-page language in its title or headings (title: "${page.title}", ${wordCount} words). Verify this is intentional content, not a misconfigured soft-404.`,
        pageUrl: page.url,
        fix: "If this is an error page, return HTTP 404. If the content is intentional, consider renaming the page title or heading to avoid soft-404 signals."
      });
    }
    // signalA only (thin body, no pattern) → no finding; stub pages are legit
  }

  return findings;
}

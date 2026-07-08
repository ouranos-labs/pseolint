import { load } from "cheerio";
import type { RuleResult } from "../../types.js";
import { SOFT_404_PATTERNS, THIN_BODY_THRESHOLD } from "./soft-404.js";

// Server-only: this is the ONLY soft-404 path that parses raw HTML (cheerio), so
// it lives apart from soft-404.ts. Keeping it separate is what lets the browser
// extension import `soft404Rule` (pre-parsed, cheerio-free) without dragging the
// whole HTML parser into the service-worker bundle (zero-dep invariant, §6/§10).

/**
 * Evaluate a synthetic-invalid-URL probe response. A correct site returns
 * 404/410 for a URL that cannot exist; a 200 is the soft-404 signal — no body
 * pattern required (unlike soft404Rule). Body pattern/emptiness raises confidence.
 */
export function evaluateProbe(probedUrl: string, status: number, body: string): RuleResult | null {
  if (status !== 200) return null;
  const $ = load(body);
  $("script, style, noscript, template").remove();
  const text = ($("body").text() || "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const strong = SOFT_404_PATTERNS.test(text) || words < THIN_BODY_THRESHOLD;
  return {
    ruleId: "tech/soft-404",
    severity: "warning",
    confidence: strong ? "high" : "medium",
    pageUrl: probedUrl,
    message: `${probedUrl} is a nonexistent URL but returned HTTP 200. Crawlers can index unlimited junk pages.`,
    fix: "Return a real HTTP 404/410 (edge gate or middleware) for unknown slugs.",
  };
}

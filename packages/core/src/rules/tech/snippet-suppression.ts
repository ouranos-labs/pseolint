import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";
import { gatherRobotsDeclarations } from "./meta-robots-conflict.js";

/**
 * tech/snippet-suppression flags pages that suppress their own SERP snippet
 * via `nosnippet` or `max-snippet:0` in any robots source (`<meta name="robots">`,
 * `<meta name="googlebot">`, or the `X-Robots-Tag` header).
 *
 * Suppressing the snippet doesn't just blank the SERP description; it also
 * makes the page ineligible for AI Overviews and answer-engine citation
 * (https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
 * which defeats the whole point of optimizing for citability (see the aeo/*
 * rule category). Flagged loudly for that reason.
 *
 *   - warning: nosnippet or max-snippet:0 in any robots source.
 *   - info:    data-nosnippet attributes in the body, i.e. PARTIAL suppression,
 *              which may well be intentional (e.g. hiding boilerplate), so it
 *              is only surfaced, not judged.
 *
 * `max-snippet:-1` (unlimited) and positive limits are fine and not flagged.
 *
 * Both halves read the parsed DOM, never the raw HTML. Robots declarations come
 * from tech/meta-robots-conflict's shared gatherer, which skips comment nodes
 * and understands the documented user-agent-prefixed header form
 * (`X-Robots-Tag: googlebot: nosnippet`). The `data-nosnippet` count is an
 * attribute-selector match, so the string "data-nosnippet" inside a <script>
 * body or an HTML comment is not miscounted as a live attribute.
 */

/** True when the directive token kills the snippet: `nosnippet` or `max-snippet:0` (space tolerated). */
function isSnippetKiller(directive: string): boolean {
  return directive === "nosnippet" || /^max-snippet\s*:\s*0$/.test(directive);
}

export function snippetSuppressionRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const suppressingSources = new Set<string>();
    for (const decl of gatherRobotsDeclarations(page)) {
      if (decl.directives.some(isSnippetKiller)) {
        suppressingSources.add(decl.source);
      }
    }

    if (suppressingSources.size > 0) {
      findings.push({
        ruleId: "tech/snippet-suppression",
        severity: "warning",
        confidence: "high",
        message: `${page.url} suppresses its SERP snippet (nosnippet / max-snippet:0 via ${[...suppressingSources].join(", ")}); this also makes the page ineligible for AI Overviews and answer-engine citation.`,
        pageUrl: page.url,
        fix: "Remove nosnippet / max-snippet:0 (or set a positive max-snippet limit, or max-snippet:-1 for unlimited) unless you deliberately want no snippet AND no AI-answer citations for this page.",
      });
    }

    const dataNosnippetCount = page.html ? load(page.html)("[data-nosnippet]").length : 0;
    if (dataNosnippetCount > 0) {
      findings.push({
        ruleId: "tech/snippet-suppression",
        severity: "info",
        confidence: "high",
        message: `${page.url} contains ${dataNosnippetCount} data-nosnippet attribute${dataNosnippetCount === 1 ? "" : "s"}; those sections are excluded from snippets and AI answers. Partial suppression may be intentional (e.g. hiding boilerplate); verify nothing citable is hidden.`,
        pageUrl: page.url,
        fix: "Review each data-nosnippet section: keep it on boilerplate/legal text, remove it from content you want quoted in snippets or AI answers.",
      });
    }
  }

  return findings;
}

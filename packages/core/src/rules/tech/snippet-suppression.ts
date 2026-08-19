import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/snippet-suppression — flags pages that suppress their own SERP snippet
 * via `nosnippet` or `max-snippet:0` in any robots source (`<meta name="robots">`,
 * `<meta name="googlebot">`, or the `X-Robots-Tag` header).
 *
 * Suppressing the snippet doesn't just blank the SERP description — it also
 * makes the page ineligible for AI Overviews and answer-engine citation
 * (https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
 * which defeats the whole point of optimizing for citability (see the aeo/*
 * rule category). Flagged loudly for that reason.
 *
 *   - warning: nosnippet or max-snippet:0 in any robots source.
 *   - info:    data-nosnippet attributes in the body — PARTIAL suppression,
 *              which may well be intentional (e.g. hiding boilerplate), so it
 *              is only surfaced, not judged.
 *
 * `max-snippet:-1` (unlimited) and positive limits are fine and not flagged.
 */

interface RobotsDeclaration {
  /** Human-readable source label, e.g. `meta robots` or `X-Robots-Tag header`. */
  source: string;
  /** Raw content string as declared. */
  content: string;
}

/** Extract every robots/googlebot meta declaration plus the X-Robots-Tag header. */
function gatherRobotsDeclarations(page: ParsedPage): RobotsDeclaration[] {
  const declarations: RobotsDeclaration[] = [];

  const metaTagRe = /<meta\b[^>]*>/gi;
  for (const [tag] of page.html.matchAll(metaTagRe)) {
    const nameMatch = /\bname\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const name = (nameMatch?.[2] ?? nameMatch?.[3] ?? nameMatch?.[4] ?? "").trim().toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    const contentMatch = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const content = contentMatch?.[2] ?? contentMatch?.[3] ?? contentMatch?.[4] ?? "";
    declarations.push({ source: `meta ${name}`, content });
  }

  const xRobots = page.httpMeta?.xRobotsTag ?? "";
  if (xRobots.trim()) {
    declarations.push({ source: "X-Robots-Tag header", content: xRobots });
  }

  return declarations;
}

/** True when the directive token kills the snippet: `nosnippet` or `max-snippet:0` (space tolerated). */
function isSnippetKiller(directive: string): boolean {
  return directive === "nosnippet" || /^max-snippet\s*:\s*0$/.test(directive);
}

export function snippetSuppressionRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const suppressingSources = new Set<string>();
    for (const decl of gatherRobotsDeclarations(page)) {
      const directives = decl.content
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0);
      if (directives.some(isSnippetKiller)) {
        suppressingSources.add(decl.source);
      }
    }

    if (suppressingSources.size > 0) {
      findings.push({
        ruleId: "tech/snippet-suppression",
        severity: "warning",
        confidence: "high",
        message: `${page.url} suppresses its SERP snippet (nosnippet / max-snippet:0 via ${[...suppressingSources].join(", ")}) — this also makes the page ineligible for AI Overviews and answer-engine citation.`,
        pageUrl: page.url,
        fix: "Remove nosnippet / max-snippet:0 (or set a positive max-snippet limit, or max-snippet:-1 for unlimited) unless you deliberately want no snippet AND no AI-answer citations for this page.",
      });
    }

    const dataNosnippetCount = (page.html.match(/\bdata-nosnippet\b/gi) ?? []).length;
    if (dataNosnippetCount > 0) {
      findings.push({
        ruleId: "tech/snippet-suppression",
        severity: "info",
        confidence: "high",
        message: `${page.url} contains ${dataNosnippetCount} data-nosnippet attribute${dataNosnippetCount === 1 ? "" : "s"} — those sections are excluded from snippets and AI answers. Partial suppression may be intentional (e.g. hiding boilerplate); verify nothing citable is hidden.`,
        pageUrl: page.url,
        fix: "Review each data-nosnippet section: keep it on boilerplate/legal text, remove it from content you want quoted in snippets or AI answers.",
      });
    }
  }

  return findings;
}

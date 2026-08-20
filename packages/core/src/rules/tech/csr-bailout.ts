import { load } from "cheerio";
import type { ParsedPage, RuleResult, Confidence } from "../../types.js";
import { countInteractive, detectClientFrameworkFromHtml } from "../../framework-detect.js";

// ponytail: render-diff thresholds, tuned to the paperforge case (0 raw / 44
// rendered interactive). Surface via rules options only if real audits need it.
const MIN_INTERACTIVE = 3;
const RATIO_FLOOR = 0.1;
const MIN_WORD_DELTA = 250;
const CONTENT_RATIO_FLOOR = 0.5;

function visibleWordCount(html: string): number {
  const $ = load(html);
  $("script, style, noscript, template").remove();
  return ($("body").text() || "").split(/\s+/).filter(Boolean).length;
}

/**
 * Flags pages whose interactive value (or substantive content) exists in the
 * rendered DOM but not the raw server HTML: invisible to crawlers that don't
 * run JS. Requires --render (no-op when page.renderedHtml is absent).
 */
export function csrBailoutRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    if (!page.renderedHtml) continue;

    const rawI = countInteractive(page.html);
    const rendI = countInteractive(page.renderedHtml);
    const rawW = visibleWordCount(page.html);
    const rendW = visibleWordCount(page.renderedHtml);

    const interactiveBail =
      rendI >= MIN_INTERACTIVE && (rawI === 0 || rawI / rendI <= RATIO_FLOOR);
    const contentBail =
      rendW - rawW >= MIN_WORD_DELTA && rawW / Math.max(rendW, 1) <= CONTENT_RATIO_FLOOR;
    if (!interactiveBail && !contentBail) continue;

    const confidence: Confidence = interactiveBail ? "high" : "medium";
    const nextHint =
      detectClientFrameworkFromHtml(page.html) === "nextjs"
        ? " Next.js: keep useSearchParams()/dynamic hooks inside a <Suspense> boundary, and move new Date()/Math.random() out of client render paths under cacheComponents (into useEffect). Verify with `next build && next start`, not `next dev`."
        : "";

    findings.push({
      ruleId: "tech/csr-bailout",
      severity: "warning",
      confidence,
      pageUrl: page.url,
      message:
        `${page.url} exposes ${rendI} interactive elements after hydration but ${rawI} in the server HTML ` +
        `(${rawW}→${rendW} words). Crawlers and Google's first pass see an incomplete shell, making the page look thin or duplicate.${nextHint}`,
      fix: "Server-render or prerender the interactive content so it is present in the raw HTML.",
    });
  }
  return findings;
}

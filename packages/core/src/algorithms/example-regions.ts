import { load } from "cheerio";
import type { ParsedPage } from "../types.js";

/**
 * Selector for "quoted example / code / sample" regions: markup that documents
 * a pattern rather than expressing the page's own editorial voice.
 *
 * Content-quality heuristics that judge the page's OWN prose (cliché density,
 * regurgitated-content signals) exclude these regions so a docs / explainer
 * page that *quotes* a bad pattern to teach it isn't penalised for describing
 * it. A real spam page puts clichés in flowing prose, not inside `<code>` or a
 * `<blockquote>` example box: so the exclusion narrows false positives without
 * opening a meaningful evasion path for a low-confidence proxy.
 */
export const EXAMPLE_REGION_SELECTOR =
  "pre, code, blockquote, figure, samp, kbd, [data-example]";

const CHROME_SELECTOR = "header, footer, nav, script, style, noscript";

/**
 * Page body text with site chrome AND quoted-example regions removed.
 *
 * Falls back to the pre-parsed `contentText` when no html is available (e.g.
 * synthetic unit-test pages). The fallback keeps example text in place: it's a
 * best-effort path; the html path is what production audits exercise.
 */
export function proseTextExcludingExamples(page: ParsedPage): string {
  if (page.html && page.html.trim()) {
    const $ = load(page.html);
    $(`${CHROME_SELECTOR}, ${EXAMPLE_REGION_SELECTOR}`).remove();
    const body = $("body");
    const text = body.length ? body.text() : $.root().text();
    return text.replace(/\s+/g, " ").trim();
  }
  return page.contentText ?? "";
}

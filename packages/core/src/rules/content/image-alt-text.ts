import type { ParsedPage, RuleResult } from "../../types.js";

const IMG_RE = /<img\b[^>]*>/gi;
const ALT_RE = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i;
const ROLE_RE = /\brole\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i;
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i;
const ARIA_HIDDEN_RE = /\baria-hidden\s*=\s*(?:"true"|'true'|true)/i;

interface ImgAttrs {
  hasAltAttr: boolean;
  altText: string;
  role: string;
  src: string;
  ariaHidden: boolean;
}

function parseImg(tag: string): ImgAttrs {
  const altMatch = tag.match(ALT_RE);
  const roleMatch = tag.match(ROLE_RE);
  const srcMatch = tag.match(SRC_RE);
  const altText = altMatch ? (altMatch[1] ?? altMatch[2] ?? altMatch[3] ?? "") : "";
  return {
    hasAltAttr: altMatch !== null,
    altText: altText.trim(),
    role: roleMatch ? ((roleMatch[1] ?? roleMatch[2] ?? roleMatch[3] ?? "")).toLowerCase() : "",
    src: srcMatch ? (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "") : "",
    ariaHidden: ARIA_HIDDEN_RE.test(tag),
  };
}

/**
 * content/image-alt-text — checks every <img> tag in the parsed HTML for
 * alt-text presence. Decorative images (`role="presentation"`,
 * `aria-hidden="true"`, or empty `alt=""` explicitly) are skipped — the
 * rule fires only on content-bearing images that lack ANY alt attribute.
 *
 * Reports per-page count (one finding per page summarising N missing).
 * The templated-image case (every catalog page has the same 200
 * placeholder thumbnails) doesn't need 200 line-items in the report;
 * one summary line per page is enough — sample sources truncated to 3.
 *
 * The 2026-05-03 blind-spot audit named this as a tier-1 gap that hits
 * every templated pSEO site (template iterates over a data source, the
 * image-alt slot is left at the literal default).
 */
export function imageAltTextRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const html = page.html ?? "";
    if (!html) continue;
    const tags = html.match(IMG_RE) ?? [];
    if (tags.length === 0) continue;

    let missing = 0;
    let total = 0;
    const samples: string[] = [];
    for (const tag of tags) {
      const a = parseImg(tag);
      // Skip decorative images that are explicitly marked as such.
      if (a.role === "presentation" || a.role === "none") continue;
      if (a.ariaHidden) continue;
      // Empty `alt=""` is a deliberate signal that the image is decorative —
      // we accept it. The rule fires only when the alt attribute is MISSING.
      total += 1;
      if (!a.hasAltAttr) {
        missing += 1;
        if (samples.length < 3 && a.src) samples.push(a.src);
      }
    }

    if (missing === 0) continue;
    const ratio = missing / Math.max(1, total);
    const severity = ratio >= 0.5 ? "warning" : "info";
    const sampleSuffix = samples.length > 0 ? ` (e.g. ${samples.join(", ")})` : "";
    findings.push({
      ruleId: "content/image-alt-text",
      severity,
      message: `${page.url}: ${missing} of ${total} content-bearing <img> tags have no alt attribute${sampleSuffix}.`,
      pageUrl: page.url,
      fix: "Add an `alt` attribute to every content-bearing <img>. For purely-decorative images, use `alt=\"\"` explicitly (or set `aria-hidden=\"true\"`) so the rule recognises them as intentional. Templated catalog images should pull alt text from the same data source as the rest of the page (the integration name, the city, the currency pair) — never leave the alt slot at a static default.",
    });
  }
  return findings;
}

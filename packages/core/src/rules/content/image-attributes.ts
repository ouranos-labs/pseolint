import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * content/image-attributes: parse-time checks on <img> markup that
 * content/image-alt-text does not cover. No network access: everything here
 * is readable from the HTML the crawler already has.
 *
 * Two independent signals:
 *
 * 1. MISSING DIMENSIONS (warning/info). An <img> with no width/height gives
 *    the browser no aspect ratio to reserve space with, so surrounding
 *    content jumps when the image arrives. Modern browsers derive
 *    `aspect-ratio` from the width and height attributes specifically to
 *    avoid that shift (https://web.dev/articles/optimize-cls). CLS is a
 *    Core Web Vitals metric, so this is a page-experience input rather than
 *    a crawl or indexing one.
 *
 * 2. NO RESPONSIVE CANDIDATES (info). A page serving several images where
 *    not one uses `srcset` or `<picture>` ships desktop-sized bytes to
 *    phones. Google's image guidance recommends responsive images
 *    (https://developers.google.com/search/docs/appearance/google-images#responsive-images).
 *    RECOMMENDED, not required, which is why this never rises above info.
 *    There is no documented image-count, byte or dimension limit, and this
 *    rule must never grow one (see docs/folklore.md).
 *
 * Deliberately NOT checked: `loading="lazy"`. Lazy-loading the LCP image
 * actively harms it, so a correct verdict needs to know which image is above
 * the fold, which static HTML cannot tell us. Guessing would produce advice
 * that is wrong exactly when it matters.
 *
 * Sizing counted as present when EITHER the width/height attributes are set,
 * OR inline styles supply width/height/aspect-ratio, so a CSS-sized layout is
 * not reported as broken.
 */

const IMG_RE = /<img\b[^>]*>/gi;
const PICTURE_RE = /<picture\b/i;
const ATTR = (name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]*))`, "i");
const WIDTH_RE = ATTR("width");
const HEIGHT_RE = ATTR("height");
const SRC_RE = ATTR("src");
const STYLE_RE = ATTR("style");
const SRCSET_RE = /\bsrcset\s*=/i;
const ARIA_HIDDEN_RE = /\baria-hidden\s*=\s*(?:"true"|'true'|true)/i;
/** Inline sizing that makes the attribute pair unnecessary for layout stability. */
const STYLE_SIZED_RE = /(^|;)\s*(aspect-ratio|width|height)\s*:/i;

/** At least this many images before the responsive-candidates check applies. */
const MIN_IMAGES_FOR_RESPONSIVE = 3;
/** Fire the dimensions finding at warning once at least half are unsized. */
const UNSIZED_WARNING_RATIO = 0.5;

function attr(tag: string, re: RegExp): string {
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
}

export function imageAttributesRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const html = page.html ?? "";
    if (!html) continue;
    const tags = html.match(IMG_RE) ?? [];
    if (tags.length === 0) continue;

    let considered = 0;
    let unsized = 0;
    let responsive = 0;
    const samples: string[] = [];

    for (const tag of tags) {
      // A decorative image still shifts layout, so role="presentation" is NOT
      // skipped for the dimensions check; only aria-hidden images (removed
      // from the a11y tree, typically zero-size spacers) are.
      if (ARIA_HIDDEN_RE.test(tag)) continue;
      considered += 1;

      if (SRCSET_RE.test(tag)) responsive += 1;

      const hasAttrs = attr(tag, WIDTH_RE) !== "" && attr(tag, HEIGHT_RE) !== "";
      const styleSized = STYLE_SIZED_RE.test(attr(tag, STYLE_RE));
      if (!hasAttrs && !styleSized) {
        unsized += 1;
        const src = attr(tag, SRC_RE);
        // data: URIs are usually inline spacers and add nothing to a report.
        if (samples.length < 3 && src && !src.startsWith("data:")) samples.push(src);
      }
    }

    if (considered === 0) continue;

    if (unsized > 0) {
      const ratio = unsized / considered;
      const sampleSuffix = samples.length > 0 ? ` (e.g. ${samples.join(", ")})` : "";
      findings.push({
        ruleId: "content/image-attributes",
        severity: ratio >= UNSIZED_WARNING_RATIO ? "warning" : "info",
        confidence: "medium",
        message: `${page.url}: ${unsized} of ${considered} <img> tags declare neither width/height attributes nor inline sizing${sampleSuffix}. Without an aspect ratio the browser cannot reserve space, so content shifts as each image loads, which is what Cumulative Layout Shift measures.`,
        pageUrl: page.url,
        fix: `Set the intrinsic width and height attributes on each <img> and let CSS scale it (width: 100%; height: auto). The browser derives aspect-ratio from the attribute pair and reserves the box before the bytes arrive. In a template, bind both from the same data source as the src.`,
      });
    }

    if (considered >= MIN_IMAGES_FOR_RESPONSIVE && responsive === 0 && !PICTURE_RE.test(html)) {
      findings.push({
        ruleId: "content/image-attributes",
        severity: "info",
        confidence: "medium",
        message: `${page.url} serves ${considered} images and not one uses srcset or <picture>, so phones download the desktop-sized file. Google recommends responsive images; this is guidance rather than a requirement, and no image dimension or byte limit is documented.`,
        pageUrl: page.url,
        fix: `Emit a srcset with a handful of widths plus a sizes attribute, or wrap the img in <picture> to offer a modern format with a fallback. Most image CDNs and framework Image components generate both from one source URL.`,
      });
    }
  }

  return findings;
}

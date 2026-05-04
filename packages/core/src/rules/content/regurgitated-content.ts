import type { ParsedPage, RuleResult } from "../../types.js";

const RULE_ID = "content/regurgitated-content";

/**
 * Detects the Google Places API regurgitation pattern: sites that lift
 * names, reviews, addresses, and photos from the Places API and present
 * them as a "directory" without any curation or value-add.
 *
 * v1: heuristic-only. Fires when >=2 distinct signals are present per page.
 * External corpus checks (Wikipedia / Tripadvisor n-gram overlap) deferred to v0.6.
 */

const GOOGLE_ATTRIBUTION_RE = /powered by google/i;
const GOOGLE_MAPS_NOOPENER_RE = /<a\b[^>]*href\s*=\s*["'][^"']*google\.com\/maps[^"']*["'][^>]*>/i;

const GOOGLE_IMG_HOSTS = [
  "googleusercontent.com",
  "lh3.googleusercontent.com",
  "maps.googleapis.com/maps/api/place/photo",
  "streetviewpixels-pa.googleapis.com",
];

const STATIC_MAP_SRC_RE = /maps\.googleapis\.com\/maps\/api\/staticmap/i;
const MAPS_EMBED_SRC_RE = /(?:maps\.google\.com|google\.com\/maps)\/embed/i;

const PLACES_API_JS_RE =
  /google\.maps\.places\.(?:Service|PlacesService|AutocompleteService)|places\.PlacesService\b/;

const IMG_SRC_RE = /<img\b[^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi;
const IFRAME_SRC_RE = /<iframe\b[^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi;
// Star-rating patterns: Unicode stars (U+2605, U+2606, U+2729), HTML entities,
// fraction-of-five numerics (4.5/5), or the literal word "stars".
const REVIEW_BLOCK_RE = /<(?:div|li|article|section)\b[^>]*>(?:(?!<\/(?:div|li|article|section)>).)*?(?:&#9733;|&#9734;|★|☆|✩|\d+(?:\.\d+)?\/5|\d+\s*stars?)(?:(?!<\/(?:div|li|article|section)>).)*?<\/(?:div|li|article|section)>/gi;
const STAR_RATING_RE = /&#9733;|&#9734;|★|☆|✩|\d+(?:\.\d+)?\/5|\d+\s*stars?/i;

const MIN_IMAGES_FOR_RATIO_CHECK = 3;
const GOOGLE_IMG_RATIO_THRESHOLD = 0.6;
const MIN_REVIEW_BLOCKS = 5;

interface SignalResult {
  fired: boolean;
  label: string;
}

function checkGoogleAttribution(html: string): SignalResult {
  const label = "Google Places attribution";
  if (GOOGLE_ATTRIBUTION_RE.test(html)) return { fired: true, label };
  const m = html.match(GOOGLE_MAPS_NOOPENER_RE);
  if (m && /rel\s*=\s*["'][^"']*noopener[^"']*["']/i.test(m[0])) {
    return { fired: true, label };
  }
  return { fired: false, label };
}

function extractImgSrcs(html: string): string[] {
  const srcs: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMG_SRC_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    if (m[1]) srcs.push(m[1]);
  }
  return srcs;
}

function isGoogleImgHost(src: string): boolean {
  return GOOGLE_IMG_HOSTS.some((host) => src.includes(host));
}

function checkGoogleImagesDominate(html: string): SignalResult {
  const label = "Google-hosted images dominate (>=60%)";
  const srcs = extractImgSrcs(html);
  if (srcs.length < MIN_IMAGES_FOR_RATIO_CHECK) return { fired: false, label };
  const googleCount = srcs.filter(isGoogleImgHost).length;
  return { fired: googleCount / srcs.length >= GOOGLE_IMG_RATIO_THRESHOLD, label };
}

function checkStaticMapsEmbed(html: string): SignalResult {
  const label = "Google Static Maps or Maps embed";
  if (STATIC_MAP_SRC_RE.test(html)) return { fired: true, label };
  let m: RegExpExecArray | null;
  const re = new RegExp(IFRAME_SRC_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    if (m[1] && MAPS_EMBED_SRC_RE.test(m[1])) return { fired: true, label };
  }
  return { fired: false, label };
}

function checkPlacesApiJs(html: string): SignalResult {
  return { fired: PLACES_API_JS_RE.test(html), label: "Places API JS markers" };
}

function eeatSignalCount(page: ParsedPage): number {
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  let n = 0;
  if (metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink) n += 1;
  if (page.publishedDate) n += 1;
  if (page.resolvedHrefs.some((h) => /\/about\b/i.test(h))) n += 1;
  return n;
}

function checkAggregatorFootprint(html: string, eeat: number): SignalResult {
  const label = "Aggregator footprint (5+ review blocks, no author signal)";
  if (eeat >= 2) return { fired: false, label };
  let count = 0;
  const re = new RegExp(REVIEW_BLOCK_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (STAR_RATING_RE.test(m[0])) {
      count += 1;
      if (count >= MIN_REVIEW_BLOCKS) return { fired: true, label };
    }
  }
  return { fired: false, label };
}

export function regurgitatedContentRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const html = page.html ?? "";
    if (!html) continue;

    const eeat = eeatSignalCount(page);
    const signals: SignalResult[] = [
      checkGoogleAttribution(html),
      checkGoogleImagesDominate(html),
      checkStaticMapsEmbed(html),
      checkPlacesApiJs(html),
      checkAggregatorFootprint(html, eeat),
    ];

    const fired = signals.filter((s) => s.fired);
    if (fired.length < 2) continue;

    const signalList = fired.map((s) => s.label).join("; ");
    findings.push({
      ruleId: RULE_ID,
      severity: "warning",
      message: `${page.url}: ${fired.length} Google Places regurgitation signals -- ${signalList}.`,
      pageUrl: page.url,
      fix: "Replace API-lifted data (photos, reviews, ratings) with original curated content. Add editorial selection rationale, local expertise, or unique commentary not available via the raw Places API. The presence of Powered by Google attribution or >60% googleusercontent images indicates content scraped without value-add.",
      confidence: "speculative",
    });
  }
  return findings;
}
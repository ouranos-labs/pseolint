import type { ParsedPage, RuleResult, FieldVitals } from "../../types.js";

// Google's "poor" thresholds: the tier that actively hurts rankings.
// https://web.dev/articles/vitals, good ≤ first / poor > second.
const LCP_POOR_MS = 4000; // good ≤ 2500
const CLS_POOR = 0.25; // good ≤ 0.1
const INP_POOR_MS = 500; // good ≤ 200

type Src = "field-url" | "field-origin" | "lab";

interface Metric {
  key: "LCP" | "CLS" | "INP";
  value: number;
  src: Src;
  text: string;
}

const SRC_LABEL: Record<Src, string> = {
  "field-url": "real-user p75",
  "field-origin": "origin p75",
  lab: "lab",
};

const FIX: Record<Metric["key"], string> = {
  LCP: "cut LCP: compress/preload the hero image or web font, remove render-blocking CSS/JS, serve the largest element in the initial HTML",
  CLS: "eliminate layout shift: set explicit width/height (or aspect-ratio) on images/embeds and reserve space for late-loading banners/ads",
  INP: "cut INP: break up long tasks, defer non-critical JS, and avoid heavy synchronous work on click/tap/keypress handlers",
};

function fieldSrc(field: FieldVitals): Src {
  return field.source === "url" ? "field-url" : "field-origin";
}

/** Prefer field (real-user) for a metric; fall back to the lab reading for LCP/CLS. */
function select(fieldVal: number | null | undefined, fSrc: Src | null, labVal: number | null | undefined): { value: number; src: Src } | null {
  if (fieldVal !== null && fieldVal !== undefined && fSrc) return { value: fieldVal, src: fSrc };
  if (labVal !== null && labVal !== undefined) return { value: labVal, src: "lab" };
  return null;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Flags pages whose Core Web Vitals land in Google's "poor" tier.
 *
 * Metric selection is per-metric: CrUX field data (page.fieldVitals) wins when
 * present: it's the real-user p75 Google ranks on, and the only source of INP:
 * but LCP/CLS fall back to the lab render (page.webVitals) when field data lacks
 * that specific metric. INP is field-only. No-op when neither source is present.
 *
 * Findings driven purely by ORIGIN-level field data (the site-wide fallback for
 * low-traffic URLs) collapse into a single per-origin finding, since repeating
 * the identical site-level number on every page would be noise (and would apply
 * the same penalty N times in scoring). Per-URL and lab findings stay per-page.
 */
export function coreWebVitalsRule(pages: ParsedPage[]): RuleResult[] {
  const perPage: RuleResult[] = [];
  const originBuckets = new Map<string, { metrics: Metric[]; pages: number }>();

  for (const page of pages) {
    const field = page.fieldVitals;
    const lab = page.webVitals;
    if (!field && !lab) continue;
    const fSrc = field ? fieldSrc(field) : null;

    const lcp = select(field?.lcp, fSrc, lab?.lcp);
    const cls = select(field?.cls, fSrc, lab?.cls);
    const inp = field && field.inp !== null && fSrc ? { value: field.inp, src: fSrc } : null;

    const failing: Metric[] = [];
    if (lcp && lcp.value > LCP_POOR_MS)
      failing.push({ key: "LCP", value: lcp.value, src: lcp.src, text: `LCP ${Math.round(lcp.value)}ms (poor > ${LCP_POOR_MS}ms, ${SRC_LABEL[lcp.src]})` });
    if (cls && cls.value > CLS_POOR)
      failing.push({ key: "CLS", value: cls.value, src: cls.src, text: `CLS ${cls.value.toFixed(3)} (poor > ${CLS_POOR}, ${SRC_LABEL[cls.src]})` });
    if (inp && inp.value > INP_POOR_MS)
      failing.push({ key: "INP", value: inp.value, src: inp.src, text: `INP ${Math.round(inp.value)}ms (poor > ${INP_POOR_MS}ms, ${SRC_LABEL[inp.src]})` });
    if (failing.length === 0) continue;

    // Collapse when EVERY failing metric came from origin-level field data.
    if (failing.every((f) => f.src === "field-origin")) {
      const origin = originOf(page.url);
      const bucket = originBuckets.get(origin);
      if (bucket) bucket.pages += 1;
      else originBuckets.set(origin, { metrics: failing, pages: 1 });
      continue;
    }

    perPage.push(buildFinding(page.url, failing, /* origin */ false, 1));
  }

  const originFindings = [...originBuckets.entries()].map(([origin, b]) =>
    buildFinding(origin, b.metrics, /* origin */ true, b.pages),
  );

  return [...perPage, ...originFindings];
}

function buildFinding(subject: string, failing: Metric[], origin: boolean, pageCount: number): RuleResult {
  const fixes = [...new Set(failing.map((f) => FIX[f.key]))].join("; ");
  // High confidence only when a page-specific reading (per-URL field) drove it;
  // origin-level (site aggregate applied to a page) and lab both sit at medium.
  const confidence = failing.some((f) => f.src === "field-url") ? "high" : "medium";
  const message = origin
    ? `${subject}, site-level Core Web Vitals in the "poor" tier (CrUX origin p75): ${failing.map((f) => f.text).join(", ")}. ` +
      `Affects the whole origin; measured on ${pageCount} audited page${pageCount === 1 ? "" : "s"} that had no per-URL field data.`
    : `${subject} fails Core Web Vitals: ${failing.map((f) => f.text).join(", ")}.`;
  return {
    ruleId: "tech/core-web-vitals",
    severity: "warning",
    confidence,
    pageUrl: subject,
    message,
    fix: `${fixes}.`,
  };
}

// pseolint extension — SERP layout detection (architecture §3, Path A).
//
// Recognise the ranked organic results and pull their target URLs. The DOM glue
// is deliberately thin; the URL-cleaning + selection logic is pure and tested.

// Google's own surfaces (and its /url redirector host) are never "results".
const SKIP_HOST = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|youtube\.com)$/i;

// A real SERP page shows ~10 organic results. Far more than this means our
// selector matched something that isn't the results list — bail (§9).
const MAX_RESULTS = 30;

// A raw result href → a clean external http(s) URL, or null to drop it.
// Handles both the modern direct href and the older /url?q=<real> wrapper.
export function cleanResultUrl(href) {
  if (!href) return null;
  let u;
  try {
    u = new URL(href, "https://www.google.com");
  } catch {
    return null;
  }
  if (u.pathname === "/url") {
    const real = u.searchParams.get("q") || u.searchParams.get("url");
    if (!real) return null;
    try {
      u = new URL(real);
    } catch {
      return null;
    }
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (SKIP_HOST.test(u.hostname)) return null;
  return u.href;
}

// candidate anchors → [{ url, anchor }], dedup (highest rank wins), fail closed.
// Pure: takes anything with an `.href`, so it's testable without a DOM.
export function selectResults(anchors) {
  const byUrl = new Map();
  for (const a of anchors) {
    const url = cleanResultUrl(a.href);
    if (url && !byUrl.has(url)) byUrl.set(url, a);
  }
  // Empty OR implausibly large = the layout isn't what we think. Fail closed
  // (§9) rather than badge a misparsed page — a missing overlay is fine.
  if (byUrl.size === 0 || byUrl.size > MAX_RESULTS) return [];
  return Array.from(byUrl, ([url, anchor]) => ({ url, anchor }));
}

// Collect result anchors two ways and union them, so one selector drifting
// doesn't blank the overlay. ponytail: both are the durable "a link wrapping an
//   <h3>" relation (Google's class names churn; this structure is the stable
//   part). When BOTH stop matching, re-tune HERE against a live SERP.
function candidateAnchors(doc) {
  const set = new Set(doc.querySelectorAll("a:has(h3)"));
  for (const h of doc.querySelectorAll("h3")) {
    const a = h.closest("a");
    if (a) set.add(a);
  }
  return set;
}

// Live SERP → [{ url, anchor }], highest-ranked first, or [] when unrecognised.
export function detectResults(doc = document) {
  return selectResults([...candidateAnchors(doc)]);
}

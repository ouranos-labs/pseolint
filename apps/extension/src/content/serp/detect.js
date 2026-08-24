// pseolint extension: SERP layout detection (architecture §3, Path A).
//
// Recognise the ranked organic results and pull their target URLs. The DOM glue
// is deliberately thin; the URL-cleaning + selection logic is pure and tested.

// Google's own surfaces (and its /url redirector host) are never "results".
const SKIP_HOST = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|youtube\.com)$/i;

// A real SERP page shows ~10 organic results. Far more than this means our
// selector matched something that isn't the results list: bail (§9).
const MAX_RESULTS = 30;

// Which /search page are we on? The overlay is WEB-results only: a badge on an
// Images strip or a Shopping grid is a wrong verdict, and a wrong verdict is
// credibility death (§6). So this is an ALLOWLIST, not a blocklist: the "All" page
// carries no vertical selector: no `tbm` (classic UI) and either no `udm` or
// `udm=14` ("Web", new UI). ANY other value is a vertical → dormant. A new vertical
// Google invents is therefore excluded by default (dormant = safe; a missed badge
// beats a wrong one), and pagination (&start=) / query params don't matter.
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/i;

// Any Google results page, including verticals (used to show a "switch to All" hint).
export function isGoogleSearch(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return GOOGLE_HOST.test(u.hostname) && u.pathname === "/search";
}

// The scannable Web ("All") results page only: false on Images/News/Video/Shopping/…
export function isWebSerp(url) {
  if (!isGoogleSearch(url)) return false;
  const u = new URL(url);
  if (u.searchParams.get("tbm")) return false; // any tbm = a vertical (All has none)
  const udm = u.searchParams.get("udm");
  if (udm && udm !== "14") return false; // only udm=14 (Web) is a text-results view
  return true;
}

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
    if (!url || byUrl.has(url)) continue;

    const h3 = typeof a.querySelector === "function" ? a.querySelector("h3") : null;
    const serpTitle = h3 ? h3.textContent.trim() : "";

    // Find snippet text (Google uses .VwiC3b, or search in siblings of the container)
    const gContainer = typeof a.closest === "function" ? a.closest(".g, .tF23ub") : null;
    const snippetEl = gContainer ? gContainer.querySelector(".VwiC3b, .yXK7c, .MUbCcc") : null;
    let serpSnippet = snippetEl ? snippetEl.textContent.trim() : "";

    // Extract date from snippet if present (e.g., "Oct 12, 2025 — ...")
    let serpDate = "";
    const dateMatch = serpSnippet.match(/^([^—–]+)\s*[—–]\s*/);
    if (dateMatch) {
      const dateText = dateMatch[1].trim();
      if (/\b(\d+|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(dateText)) {
        serpDate = dateText;
        serpSnippet = serpSnippet.replace(/^[^—–]+[—–]\s*/, "");
      }
    }

    byUrl.set(url, {
      url,
      anchor: a,
      serpTitle,
      serpSnippet,
      serpDate
    });
  }
  // Empty OR implausibly large = the layout isn't what we think. Fail closed
  if (byUrl.size === 0 || byUrl.size > MAX_RESULTS) return [];
  return Array.from(byUrl.values());
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

// Scrape citations in Google's AI Overview (SGE) container.
export function scrapeAio(doc = document) {
  const citations = [];
  const container = doc.querySelector("div.Kevs9, #Odp5De");
  if (container) {
    // lib.dom only infers element types from bare tag selectors, so an
    // attribute selector comes back as Element and `.href` is unknown.
    const links = /** @type {NodeListOf<HTMLAnchorElement>} */ (container.querySelectorAll("a[href]"));
    for (const a of links) {
      const url = cleanResultUrl(a.href);
      if (url) citations.push(url);
    }
  }
  // Also scan inline badges like a.PMDqCb
  for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (doc.querySelectorAll("a.PMDqCb"))) {
    const url = cleanResultUrl(a.href);
    if (url) citations.push(url);
  }
  return Array.from(new Set(citations));
}


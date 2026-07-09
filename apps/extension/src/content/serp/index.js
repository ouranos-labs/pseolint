// SERP content script. Tier 1 runs automatically on load (zero permission):
// detect ranked results, mark templated clusters, show the landscape chip. Tier 2
// (deep scan) is triggered by the side panel and reuses the service-worker fetch.
import { detectResults, isWebSerp, scrapeAio } from "./detect.js";
import { analyzeLandscape, landscapeChip } from "./landscape.js";
import { mountBadge } from "./overlay.js";
import { mountChip } from "./reach.js";

const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const auditHref = (url) => AUDIT_PREFILL + encodeURIComponent(url);

let results = []; // [{ url, anchor }]
let summary = null;
let lastHref = location.href; // SPA-nav sentinel: query/vertical/page changes move it

// Wipe every mark we've drawn back to a clean page — badges in the titles and the
// fixed landscape chip — and drop cached state. Called on SPA navigation (new
// query, vertical switch, pagination) and when we land on a non-web vertical.
function clearOverlay() {
  for (const el of document.querySelectorAll('[data-pseolint="badge"],[data-pseolint="chip"]')) el.remove();
  results = [];
  summary = null;
}

// Tell the side panel the landscape moved. `reset` (a real navigation) makes the
// panel drop its now-stale deep-scan scorecard; a plain update just re-renders.
function pushLandscape(reset) {
  chrome.runtime.sendMessage({ type: "pseolint:landscape-updated", summary: serializeSummary(summary), reset: !!reset }).catch(() => {});
}

// Tier 1 — auto, zero permission.
function runLandscape() {
  results = detectResults(document);
  summary = analyzeLandscape(results);
  summary.aioCitations = scrapeAio(document);
  for (const { url, anchor } of results) {
    if (!summary.templatedUrls.has(url)) continue;
    // Insert INSIDE the title <h3> (untransformed, away from the result action-row
    // / kebab menu), not as a sibling of the result link where the badge collided
    // with the ⋮ and inherited that row's flipped transform.
    const title = anchor.querySelector("h3") || anchor;
    if (title.querySelector('[data-pseolint="badge"]')) continue;
    const badge = mountBadge({ level: "templated", label: "templated" }, document, auditHref(url));
    if (badge) title.append(badge);
  }
  mountChip(landscapeChip(summary));
}

// Tier 2 — opt-in deep scan (side panel asked). Fetch+judge via the SW, paint
// risk badges, and return per-result {verdict, ok} so the panel can show coverage.
async function deepScan() {
  if (results.length === 0) {
    results = detectResults(document);
    summary = analyzeLandscape(results);
  }
  const rankByUrl = new Map(results.map((r, i) => [r.url, i + 1]));
  const anchorByUrl = new Map(results.map((r) => [r.url, r.anchor]));
  const reply = await chrome.runtime.sendMessage({
    type: "pseolint:scan",
    urls: results.map((r) => r.url),
  });
  const out = [];
  for (const s of reply?.results ?? []) {
    const anchor = anchorByUrl.get(s.url);
    const rCtx = results.find((r) => r.url === s.url);

    const extraFlags = [];
    if (s.ok) {
      if (s.liveTitle && rCtx?.serpTitle) {
        const cleanLive = s.liveTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanSerp = rCtx.serpTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanLive && cleanSerp && !cleanLive.includes(cleanSerp) && !cleanSerp.includes(cleanLive)) {
          extraFlags.push("title rewritten");
        }
      }
      if (!s.liveDescription) {
        extraFlags.push("no meta desc");
      } else if (rCtx?.serpSnippet) {
        const cleanLive = s.liveDescription.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanSerp = rCtx.serpSnippet.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanLive && cleanSerp && !cleanLive.includes(cleanSerp) && !cleanSerp.includes(cleanLive)) {
          extraFlags.push("meta desc ignored");
        }
      }
      if (!s.hasSchema) {
        extraFlags.push("no schema");
      }
    }

    s.flags = [...(s.flags ?? []), ...extraFlags];

    if (anchor && s.verdict) {
      const title = anchor.querySelector("h3") || anchor;
      const existing = title.querySelector('[data-pseolint="badge"]');
      if (existing) existing.remove(); // replace the Tier-1 templated badge with the risk verdict
      const badge = mountBadge(s.verdict, document, auditHref(s.url));
      if (badge) title.append(badge);
    }
    // Enrich the SW signal set with SERP context the panel needs.
    out.push({ ...s, rank: rankByUrl.get(s.url), templated: summary.templatedUrls.has(s.url) });
  }
  return { results: out };
}

// Sets aren't JSON-serializable; flatten the summary for the message channel.
function serializeSummary(s) {
  if (!s) return null;
  return {
    total: s.total,
    templated: s.templatedUrls.size,
    hostCount: s.hostCount,
    clusters: s.clusters.map((c) => ({ host: c.host, pattern: c.pattern, count: c.count })),
    aioCitations: s.aioCitations ?? [],
    results: (results || []).map((r, i) => ({
      rank: i + 1,
      url: r.url,
      title: r.serpTitle,
      snippet: r.serpSnippet,
      date: r.serpDate,
      templated: s.templatedUrls.has(r.url)
    }))
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pseolint:landscape") {
    sendResponse({ summary: serializeSummary(summary) });
    return undefined; // sync reply
  }
  if (msg?.type === "pseolint:deep-scan") {
    deepScan().then(sendResponse);
    return true; // async reply
  }
  return undefined;
});

let observer = null;
function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    // SPA navigation: a new query, a vertical switch (All→Images) and pagination
    // all change the URL without a reload. Reset to a clean page, then re-detect
    // only if we're back on web results. This one check subsumes stale badges,
    // a stale chip, and the old query's scorecard in the panel.
    if (location.href !== lastHref) {
      lastHref = location.href;
      clearOverlay();
      if (isWebSerp(location.href)) runLandscape();
      pushLandscape(true); // reset=true → panel drops the old scorecard
      return;
    }
    // Same page: results streamed in after document_idle, or their count changed.
    if (!isWebSerp(location.href)) return;
    const n = detectResults(document).length;
    if (n > 0 && n !== results.length) {
      runLandscape();
      pushLandscape(false);
    }
  });
  // Observe body (never replaced) so a full #search container swap on SPA nav is
  // still seen; the callback is a cheap URL compare until something actually moves.
  observer.observe(document.body, { childList: true, subtree: true });
}

if (isWebSerp(location.href)) runLandscape();
startObserver();

// Keep background service worker alive/reconnected to the bridge by pinging it.
// Content scripts run in the page and do not suspend.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "pseolint:ping" }).catch(() => {});
}, 5000);

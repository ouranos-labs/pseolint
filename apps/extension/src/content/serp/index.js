// SERP content script. Tier 1 runs automatically on load (zero permission):
// detect ranked results, mark templated clusters, show the landscape chip. Tier 2
// (deep scan) is triggered by the side panel and reuses the service-worker fetch.
import { detectResults, scrapeAio } from "./detect.js";
import { analyzeLandscape, landscapeChip } from "./landscape.js";
import { mountBadge } from "./overlay.js";
import { mountChip } from "./reach.js";

const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const auditHref = (url) => AUDIT_PREFILL + encodeURIComponent(url);

let results = []; // [{ url, anchor }]
let summary = null;

// Tier 1 — auto, zero permission.
function runLandscape() {
  results = detectResults(document);
  summary = analyzeLandscape(results);
  summary.aioCitations = scrapeAio(document);
  for (const { url, anchor } of results) {
    if (!summary.templatedUrls.has(url)) continue;
    if (anchor.nextElementSibling?.getAttribute?.("data-pseolint") === "badge") continue;
    const badge = mountBadge({ level: "templated", label: "templated" }, document, auditHref(url));
    if (badge) anchor.insertAdjacentElement("afterend", badge);
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
      if (anchor.nextElementSibling?.getAttribute?.("data-pseolint") === "badge") {
        anchor.nextElementSibling.remove();
      }
      const badge = mountBadge(s.verdict, document, auditHref(s.url));
      if (badge) anchor.insertAdjacentElement("afterend", badge);
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
    const newResults = detectResults(document);
    if (newResults.length > 0 && newResults.length !== results.length) {
      runLandscape();
      chrome.runtime.sendMessage({
        type: "pseolint:landscape-updated",
        summary: serializeSummary(summary)
      }).catch(() => {});
    }
  });

  const target = document.getElementById("search") || document.body;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
}

runLandscape();
startObserver();

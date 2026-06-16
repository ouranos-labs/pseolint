// pseolint extension — SERP overlay orchestration (architecture §5 Path A).
//
// Runs on the Google results page. Does NOT act on its own: it waits for the
// popup's "pseolint:run" message (the popup owns the user gesture + host-access
// grant — see src/ui/popup.js for why the gesture can't live in a content
// script). On that signal it detects the ranked results, asks the service worker
// (the sole network egress, §3) to fetch + judge them, and paints a badge on the
// flagged ones. Verdicts are computed from page signals the SW never returns raw.
import { detectResults } from "./detect.js";
import { mountBadge } from "./overlay.js";

// Path B (§5): a flagged badge links to the hosted full audit. The SaaS landing
// form already prefills + arms from `?prefill=` (apps/web landing-form), so the
// handoff is a deep link — no signal egress, no new endpoint. One origin, by design.
const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";

async function run() {
  const results = detectResults(document);
  if (results.length === 0) return { flagged: 0 };

  const anchorByUrl = new Map(results.map((r) => [r.url, r.anchor]));
  const reply = await chrome.runtime.sendMessage({
    type: "pseolint:scan",
    urls: results.map((r) => r.url),
  });

  let flagged = 0;
  for (const { url, verdict } of reply?.results ?? []) {
    const anchor = anchorByUrl.get(url);
    if (!anchor) continue;
    const badge = mountBadge(verdict, document, AUDIT_PREFILL + encodeURIComponent(url));
    if (badge) {
      // Sibling AFTER the result link, never inside it — so clicking the badge
      // opens our audit, not the search result.
      anchor.insertAdjacentElement("afterend", badge);
      flagged++;
    }
  }
  return { flagged };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "pseolint:run") return undefined;
  run().then(sendResponse);
  return true; // keep the channel open for the async reply
});

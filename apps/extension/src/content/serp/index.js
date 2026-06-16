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
    const badge = anchor && mountBadge(verdict); // null verdict → null badge, skipped
    if (badge) {
      anchor.append(badge);
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

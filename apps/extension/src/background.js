// pseolint extension — background service worker (architecture §3).
//
// The ONLY component permitted to touch the network (single, auditable egress).
// For the SERP overlay it fetches each ranked result, runs the Tier-1 client
// rules locally, and returns ONLY a verdict per URL — the raw page HTML is
// parsed and discarded inside this worker, it never crosses back to a content
// script. Path B (sending a SignalSet to the hosted API) is a separate egress
// added in build-seq step 5; this step makes no outbound call to pseolint.
import { scanPage } from "./shared/rules-client.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 6_000_000; // skip absurdly large bodies (content-length guard)
const MAX_URLS = 20; // cap per scan — don't hammer 100 origins off one SERP

// We can soundly judge HTML only. Accept html / xhtml; an ABSENT content-type is
// also allowed (common on real pages) and falls through to the shell/word-count
// gates. A declared non-HTML type (image, pdf, json) is dropped.
const HTML_TYPE = /(text\/html|application\/xhtml)/i;

chrome.runtime.onInstalled.addListener(() => {
  console.log("pseolint extension installed");
});

// Toolbar icon opens the side panel directly (no popup). Optional chaining so a
// browser without the API doesn't throw on worker startup.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

// Fetch one result and judge it. Fails CLOSED to no-badge on any error,
// timeout, non-HTML response, or fetch the host permission didn't cover.
async function analyze(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // Default "unreached" signal set — every field the scorecard reads is present.
  const miss = { url, ok: false, status: 0, words: 0, ogComplete: false, isLikelyShell: false, flags: [], verdict: null, aeoReady: false };
  try {
    const res = await fetch(url, {
      credentials: "omit", // never attach the user's cookies/session (§8)
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    // Reached but not analysable HTML → ok, no signals.
    if (contentType && !HTML_TYPE.test(contentType)) return { ...miss, ok: true, status: res.status };
    // Size guard via content-length (best-effort; chunked bodies lack it — the 8s
    // timeout is the backstop). We do NOT slice the body: a mid-<head> cut could
    // sever an og/title tag → a FALSE "no OG" signal.
    if (Number(res.headers.get("content-length")) > MAX_BYTES) return { ...miss, ok: true, status: res.status };
    const html = await res.text();
    return { url, ok: true, status: res.status, ...scanPage(html, res.url || url, res.status) };
  } catch {
    return miss; // not reached → counts as unscanned
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "pseolint:scan" || !Array.isArray(msg.urls)) return undefined;
  Promise.all(msg.urls.slice(0, MAX_URLS).map(analyze)).then((results) =>
    sendResponse({ results }),
  );
  return true; // keep the message channel open for the async response
});

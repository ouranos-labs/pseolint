// Runnable check for SERP result-URL cleaning + selection. `node tests/detect.test.js`.
// The DOM walk (detectResults) needs Chrome; the URL + selection logic is pure.
import assert from "node:assert";
import { cleanResultUrl, selectResults } from "../src/content/serp/detect.js";

// --- cleanResultUrl ---
assert.strictEqual(cleanResultUrl("https://example.com/p/1"), "https://example.com/p/1");
// Legacy /url?q= wrapper is unwrapped to the real target.
assert.strictEqual(
  cleanResultUrl("https://www.google.com/url?q=https://example.com/x&sa=U"),
  "https://example.com/x",
);
// Google's own surfaces, non-http schemes, and junk are dropped.
assert.strictEqual(cleanResultUrl("https://www.google.com/search?q=foo"), null, "google host");
assert.strictEqual(cleanResultUrl("https://maps.google.de/place"), null, "google ccTLD subdomain");
assert.strictEqual(cleanResultUrl("https://www.youtube.com/watch?v=1"), null, "youtube");
assert.strictEqual(cleanResultUrl("javascript:void(0)"), null, "non-http scheme");
assert.strictEqual(cleanResultUrl(""), null, "empty");
assert.strictEqual(cleanResultUrl(null), null, "null");
// A real result host that merely contains "google" in the path is kept.
assert.strictEqual(cleanResultUrl("https://notgoogle.com/google-tips"), "https://notgoogle.com/google-tips");

// --- selectResults: dedup, rank order, junk filter, fail-closed bounds ---
const a = (href) => ({ href }); // minimal anchor stand-in
assert.deepStrictEqual(
  selectResults([
    a("https://a.com/1"),
    a("https://www.google.com/search?q=x"), // dropped
    a("https://b.com/2"),
    a("https://a.com/1"), // dup of #1 → first (top rank) kept
    a("javascript:0"), // dropped
  ]).map((r) => r.url),
  ["https://a.com/1", "https://b.com/2"],
);
// Carries the anchor through alongside the cleaned url.
const picked = selectResults([a("https://a.com/1")]);
assert.strictEqual(picked[0].anchor.href, "https://a.com/1", "anchor preserved");
// Nothing recognised → [] (fail closed).
assert.deepStrictEqual(selectResults([a("javascript:0"), a("")]), [], "no valid results → []");
// Implausibly many matches → [] (selector grabbed junk, don't badge a misparse).
const flood = Array.from({ length: 31 }, (_, i) => a(`https://x.com/${i}`));
assert.deepStrictEqual(selectResults(flood), [], "over MAX_RESULTS → fail closed");

console.log("detect: all url + selection checks passed");

// Runnable check for SERP result-URL cleaning + selection. `node tests/detect.test.js`.
// The DOM walk (detectResults) needs Chrome; the URL + selection logic is pure.
import assert from "node:assert";
import { cleanResultUrl, isGoogleSearch, isWebSerp, selectResults } from "../src/content/serp/detect.js";

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

// --- isGoogleSearch / isWebSerp: only the Web ("All") vertical is scannable ---
assert.ok(isWebSerp("https://www.google.com/search?q=best+crm"), "plain web SERP");
assert.ok(isWebSerp("https://www.google.com/search?q=x&start=10"), "paginated web SERP");
assert.ok(isWebSerp("https://www.google.com/search?q=x&udm=14"), "udm=14 is Web");
assert.ok(isWebSerp("https://www.google.co.uk/search?q=x"), "ccTLD web SERP");
// Verticals (classic tbm and new-UI udm) are NOT scannable. Allowlist: any tbm,
// or any udm other than 14, is dormant: incl. verticals we never enumerated.
assert.ok(!isWebSerp("https://www.google.com/search?q=x&tbm=isch"), "images (tbm)");
assert.ok(!isWebSerp("https://www.google.com/search?q=x&tbm=nws"), "news (tbm)");
assert.ok(!isWebSerp("https://www.google.com/search?q=x&udm=2"), "images (udm)");
assert.ok(!isWebSerp("https://www.google.com/search?q=x&udm=7"), "video (udm)");
assert.ok(!isWebSerp("https://www.google.com/search?q=x&udm=28"), "shopping (udm), unenumerated, dormant by default");
// Not a results page at all.
assert.ok(!isWebSerp("https://www.google.com/maps"), "maps path");
assert.ok(!isWebSerp("https://example.com/search?q=x"), "non-google host");
assert.ok(!isWebSerp("garbage"), "unparseable");
// isGoogleSearch is true on verticals too (used to show the "switch to All" hint).
assert.ok(isGoogleSearch("https://www.google.com/search?q=x&tbm=isch"), "vertical is still a google search");
assert.ok(!isGoogleSearch("https://www.google.com/maps"), "maps is not /search");

console.log("detect: all url + selection checks passed");

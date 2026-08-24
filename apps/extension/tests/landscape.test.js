// `node tests/landscape.test.js`: pure, no DOM.
import assert from "node:assert";
import { analyzeLandscape, landscapeChip } from "../src/content/serp/landscape.js";

const r = (url) => ({ url, anchor: { href: url } });

// 3 results share host+pattern → one cluster of 3; a lone /about is not templated.
const results = [
  r("https://acme.com/city/new-york"),
  r("https://acme.com/city/boston"),
  r("https://acme.com/city/miami"),
  r("https://acme.com/about"),
  r("https://other.com/jobs/dev"),
  r("https://other.com/jobs/qa"),
];
const s = analyzeLandscape(results);
assert.strictEqual(s.total, 6, "counts all results");
assert.strictEqual(s.templatedUrls.size, 5, "5 urls in clusters (3 city + 2 jobs)");
assert.ok(!s.templatedUrls.has("https://acme.com/about"), "lone static page not templated");
assert.strictEqual(s.hostCount, 2, "two clustered hosts");
assert.strictEqual(s.clusters[0].count, 3, "biggest cluster first");
assert.strictEqual(s.clusters[0].pattern, "/city/:slug");

// chip text + empty case
assert.strictEqual(landscapeChip(s), "5/6 results templated · 2 hosts");
assert.strictEqual(landscapeChip(analyzeLandscape([r("https://x.com/about")])), null, "nothing templated → no chip");

console.log("landscape: all checks passed");

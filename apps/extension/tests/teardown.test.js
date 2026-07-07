// `node tests/teardown.test.js`
import assert from "node:assert";
import { contentBar, rowTags, saturation, teardown, takeaway, userHost, buildWin } from "../src/shared/teardown.js";

// userHost: normalize user-typed domains for the "your site" match.
assert.strictEqual(userHost("https://www.Example.com/path?q=1"), "example.com");
assert.strictEqual(userHost("example.com"), "example.com");
assert.strictEqual(userHost("  WWW.Foo.IO  "), "foo.io");
assert.strictEqual(userHost(""), "");

const R = [
  { url: "https://a.com/1", rank: 1, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [] },
  { url: "https://a.com/2", rank: 2, ok: true, isLikelyShell: false, words: 1800, ogComplete: true, templated: false, flags: [] },
  { url: "https://dir.com/city/x", rank: 3, ok: true, isLikelyShell: false, words: 240, ogComplete: false, templated: true, flags: ["thin", "no OG tags"] },
  { url: "https://dir.com/city/y", rank: 4, ok: true, isLikelyShell: false, words: 300, ogComplete: true, templated: true, flags: [] },
  { url: "https://b.com/x", rank: 5, ok: false, isLikelyShell: false, words: 0, ogComplete: false, templated: false, flags: [] }, // failed
];

// content bar = median over fetched, non-shell results (excludes the failed one)
assert.strictEqual(contentBar(R), 1050, "median of [240,300,1800,2000] = 1050");

// row tags = non-exclusive facts; strong = none fired
assert.deepStrictEqual(rowTags(R[0]).sort(), [], "deep clean page → no tags");
assert.deepStrictEqual(rowTags(R[2]).sort(), ["no OG tags", "templated", "thin"], "facts stacked");
assert.deepStrictEqual(rowTags(R[3]).sort(), ["templated"], "templated only");

// saturation
const sat = saturation(R);
assert.strictEqual(sat.templated, 2);
assert.strictEqual(sat.total, 5);
assert.strictEqual(sat.topHost, "dir.com");

// teardown() bundles it + picks the opening (lowest-words ranked result below the bar)
const t = teardown(R);
assert.strictEqual(t.bar, 1050);
assert.strictEqual(t.scanned, 4);
assert.strictEqual(t.failed, 1);
assert.strictEqual(t.opening.url, "https://dir.com/city/x", "weakest below-bar ranked result");
assert.strictEqual(t.rows[0].rank, 1, "rows keep SERP rank order");

// AEO: positive tag + count
assert.deepStrictEqual(rowTags({ flags: [], aeoReady: true }), ["AEO"], "aeoReady → AEO tag");
assert.strictEqual(
  teardown([
    { url: "https://a.com/1", rank: 1, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [], aeoReady: true },
    { url: "https://a.com/2", rank: 2, ok: true, isLikelyShell: false, words: 1800, ogComplete: true, templated: false, flags: [], aeoReady: false },
  ]).aeoReady,
  1,
  "counts aeoReady rows",
);

// takeaway: synthesized strategic verdict
assert.match(takeaway(teardown(R)), /Beatable/, "thin leaders + saturation → beatable");
const fortress = teardown([
  { url: "https://a.com/1", rank: 1, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [], aeoReady: true },
  { url: "https://a.com/2", rank: 2, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [], aeoReady: true },
]);
assert.match(takeaway(fortress), /Fortress/, "deep, clean, AEO-ready → fortress");

// buildWin: the win-bridge deep-link, adapted to the user's SERP position.
// t.opening = dir.com #3 (thin/templated); R has a.com at #1-2, 2/5 templated.
assert.strictEqual(buildWin(t, "", "x").mode, "set-domain", "no host → prompt mode");
assert.ok(!buildWin(t, "", "x").href, "set-domain carries no deep-link");
const climb = buildWin(t, "a.com", "best plumbers");
assert.match(climb.primary, /climb past #3/, "ranking host → climb copy");
assert.match(climb.href, /prefill=https%3A%2F%2Fa\.com%2F1&from=serp&against=dir\.com&q=best\+plumbers/, "climb: ranking-page URL + context, encoded");
const insert = buildWin(t, "mysite.com", "");
assert.match(insert.primary, /insert/, "absent host → insert copy");
assert.match(insert.href, /prefill=https%3A%2F%2Fmysite\.com%2F&from=serp&against=dir\.com$/, "insert: site root, q omitted when query empty");
assert.match(climb.sub, /near-identical pages already rank/, "templated SERP → qualify sub-copy");
assert.strictEqual(
  buildWin(teardown([{ url: "https://a.com/1", rank: 1, ok: true, isLikelyShell: false, words: 2000, ogComplete: true, templated: false, flags: [] }]), "a.com", ""),
  null,
  "no opening → null (generic CTA fallback)",
);

console.log("teardown: all checks passed");

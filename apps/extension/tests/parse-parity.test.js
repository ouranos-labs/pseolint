// Parity check: our DOM-less regex parser vs core's real cheerio parser (§6).
// Runs the SAME html through both and asserts the badge-relevant fields agree —
// so a SERP badge can never silently disagree with the hosted audit. If either
// parser drifts, this fails. `node tests/parse-parity.test.js` (needs core built).
import assert from "node:assert";
import { parseHtmlPage } from "@pseolint/core/parser";
import { parseSignals } from "../src/shared/parse.js";

const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

// Fixtures deliberately exercise the divergence-prone cases: comments, entities,
// adjacent block tags (no separator in cheerio), and boilerplate removal.
const fixtures = [
  // Entities in title/og + an HTML comment that must not be counted.
  `<html><head><title>Tom &amp; Jerry&#39;s</title>
    <meta property="og:title" content="A &amp; B">
    <meta property="og:description" content="x">
    <meta property="og:image" content="https://x.com/i.png">
   </head><body><!-- <p>commented out paragraph here</p> -->
    <main>Real copy with a non&#8211;breaking idea and an &amp; ampersand inside.</main>
   </body></html>`,
  // Adjacent block tags (cheerio concatenates with NO separator) + nav/footer
  // boilerplate that both parsers must drop.
  `<html><head><title>List</title></head><body>
    <nav>home about contact pricing login</nav>
    <h1>Best Tools &amp; Tips</h1>
    <ul><li>alpha</li><li>beta</li><li>gamma</li></ul>
    <p>one two three four five six seven eight nine ten eleven twelve thirteen.</p>
    <footer>terms privacy</footer>
   </body></html>`,
  // &nbsp; whitespace entity must count as a separator, like cheerio.
  `<html><head><title>NBSP</title></head><body><div>one&nbsp;two&nbsp;three four five six seven</div></body></html>`,
];

for (const html of fixtures) {
  const core = parseHtmlPage(html, "https://x.com/p");
  const ours = parseSignals(html, "https://x.com/p", 200);

  // Simple selectors must match EXACTLY (after entity decode).
  assert.strictEqual(ours.title, core.title, `title parity\n  core: ${core.title}\n  ours: ${ours.title}`);
  assert.strictEqual(ours.og.title, core.og.title, "og:title parity");
  assert.strictEqual(ours.og.description, core.og.description, "og:description parity");
  assert.strictEqual(ours.og.image, core.og.image, "og:image parity");
  // headings.h1 feeds soft-404 — must match core (incl. entity decode).
  assert.deepStrictEqual(
    ours.headings.h1, core.headings.h1,
    `h1 parity\n  core: ${JSON.stringify(core.headings.h1)}\n  ours: ${JSON.stringify(ours.headings.h1)}`,
  );

  // Word count drives soft-404 / thin-content. Must track core within a hair —
  // exact is the goal; allow ±1 for an isolated entity/edge token.
  const c = words(core.contentText);
  const o = words(ours.contentText);
  assert.ok(
    Math.abs(c - o) <= 1,
    `word-count parity off by ${Math.abs(c - o)} (core=${c} ours=${o})\n  core: "${core.contentText}"\n  ours: "${ours.contentText}"`,
  );
}

console.log("parse-parity: client parser agrees with core's cheerio parser");

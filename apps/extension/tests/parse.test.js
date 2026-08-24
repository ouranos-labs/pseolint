// Runnable check for fetched-page signal extraction. `node tests/parse.test.js`.
// Pure string parsing: no DOM, so it runs anywhere (the point of the regex parse).
import assert from "node:assert";
import { parseSignals } from "../src/shared/parse.js";

const page = `<!doctype html><html><head>
  <title>  Best Widgets  in   Ohio </title>
  <meta property="og:title" content="Widgets OH">
  <meta content="A directory of widgets" name="og:description">
  <meta property = 'og:image' content='https://x.com/a.png'>
</head><body>
  <nav>home about contact pricing login signup blog careers press legal</nav>
  <script>var spam = "one two three four five six seven eight"</script>
  <main>Genuine substantive copy about widgets in Ohio. This page actually explains what the product does and why it matters to buyers.</main>
  <footer>copyright terms privacy sitemap cookies</footer>
</body></html>`;

const p = parseSignals(page, "https://x.com/oh", 200);
assert.strictEqual(p.title, "Best Widgets in Ohio", "title scoped + whitespace-collapsed");
assert.strictEqual(p.og.title, "Widgets OH", "og:title (property before content)");
assert.strictEqual(p.og.description, "A directory of widgets", "og:description (content before name)");
assert.strictEqual(p.og.image, "https://x.com/a.png", "og:image (spaces around =, single quotes)");
assert.strictEqual(p.httpMeta.statusCode, 200, "status passthrough");
// nav/script/footer stripped → only the <main> words counted.
const words = p.contentText.split(/\s+/).filter(Boolean).length;
assert.strictEqual(words, 21, `body text excludes nav/script/footer (got ${words}: "${p.contentText}")`);
assert.strictEqual(p.isLikelyShell, false, "real content is not a shell");

// Missing og tags → empty strings (so og-completeness can fire), not crashes.
const bare = parseSignals("<html><head><title>x</title></head><body>hello world</body></html>", "https://x.com", 200);
assert.deepStrictEqual(bare.og, { title: "", description: "", image: "" }, "absent og → empty strings");

// Un-hydrated SPA shell: near-empty body + scripts → flagged shell (fail closed).
const shell = parseSignals('<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>', "https://x.com", 200);
assert.strictEqual(shell.isLikelyShell, true, "SPA shell detected");

// Headings: soft-404 reads page.headings.h1; arrays mirror cheerio's per-tag text.
const hp = parseSignals("<body><h1> Top  Widgets </h1><h2>Specs</h2><h2>Pricing</h2></body>", "https://x.com", 200);
assert.deepStrictEqual(hp.headings.h1, ["Top Widgets"], "h1 text extracted + collapsed");
assert.deepStrictEqual(hp.headings.h2, ["Specs", "Pricing"], "all h2s extracted");
assert.deepStrictEqual(p.headings.h1, [], "no h1 in the main fixture → empty array, not undefined");

// hasSchema: JSON-LD presence (AEO signal).
assert.strictEqual(p.hasSchema, false, "no json-ld in the main fixture");
assert.strictEqual(
  parseSignals('<html><head><script type="application/ld+json">{}</script></head><body>plenty of real words here to clear the shell threshold for the schema check to run</body></html>', "https://x.com", 200).hasSchema,
  true,
  "json-ld detected",
);

console.log("parse: all extraction checks passed");

// pseolint extension — fetched-page signal extraction (architecture §8/§9).
//
// ponytail: regex <head>/meta + tag-strip, NOT a DOM parse. Two reasons, both
//   load-bearing: (1) this runs in the MV3 service worker, which has no
//   DOMParser; (2) cheerio (what core/src/parser.ts uses) is a node dependency
//   we refuse to ship into users' authenticated browsers (§10). It is held to
//   core's output by tests/parse-parity.test.js, which runs the SAME fixtures
//   through core's real cheerio parser and asserts the word counts + og/title
//   agree — so a SERP badge can't silently disagree with the hosted audit (§6).
//
// Fetched third-party HTML is hostile input: we extract from it, never execute
// it (§8). String ops in a DOM-less worker have no execution surface at all.

// Minimal HTML entity decode — enough to match cheerio for word counts and for
// exact og/title parity. Unknown named entities are left as-is (rare, and they
// don't shift a word count). Numeric refs are range-checked so a malicious
// &#999999999; can't throw out of fromCodePoint (§8 hostile input).
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, ent) => {
    if (ent[0] === "#") {
      const hex = ent[1] === "x" || ent[1] === "X";
      const n = parseInt(ent.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    const k = ent.toLowerCase();
    return k in NAMED ? NAMED[k] : m;
  });
}

// HTML text → decoded, whitespace-collapsed (mirrors cheerio's normalizedText).
function clean(text) {
  return decode(text).replace(/\s+/g, " ").trim();
}

// content of the first <meta property|name="<key>"> tag, either attribute order.
// ponytail: hardcoded scan, not a dynamic RegExp(key) — `key` is always one of a
//   fixed literal set, and a built-from-input regex is a ReDoS smell (and flimsier).
function metaContent(html, key) {
  const k = key.toLowerCase();
  const ids = [`property="${k}"`, `property='${k}'`, `name="${k}"`, `name='${k}'`];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const flat = tag.toLowerCase().replace(/\s*=\s*/g, "=");
    if (!ids.some((id) => flat.includes(id))) continue;
    const m = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (m) return clean(m[1]);
  }
  return "";
}

function titleText(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1]) : "";
}

// Mirror core's `$("body").text()` after removing boilerplate: scope to <body>
// (so the <head> title/meta never leak into the count), drop
// script/style/noscript and header/footer/nav, then strip remaining tags.
// ponytail: tags are replaced with "" (NOT a space) on purpose — cheerio's
//   .text() concatenates text nodes with no separator, so "<li>a</li><li>b</li>"
//   is "ab", not "a b". Matching that keeps our word count equal to core's (the
//   thresholds were tuned against it). The block regexes handle non-nested tags
//   only (nav-in-nav is rare); the high-confidence gate absorbs the slack.
function bodyText(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const scoped = body ? body[1] : html.replace(/<head\b[\s\S]*?<\/head>/i, "");
  const stripped = scoped
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "");
  return clean(stripped);
}

// Text of each matched heading, mirroring cheerio's `$("h1").map(text)`:
// inner tags stripped, decoded, collapsed, empties dropped.
// ponytail: `re` is a hardcoded literal (h1/h2), never built from input — no
//   dynamic RegExp, no ReDoS surface.
function tagTexts(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) {
    const t = clean(m[1].replace(/<[^>]+>/g, ""));
    if (t) out.push(t);
  }
  return out;
}

// → a ParsedPage SUBSET: exactly the fields the imported Tier-1 rules read
// (og.*, httpMeta.statusCode, title, contentText, headings.h1, url). The rules
// are pure JS after the type-only build, so a subset object is all they touch.
// ponytail: this subset must grow whenever an imported rule starts reading a new
//   ParsedPage field — rules-client.test.js fails loudly when it doesn't (e.g.
//   v0.7.1 soft-404 began reading headings.h1). That test IS the coupling guard.
export function parseSignals(html, url, status) {
  // Drop comments up front — cheerio ignores them, so they must not count (a
  // commented-out <nav> or paragraph would otherwise inflate the body text).
  const doc = html.replace(/<!--[\s\S]*?-->/g, "");
  const contentText = bodyText(doc);
  return {
    url,
    title: titleText(doc),
    contentText,
    og: {
      title: metaContent(doc, "og:title"),
      description: metaContent(doc, "og:description"),
      image: metaContent(doc, "og:image"),
    },
    headings: {
      h1: tagTexts(doc, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi),
      h2: tagTexts(doc, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi),
    },
    httpMeta: { statusCode: status },
    // AEO signal: JSON-LD structured data present (citation-friendly). Browser-safe
    // proxy — core's full aeo/* rules use cheerio, so they stay in the SaaS audit.
    hasSchema: /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(doc),
    // Un-hydrated SPA shell: a raw fetch sees the empty pre-JS HTML, not the
    // rendered DOM Google indexes (§2). Mirror core's skipEmptyBody proxy —
    // body text under ~100 chars with scripts present — and fail closed (§9):
    // better to miss a genuinely tiny page than to badge a shell wrongly.
    // (A word threshold would mis-fire here: almost every real page has a
    // <script>, so "few words + a script" would suppress the very doorways we
    // want to flag. Char length separates "empty mount point" from "thin copy".)
    isLikelyShell: contentText.length < 100 && /<script/i.test(doc),
  };
}

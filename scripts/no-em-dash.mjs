#!/usr/bin/env node
/**
 * no-em-dash: programmatic em-dash (U+2014) remover.
 *
 * Replaces em dashes with grammatically appropriate punctuation where a
 * deterministic rule is safe, and REPORTS the rest instead of guessing:
 *
 *   T1  paired aside          "text — aside — text"        -> "text (aside) text"
 *   T5  after a closing quote "...accurate\" — so"          -> "...accurate\"; so"
 *   T2  before a conjunction  "— but/and/or/so/yet/nor"    -> ", but ..."
 *   T3  before an example     "— e.g. / i.e. / such as ..." -> ", e.g. ..."
 *   T4  label lines           "- `rule` — what it does"     -> "- `rule`: what it does"
 *       (list items, table rows, headings: the dash is a separator)
 *
 * The tier ORDER above is load-bearing: T4 is a structural fallback and must
 * run LAST, or it eats the first dash of a paired aside inside a list item
 * ("- crawler — which is slow — fetches") and pre-empts T2/T3.
 *
 * In code files the dashes inside string, template and regex literals are
 * DATA, not prose: they are masked before the tiers run and restored after, so
 * a split("—") call or a [^—] character class is never rewritten. Dashes in
 * line comments, block comments and JSX text are prose and still get swept.
 *
 * Anything else needs sentence-level judgment (colon vs semicolon vs period
 * vs restructure), so it is listed with file:line for a human or Claude to
 * rewrite in context. Guessing there would mangle prose; this tool refuses.
 *
 * Usage:
 *   node scripts/no-em-dash.mjs --check <paths...>   list all em dashes, exit 1 if any
 *   node scripts/no-em-dash.mjs --write <paths...>   apply T1-T5, list what remains
 *   node scripts/no-em-dash.mjs --check --diff       only added lines vs merge-base
 *                                                    with main (CI gate for new text)
 *   node scripts/no-em-dash.mjs --self-test          run the built-in cases
 *   --fallback (with --write)                        after the tiers, resolve
 *                                                    every leftover dash that
 *                                                    has a clause in front of
 *                                                    it (hyphen between digits).
 *                                                    Good enough for internal
 *                                                    docs; never use it on
 *                                                    user-facing copy.
 *
 * --check labels what it finds, because the fix differs: [literal] is a dash
 * inside code (data: leave it), [escaped] is &mdash; / &#8212; / &#x2014; /
 * \\u2014, which render as a dash but hide from a literal-character search
 * (reported only, since rewriting an escape means editing code), and an
 * unlabelled line is prose someone has to rewrite. All three exit 1.
 *
 * ponytail: rule-based tiers cover the common shapes; upgrade path if the
 * leftovers ever get annoying is an LLM pass over just the reported lines.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert";

const DASH = "—";
// Stands in for a dash that lives inside a code literal. Private-use area, so
// it can never collide with anything real in a source file.
const MASK = "\uE000";
// calibration/fixtures holds scraped real-site HTML the engine calibrates
// against: that is DATA whose bytes must stay stable, never prose to fix.
// This file is skipped too: it is the one place where an em dash (and every
// escaped spelling of one) is the subject matter, not a style slip.
const SKIP = /node_modules|(^|\/)dist\/|(^|\/)calibration\/fixtures\/|(^|\/)no-em-dash\.mjs$|\.min\.|\.(png|jpe?g|gif|svg|ico|pdf|zip|gz|woff2?|ttf|lock|snap|map)$/i;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/i;
const MARKDOWN = /\.mdx?$/i;
// Escaped forms that still RENDER an em dash. Reported, never auto-rewritten.
const ESCAPED = /&mdash;|&#8212;|&#x2014;|\\[uU]\{?0*2014\}?/g;
const escapeRe = () => new RegExp(ESCAPED.source, "g");

/* ------------------------------------------------------------------ masking */

/**
 * Replace every em dash that sits inside a code literal with MASK, so the
 * prose tiers cannot see it. Returns text of the same length.
 *
 * ponytail: this is a character-level approximation of a JS/TS lexer, not a
 * lexer. It does not know types, ASI or JSX grammar, and it guesses at the
 * regex-vs-division meaning of "/" from the previous significant token. Every
 * guess is biased toward "this is a literal, leave it alone", and a wrong
 * regex guess just ends at the newline, so the worst case is a dash we fail to
 * sweep, never a dash we wrongly rewrite. Upgrade path if that ever bites:
 * swap this function for a real tokenizer (typescript.createScanner, acorn)
 * behind the same signature.
 */
export function maskLiterals(text, file = "") {
  if (MARKDOWN.test(file)) return maskMarkdown(text);
  if (!CODE.test(file)) return text;

  const out = text.split("");
  const mask = (i) => { if (out[i] === DASH) out[i] = MASK; };
  let mode = "CODE"; // CODE | LINE | BLOCK | SQ | DQ | TPL | RE | RECLASS
  const tpl = [];    // template-literal nesting: brace depth inside each ${}
  let prev = "";     // last significant char seen in CODE
  let word = "";     // identifier ending at `prev`, for the regex guess
  let quoted = "";   // open quote of a sample inside a comment

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const c2 = text[i + 1];

    if (mode === "CODE") {
      if (c === "/" && c2 === "/") { mode = "LINE"; i++; continue; }
      if (c === "/" && c2 === "*") { mode = "BLOCK"; i++; continue; }
      if (c === '"') { mode = "DQ"; continue; }
      if (c === "'") { mode = "SQ"; continue; }
      if (c === "`") { mode = "TPL"; tpl.push(0); continue; }
      if (c === "/" && regexPosition(prev, word)) { mode = "RE"; continue; }
      if (c === "{" && tpl.length) tpl[tpl.length - 1] += 1;
      if (c === "}" && tpl.length) {
        if (tpl[tpl.length - 1] === 0) { mode = "TPL"; continue; }
        tpl[tpl.length - 1] -= 1;
      }
      if (!/\s/.test(c)) { prev = c; word = /[\w$]/.test(c) ? word + c : ""; }
      continue;
    }
    if (mode === "LINE" || mode === "BLOCK") {
      // Comment prose is swept, but a QUOTED SAMPLE inside a comment
      // (`renders "(<dash>%)"`, `the separator " <dash> "`) is data like any
      // other literal. Only " and ` open a sample here: in a comment an
      // apostrophe is nearly always just an apostrophe.
      if (quoted) { if (c === quoted || c === "\n") quoted = ""; else mask(i); }
      else if (c === '"' || c === "`") quoted = c;
      if (mode === "LINE" && c === "\n") { mode = "CODE"; quoted = ""; }
      if (mode === "BLOCK" && c === "*" && c2 === "/") { mode = "CODE"; quoted = ""; i++; }
      continue;
    }

    // Everything below is a literal: mask, and watch for the terminator.
    if (c === "\\") { mask(i); mask(i + 1); i++; continue; }
    if (c === "\n" && mode !== "TPL") { mode = "CODE"; continue; } // unterminated
    if (mode === "DQ") { if (c === '"') mode = "CODE"; else mask(i); continue; }
    if (mode === "SQ") { if (c === "'") mode = "CODE"; else mask(i); continue; }
    if (mode === "TPL") {
      if (c === "`") { mode = "CODE"; tpl.pop(); }
      else if (c === "$" && c2 === "{") { mode = "CODE"; i++; }
      else mask(i);
      continue;
    }
    if (mode === "RE") {
      if (c === "[") mode = "RECLASS";
      else if (c === "/") mode = "CODE";
      else mask(i);
      continue;
    }
    if (mode === "RECLASS") { if (c === "]") mode = "RE"; else mask(i); continue; }
  }
  return out.join("");
}

/** Can a "/" here open a regex literal? Only in operand position. */
function regexPosition(prev, word) {
  if (prev === "") return true;
  if ("([{,;:=!&|?+-*%~^<>".includes(prev)) return true;
  return /^(return|typeof|instanceof|in|of|new|delete|throw|do|else|case|yield|await|void)$/.test(word);
}

/** Markdown: fenced blocks and inline code spans are code samples, not prose. */
function maskMarkdown(text) {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line.split(DASH).join(MASK);
    return line.replace(/`[^`\n]*`/g, (m) => m.split(DASH).join(MASK));
  }).join("\n");
}

export const unmask = (s) => s.split(MASK).join(DASH);

/* -------------------------------------------------------------------- tiers */

/**
 * Split a line into indent + body + trailing whitespace. Both edges are
 * layout, not prose: the indent is code/JSX structure and the trailing spaces
 * may be a markdown hard line break, so no rule may eat or invent either.
 */
function edges(line) {
  const indent = line.match(/^[ \t]*/)[0];
  const trail = line.slice(indent.length).match(/[ \t]*$/)[0];
  return [indent, line.slice(indent.length, line.length - trail.length), trail];
}

/** Apply the safe tiers to one line. Returns the rewritten line. */
export function fixLine(line) {
  const [indent, body, trail] = edges(line);
  let out = body;

  // T1 paired aside: both dashes must be free-standing (a space or a line edge
  // on each side, so "1<dash>2" ranges never pair) and the aside must be one
  // clean phrase. A comma, semicolon or colon inside means the pairing is a
  // guess ("A <dash> first, B <dash> second" is two unrelated dashes wearing
  // the exact shape of a real aside), so those lines are left for a human.
  out = out.replace(
    new RegExp(`(^|\\s)${DASH} ([^${DASH}${MASK}.!?,;:]{1,120}?) ${DASH}(\\s|$)`, "g"),
    "$1($2)$3",
  );

  // T5 closing quote then dash: the quote ends a cited clause; a semicolon
  // keeps the sentence running without re-opening the quotation. The character
  // before the quote must be sentence material: an OPENING quote is preceded
  // by a delimiter or by nothing, and this tier must never touch those. That
  // missing guard is what turned every "<dash>" string literal into "; ".
  out = out.replace(new RegExp(`([\\w.,!?)\\]…])(["”’'])\\s*${DASH}\\s*`, "g"), "$1$2; ");

  // T2 dash before a coordinating conjunction: plain comma. It needs something
  // to hang the comma on, so a line-leading dash is left alone.
  out = out.replace(new RegExp(`(\\S)\\s*${DASH}\\s*(and|but|or|nor|so|yet)\\b`, "gi"), "$1, $2");

  // T3 dash before an example/clarifier: comma.
  out = out.replace(
    new RegExp(`(\\S)\\s*${DASH}\\s*(e\\.g\\.|i\\.e\\.|for example|such as|like|say,)`, "gi"),
    "$1, $2",
  );

  // T4 label lines: list item / table row / heading where the FIRST dash
  // separates a label from its description. Runs LAST: it is the structural
  // fallback, and running it first destroys asides that live inside a bullet
  // and pre-empts the conjunction and example tiers.
  if (/^\s*(?:[-*+]\s|\|\s|#{1,6}\s|\d+\.\s|>\s)/.test(out)) {
    out = out.replace(
      new RegExp(`^(\\s*(?:[-*+]|\\||#{1,6}|\\d+\\.|>)\\s[^${DASH}]*?\\S)\\s*${DASH}[ \\t]*`),
      (m, p1, offset, full) => `${p1}:${offset + m.length < full.length ? " " : ""}`,
    );
  }

  return indent + out + trail;
}

/**
 * Force-resolve every remaining dash THAT HAS A CLAUSE IN FRONT OF IT (a dash
 * opening a line is a wrapped continuation or a placeholder glyph, and stays).
 * The leftover shape is nearly always "clause <dash> elaboration", so pick by
 * what FOLLOWS the dash:
 *
 *   numeric range          2019<dash>2024        -> hyphen
 *   independent clause     "<dash> it detects"   -> semicolon
 *   everything else        "<dash> a shortcut"   -> colon, or comma when the
 *                                                   line already has a LABEL
 *                                                   colon (avoids "label: x: y")
 *
 * Grammatical in all three branches. User-facing copy still deserves a human
 * rewrite; this is the bulk-cleanup path for internal prose and comments.
 */
const CLAUSE_START = /^(it|they|you|we|i|he|she|there|that|this|these|those|whoever|whatever|everyone|everything|nothing|no one|the \w+ (is|are|was|were|has|have|does|do|will|can|must|should))\b/i;

/**
 * Is there a "label: value" colon before the first dash? A URL scheme, a clock
 * time and a TS type annotation all carry a colon that is NOT a label, and
 * mistaking one for a label downgrades a correct colon to a comma.
 */
export function hasLabelColon(line) {
  const head = line.split(DASH)[0];
  const m = head.match(/(?:^|[\s>|])[^\s:]{1,40}:(?=\s|$)/); // token, colon, space
  if (!m) return false;
  return !/[([<]/.test(head.slice(0, m.index + m[0].length)); // annotation / argument
}

export function fallbackLine(line) {
  const [indent, body, trail] = edges(line);
  let out = body.replace(new RegExp(`(\\d)\\s*${DASH}\\s*(\\d)`, "g"), "$1-$2");
  const labelColon = hasLabelColon(out);
  out = out.replace(new RegExp(`\\s*${DASH}${DASH}?\\s*`, "g"), (m, offset, full) => {
    // Nothing before the dash on this line: a lone "<dash>" cell in JSX is a
    // rendered placeholder glyph, and a leading dash in wrapped prose belongs
    // to the PREVIOUS line. Neither has a clause here to punctuate, so even
    // the hammer leaves them for a human.
    if (offset === 0) return m;
    const rest = full.slice(offset).replace(new RegExp(`^\\s*${DASH}${DASH}?\\s*`), "");
    if (CLAUSE_START.test(rest)) return "; ";
    return labelColon ? ", " : ": ";
  });
  return indent + out.trim() + trail;
}

/** The whole rewrite of one already-masked line: tiers, then the hammer. */
function applyTiers(maskedLine, fallback) {
  let out = fixLine(maskedLine);
  if (fallback && out.includes(DASH)) out = fallbackLine(out);
  return unmask(out);
}

/** Mask -> tiers -> unmask: exactly what --write does to one line of a file. */
export function fixCodeLine(line, file = "x.ts", fallback = false) {
  return applyTiers(maskLiterals(line, file), fallback);
}

/* ---------------------------------------------------------------- self-test */

function selfTest() {
  const cases = [
    // T1 paired aside
    [`the crawler ${DASH} which is slow ${DASH} fetches`, "the crawler (which is slow) fetches"],
    // T1 must NOT pair two unrelated dashes (identical shape, so we refuse)
    [`A ${DASH} first, B ${DASH} second`, `A ${DASH} first, B ${DASH} second`],
    [`pages 1${DASH}2 and 3 ${DASH} 4`, `pages 1${DASH}2 and 3 ${DASH} 4`],
    // T2 conjunction
    [`it ranks ${DASH} but slowly`, "it ranks, but slowly"],
    // T2 must not invent a leading comma at line start
    [`${DASH} but this`, `${DASH} but this`],
    // T3 example
    [`metadata ${DASH} e.g. og:title`, "metadata, e.g. og:title"],
    // T4 list label
    ["- `tech/html-size` " + DASH + " flags big pages", "- `tech/html-size`: flags big pages"],
    [`| cell ${DASH} detail |`, "| cell: detail |"],
    // T4 runs last: an aside inside a bullet stays an aside
    [`- The crawler ${DASH} which is slow ${DASH} fetches`, "- The crawler (which is slow) fetches"],
    // T4 must not pre-empt T2/T3 inside a bullet
    [`- it ranks ${DASH} but slowly`, "- it ranks, but slowly"],
    [`- metadata ${DASH} e.g. og:title`, "- metadata, e.g. og:title"],
    // T4 must not emit trailing whitespace when the dash ends the line
    [`- label ${DASH}`, "- label:"],
    // markdown hard line break (two trailing spaces) survives
    [`- label ${DASH} detail  `, "- label: detail  "],
    // indentation is layout: a nested bullet keeps its depth
    [`    - label ${DASH} detail`, "    - label: detail"],
    // T5 quote then dash
    [`"verifiably accurate" ${DASH} so lastmod is ignored`, `"verifiably accurate"; so lastmod is ignored`],
    // T5 must not fire on an OPENING quote (the bug that corrupted 22 files)
    [`sep = "${DASH}" and more`, `sep = "${DASH}" and more`],
    // ambiguous: left alone for a human
    [`the limit is per file ${DASH} there is no site ceiling`, `the limit is per file ${DASH} there is no site ceiling`],
    // clean line untouched
    ["nothing to do here", "nothing to do here"],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(fixLine(input), expected, `fixLine(${JSON.stringify(input)})`);
  }

  // Code files: literals are data; comments and JSX text are prose.
  const codeCases = [
    // a string literal that is nothing but a dash
    [`const DASH = "${DASH}";`, `const DASH = "${DASH}";`],
    [`const parts = raw.split("${DASH}");`, `const parts = raw.split("${DASH}");`],
    // an array of separator strings
    [`const SEPS = ["${DASH}", "–", "-"];`, `const SEPS = ["${DASH}", "–", "-"];`],
    // regex literal and regex character class
    [`if (/[^${DASH}–]/.test(s)) return s.replace(/${DASH}/g, "-");`,
      `if (/[^${DASH}–]/.test(s)) return s.replace(/${DASH}/g, "-");`],
    // template literal, and the ${} hole inside it (code again, with its own literal)
    ["const t = `a " + DASH + " b`;", "const t = `a " + DASH + " b`;"],
    ['const t = `x ${sep ?? "' + DASH + '"} y`;', 'const t = `x ${sep ?? "' + DASH + '"} y`;'],
    // apostrophes in a comment must not derail the scanner
    [`const q = '${DASH}'; // don't touch it ${DASH} but do fix this comment`,
      `const q = '${DASH}'; // don't touch it, but do fix this comment`],
    // a dash in a // comment on a code line is prose: still swept
    [`const x = 1; // fast ${DASH} but wrong`, "const x = 1; // fast, but wrong"],
    // block comment prose is swept too
    [`/* ranks well ${DASH} but slowly */`, "/* ranks well, but slowly */"],
    // JSX text is prose; a JSX attribute string is data
    [`<p title="a ${DASH} b">fast ${DASH} but slow</p>`, `<p title="a ${DASH} b">fast, but slow</p>`],
    // division must not be mistaken for a regex opener (the "/" ambiguity)
    [`const half = total / count; // ranks ${DASH} but slowly`, "const half = total / count; // ranks, but slowly"],
    // a quoted SAMPLE inside a comment is data; the prose around it is not
    [`// the empty cell renders "(${DASH}%)" here ${DASH} but not always`,
      `// the empty cell renders "(${DASH}%)" here, but not always`],
    [`  // Direction 1: " ${DASH} " IS a separator, so the title splits.`,
      `  // Direction 1: " ${DASH} " IS a separator, so the title splits.`],
  ];
  for (const [input, expected] of codeCases) {
    assert.strictEqual(fixCodeLine(input), expected, `fixCodeLine(${JSON.stringify(input)})`);
  }
  // JSON: every dash lives in a string, so nothing is ever rewritten.
  assert.strictEqual(
    fixCodeLine(`  "note": "ranks ${DASH} but slowly",`, "corpus.json"),
    `  "note": "ranks ${DASH} but slowly",`,
  );
  // Markdown code samples are data as well.
  assert.strictEqual(
    fixCodeLine('- `split("' + DASH + '")` ' + DASH + " splits on the dash", "readme.md"),
    '- `split("' + DASH + '")`: splits on the dash',
  );
  // Literals survive even --fallback, the tier that resolves EVERY dash left.
  const hammered = [
    [`if (/[^${DASH}–]/.test(s)) return s;`, "x.ts"],
    ["const t = `a " + DASH + " b`;", "x.ts"],
    [`const SEPS = ["${DASH}", "–"];`, "x.ts"],
    ['  "sep": "' + DASH + '",', "corpus.json"],
    ["- run `split(\"" + DASH + "\")` first", "readme.md"],
  ];
  for (const [input, file] of hammered) {
    assert.strictEqual(fixCodeLine(input, file, true), input, `--fallback touched a literal: ${input}`);
  }

  const fallbackCases = [
    // independent clause after the dash -> semicolon
    [`per file ${DASH} there is no ceiling`, "per file; there is no ceiling"],
    [`reads the page ${DASH} it never fetches`, "reads the page; it never fetches"],
    // noun-phrase elaboration -> colon
    [`full-lifecycle SEO ${DASH} design, build, audit`, "full-lifecycle SEO: design, build, audit"],
    // line already carries a LABEL colon -> comma, so we never emit "a: b: c"
    [`level: active ${DASH} a shortcut with a ceiling`, "level: active, a shortcut with a ceiling"],
    // a clock time, a URL scheme and a type annotation are NOT label colons
    [`10:00 ${DASH} a good time`, "10:00: a good time"],
    [`see https://pseolint.dev ${DASH} a live demo`, "see https://pseolint.dev: a live demo"],
    [`function f(a: string) ${DASH} a helper`, "function f(a: string): a helper"],
    // numeric range -> hyphen
    [`the 2019${DASH}2024 era`, "the 2019-2024 era"],
    // markdown hard line break survives a trailing dash
    [`a shortcut ${DASH}  `, "a shortcut:  "],
    // a line-leading dash has no clause to punctuate: even the hammer refuses,
    // and the indentation (JSX text wrapped across lines) is untouched
    [`          ${DASH} bring-your-own-DA shift`, `          ${DASH} bring-your-own-DA shift`],
    // a lone dash is a rendered placeholder glyph, not punctuation
    [`        ${DASH}`, `        ${DASH}`],
  ];
  for (const [input, expected] of fallbackCases) {
    assert.strictEqual(fallbackLine(input), expected, `fallbackLine(${JSON.stringify(input)})`);
  }

  // Every escaped form renders a dash and must be reported by --check.
  const escapes = ["&mdash;", "&#8212;", "&#x2014;", "\\u2014", "\\u{2014}", "\\U00002014"];
  for (const s of escapes) assert.ok(escapeRe().test(s), `escape not detected: ${s}`);
  assert.ok(!escapeRe().test("\\u2015"), "over-eager escape match");

  const total = cases.length + codeCases.length + fallbackCases.length + escapes.length + hammered.length + 3;
  console.log(`self-test: ${total} cases passed`);
}

/* --------------------------------------------------------------------- main */

function listTargets(args) {
  const paths = args.filter((a) => !a.startsWith("--"));
  if (paths.length > 0) return paths.filter((p) => existsSync(p) && statSync(p).isFile() && !SKIP.test(p));
  // No paths: every tracked text file.
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter((p) => p && existsSync(p) && !SKIP.test(p));
}

/**
 * Merge-base with main, or null. A shallow CI checkout (actions/checkout@v4
 * defaults to fetch-depth: 1) has no local main ref at all, so this must not
 * throw: --diff degrades to "check every line", which is stricter than the
 * diff gate, never looser.
 */
function mergeBase() {
  for (const ref of ["main", "origin/main"]) {
    try {
      const base = execSync(`git merge-base ${ref} HEAD`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (base) return base;
    } catch { /* no such ref in this checkout */ }
  }
  console.error(
    "no-em-dash: --diff needs a merge-base with main, and this checkout has neither `main` nor `origin/main`.\n" +
    "  In CI, give actions/checkout `fetch-depth: 0`, or add a step running\n" +
    "  `git fetch --no-tags --depth=1 origin main:main`.\n" +
    "  Falling back to checking ALL lines in the target files.",
  );
  return null;
}

/** In --diff mode, only lines ADDED vs the merge-base with main count. */
function addedLineSet(file, base) {
  const diff = execSync(`git diff ${base} -- ${JSON.stringify(file)}`, { encoding: "utf8" });
  const added = new Set();
  let newLine = 0;
  for (const l of diff.split("\n")) {
    const hunk = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (l.startsWith("+") && !l.startsWith("+++")) { added.add(newLine); newLine += 1; }
    else if (!l.startsWith("-") && !l.startsWith("\\")) { newLine += 1; }
  }
  return added;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const write = args.includes("--write");
  const fallback = args.includes("--fallback");
  // Resolved ONCE, and never fatal: the old code shelled out to git per file
  // and threw on a shallow checkout instead of saying what was wrong.
  const base = args.includes("--diff") ? mergeBase() : null;

  let remaining = 0;   // dashes in prose: a human still has to rewrite these
  let inData = 0;      // dashes inside code literals: never ours to touch
  let escaped = 0;
  let fixed = 0;
  for (const file of listTargets(args)) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    if (text.includes("\u0000")) continue; // binary
    if (!text.includes(DASH) && !escapeRe().test(text)) continue;

    const scope = base ? addedLineSet(file, base) : null;
    const lines = text.split("\n");
    // Masked view of the same lines: in code, literal dashes are invisible to
    // the tiers, so a split("<dash>") or a [^<dash>] class is never rewritten.
    const masked = maskLiterals(text, file).split("\n");
    let changed = false;

    lines.forEach((line, i) => {
      if (scope && !scope.has(i + 1)) return;
      if (line.includes(DASH)) {
        let next = line;
        if (write) {
          next = applyTiers(masked[i], fallback);
        }
        if (next !== line) {
          lines[i] = next;
          changed = true;
          fixed += (line.split(DASH).length - 1) - (next.split(DASH).length - 1);
        }
        if (lines[i].includes(DASH)) {
          // Say WHY a line is still here. A dash the masker walled off is data
          // (a separator constant, a placeholder glyph, a regex class): the
          // fix is to leave it alone or move it behind a named constant, never
          // to hand-apply a prose rule to it.
          const inLiteral = masked[i].split(MASK).length - 1;
          const dashes = line.split(DASH).length - 1;
          const tag = inLiteral === 0 ? "" : inLiteral >= dashes ? "[literal] " : "[part literal] ";
          if (inLiteral >= dashes) inData += 1; else remaining += 1;
          console.log(`${file}:${i + 1}: ${tag}${lines[i].trim().slice(0, 120)}`);
        }
      }
      const esc = lines[i].match(escapeRe());
      if (esc) {
        escaped += esc.length;
        console.log(`${file}:${i + 1}: [escaped ${esc[0]}] ${lines[i].trim().slice(0, 120)}`);
      }
    });

    if (write && changed) writeFileSync(file, lines.join("\n"), "utf8");
  }

  if (write) console.log(`\nreplaced ${fixed} em dash(es) via safe rules`);
  if (remaining > 0) {
    console.log(`${remaining} line(s) still carry an em dash in prose and need a contextual rewrite (colon vs semicolon vs period is a judgment call this tool refuses to guess).`);
  }
  if (inData > 0) {
    console.log(`${inData} line(s) carry an em dash inside a code literal [literal], where it is DATA: the codemod never rewrites those, and neither should you without reading the call site.`);
  }
  if (escaped > 0) {
    console.log(`${escaped} escaped em dash(es) render as a dash but are NOT auto-rewritten (they live in code, not prose): fix these by hand.`);
  }
  if (remaining + inData + escaped > 0) process.exitCode = 1;
  else if (!write) console.log("no em dashes found");
}

main();

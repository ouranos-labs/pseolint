#!/usr/bin/env node
/**
 * no-em-dash: programmatic em-dash (U+2014) remover.
 *
 * Replaces em dashes with grammatically appropriate punctuation where a
 * deterministic rule is safe, and REPORTS the rest instead of guessing:
 *
 *   T1  paired aside          "text \u2014 aside \u2014 text"        -> "text (aside) text"
 *   T2  before a conjunction  "\u2014 but/and/or/so/yet/nor"    -> ", but ..."
 *   T3  before an example     "\u2014 e.g. / i.e. / such as ..." -> ", e.g. ..."
 *   T4  label lines           "- `rule` \u2014 what it does"     -> "- `rule`: what it does"
 *       (list items, table rows, headings: the dash is a separator)
 *   T5  after a closing quote "...accurate\" \u2014 so"          -> "...accurate\"; so"
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
 *
 * ponytail: rule-based tiers cover the common shapes; upgrade path if the
 * leftovers ever get annoying is an LLM pass over just the reported lines.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert";

const DASH = "\u2014";
const SKIP = /node_modules|(^|\/)dist\/|\.min\.|\.(png|jpe?g|gif|svg|ico|pdf|zip|gz|woff2?|ttf|lock|snap|map)$/i;

/** Apply the safe tiers to one line. Returns the rewritten line. */
export function fixLine(line) {
  let out = line;

  // T4 label lines: list item / table row / heading where the FIRST dash
  // separates a label from its description. Runs first because these lines
  // are structural, not prose.
  if (/^\s*(?:[-*+]\s|\|\s|#{1,6}\s|\d+\.\s|>\s)/.test(out)) {
    out = out.replace(new RegExp(`^(\\s*(?:[-*+]|\\||#{1,6}|\\d+\\.|>)\\s[^${DASH}]*?\\S)\\s*${DASH}\\s*`), "$1: ");
  }

  // T1 paired aside within the line: shortest span, no sentence-ending
  // punctuation inside (a period inside means they are two separate dashes).
  out = out.replace(new RegExp(`\\s*${DASH}\\s*([^${DASH}.!?]{1,120}?)\\s*${DASH}\\s*`, "g"), " ($1) ");

  // T5 closing quote then dash: the quote ends a cited clause; a semicolon
  // keeps the sentence running without re-opening the quotation.
  out = out.replace(new RegExp(`(["”’'])\\s*${DASH}\\s*`, "g"), "$1; ");

  // T2 dash before a coordinating conjunction: plain comma.
  out = out.replace(new RegExp(`\\s*${DASH}\\s*(and|but|or|nor|so|yet)\\b`, "gi"), ", $1");

  // T3 dash before an example/clarifier: comma.
  out = out.replace(new RegExp(`\\s*${DASH}\\s*(e\\.g\\.|i\\.e\\.|for example|such as|like|say,)`, "gi"), ", $1");

  return out;
}

function selfTest() {
  const cases = [
    // T1 paired
    [`crawlers ${DASH} Google, Bing ${DASH} follow links`, "crawlers (Google, Bing) follow links"],
    // T2 conjunction
    [`it ranks ${DASH} but slowly`, "it ranks, but slowly"],
    // T3 example
    [`metadata ${DASH} e.g. og:title`, "metadata, e.g. og:title"],
    // T4 list label
    [`- \`tech/html-size\` ${DASH} flags big pages`, "- `tech/html-size`: flags big pages"],
    [`| cell ${DASH} detail |`, "| cell: detail |"],
    // T5 quote then dash
    [`"verifiably accurate" ${DASH} so lastmod is ignored`, `"verifiably accurate"; so lastmod is ignored`],
    // ambiguous: left alone for a human
    [`the limit is per file ${DASH} there is no site ceiling`, `the limit is per file ${DASH} there is no site ceiling`],
    // clean line untouched
    ["nothing to do here", "nothing to do here"],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(fixLine(input), expected, `fixLine(${JSON.stringify(input)})`);
  }
  console.log(`self-test: ${cases.length} cases passed`);
}

function listTargets(args) {
  const paths = args.filter((a) => !a.startsWith("--"));
  if (paths.length > 0) return paths.filter((p) => existsSync(p) && statSync(p).isFile() && !SKIP.test(p));
  // No paths: every tracked text file.
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .filter((p) => p && existsSync(p) && !SKIP.test(p));
}

/** In --diff mode, only lines ADDED vs the merge-base with main count. */
function addedLineSet(file) {
  const base = execSync("git merge-base main HEAD", { encoding: "utf8" }).trim();
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
  const diffOnly = args.includes("--diff");

  let remaining = 0;
  let fixed = 0;
  for (const file of listTargets(args)) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    if (!text.includes(DASH)) continue;
    if (text.includes("\u0000")) continue; // binary

    const scope = diffOnly ? addedLineSet(file) : null;
    const lines = text.split("\n");
    let changed = false;

    lines.forEach((line, i) => {
      if (!line.includes(DASH)) return;
      if (scope && !scope.has(i + 1)) return;
      const next = write ? fixLine(line) : line;
      if (next !== line) {
        lines[i] = next;
        changed = true;
        fixed += (line.split(DASH).length - 1) - (next.split(DASH).length - 1);
      }
      if (lines[i].includes(DASH)) {
        remaining += 1;
        console.log(`${file}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
      }
    });

    if (write && changed) writeFileSync(file, lines.join("\n"), "utf8");
  }

  if (write) console.log(`\nreplaced ${fixed} em dash(es) via safe rules`);
  if (remaining > 0) {
    console.log(`${remaining} line(s) still carry an em dash and need a contextual rewrite (colon vs semicolon vs period is a judgment call this tool refuses to guess).`);
    process.exitCode = 1;
  } else if (!write) {
    console.log("no em dashes found");
  }
}

main();

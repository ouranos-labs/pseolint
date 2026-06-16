// Runnable check for the Tier-1 client verdict (architecture §6).
// Imports the REAL core rules via subpath exports, so this also proves the
// browser-safe export wiring resolves. `node tests/rules-client.test.js`
// (requires @pseolint/core to be built — `dist/` — which it is in the workspace).
import assert from "node:assert";
import { toVerdict, verdictFor } from "../src/shared/rules-client.js";

// --- toVerdict: severity → level, high-confidence gate (fail closed, §9) ---
// Severities mirror core v0.7.1: thin-content(<150w)=error; og-missing &
// soft-404-strong=warning; soft-404-weak & thin-medium=low/medium (dropped).
assert.strictEqual(toVerdict([]), null, "no findings → no badge");
assert.deepStrictEqual(
  toVerdict([{ ruleId: "spam/thin-content", severity: "error" }]),
  { level: "flag", label: "thin" },
  "an error finding → red flag, tagged",
);
assert.deepStrictEqual(
  toVerdict([{ ruleId: "tech/soft-404", severity: "warning" }]),
  { level: "warn", label: "soft 404" },
  "a warning finding → amber",
);
assert.deepStrictEqual(
  toVerdict([{ ruleId: "tech/og-completeness", severity: "warning" }]),
  { level: "warn", label: "no OG tags" },
  "warning → amber",
);
assert.strictEqual(
  toVerdict([{ ruleId: "spam/thin-content", severity: "error", confidence: "medium" }]),
  null,
  "medium-confidence finding is dropped — we badge only what's sound",
);
assert.strictEqual(
  toVerdict([
    { ruleId: "tech/og-completeness", severity: "warning" },
    { ruleId: "spam/thin-content", severity: "error" },
  ]).label,
  "2 flags",
  "multiple findings → count label",
);

// --- verdictFor: real rules over parsed HTML ---
const longBody = "widget ".repeat(320); // > 300 words → thin-content stays silent

// Complete, substantive page → nothing to badge.
const clean = `<html><head><title>Widgets</title>
  <meta property="og:title" content="W"><meta property="og:description" content="D"><meta property="og:image" content="i.png">
  </head><body><main>${longBody}</main></body></html>`;
assert.strictEqual(verdictFor(clean, "https://x.com", 200), null, "clean page → no badge");

// Substantive page missing OG → amber, og-completeness only.
const noOg = `<html><head><title>Widgets</title></head><body><main>${longBody}</main></body></html>`;
assert.deepStrictEqual(
  verdictFor(noOg, "https://x.com", 200),
  { level: "warn", label: "no OG tags" },
  "missing OG on a real page → amber",
);

// HTTP 200 error page: soft-404 (warning) + thin-content (error, <150w) co-fire
// → the error drives a red flag. Exercises the h1 path too (heading carries the
// error language, like a real soft-404 template).
const soft404 = `<html><head><title>Home</title></head><body><h1>Page Not Found</h1><main>Sorry, the page you requested could not be found on this server. It may have been moved or deleted.</main></body></html>`;
assert.strictEqual(verdictFor(soft404, "https://x.com/gone", 200).level, "flag", "soft 404 + thin → red flag");

// Un-hydrated SPA shell → never badge (can't see the rendered content).
const shell = `<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>`;
assert.strictEqual(verdictFor(shell, "https://x.com", 200), null, "SPA shell → fail closed");

console.log("rules-client: all verdict checks passed");

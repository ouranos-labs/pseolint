// `node tests/coverage.test.js`
import assert from "node:assert";
import { coverage } from "../src/shared/coverage.js";

const results = [
  { url: "a", verdict: { level: "flag", label: "thin" }, ok: true },
  { url: "b", verdict: null, ok: true },
  { url: "c", verdict: { level: "warn", label: "no OG tags" }, ok: true },
  { url: "d", verdict: null, ok: false }, // fetch failed
];
assert.deepStrictEqual(coverage(results), { total: 4, scanned: 3, failed: 1, flagged: 2 });
assert.deepStrictEqual(coverage([]), { total: 0, scanned: 0, failed: 0, flagged: 0 });
console.log("coverage: all checks passed");

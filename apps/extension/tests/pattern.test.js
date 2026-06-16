// Runnable check for the Path B pattern seed. `bun tests/pattern.test.js`.
import assert from "node:assert";
import { detectPattern } from "../src/content/site/pattern.js";

const cases = [
  ["https://x.com/products/123", "/products/:id"],
  ["https://x.com/city/new-york", "/city/:slug"],
  ["https://x.com/jobs/software-engineer", "/jobs/:slug"],
  ["https://x.com/blog/2024-01-01/launch-day", "/blog/:date/:slug"],
  ["https://x.com/u/3fa85f64-5717-4562-b3fc-2c963f66afa6", "/u/:uuid"],
  ["https://x.com/about", "/about"], // no digit/hyphen → stays static
  ["https://x.com/p/42?ref=serp#top", "/p/:id"], // query + hash ignored
  ["https://x.com/", "/"], // root
];

for (const [url, expected] of cases) {
  assert.strictEqual(detectPattern(url).pattern, expected, url);
}

// tokens are the array form (feeds SignalSet.pattern, all strings per §8).
const { tokens } = detectPattern("https://x.com/products/123");
assert.deepStrictEqual(tokens, ["products", ":id"]);

console.log("pattern: all cases passed");

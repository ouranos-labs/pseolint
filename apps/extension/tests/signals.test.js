// Runnable check for the exfiltration boundary (architecture §8).
// No framework on purpose (ponytail): `bun tests/signals.test.js` or `node` it.
import assert from "node:assert";
import { assertEmittable } from "../src/shared/signals.js";

const valid = {
  url: "https://example.com/p/123",
  pattern: ["p", ":id"],
  canonical: "https://example.com/p/123",
  robots: null,
  og: { title: "T", description: null, image: null },
  http: { status: 200, xRobotsTag: null, redirectHops: 0 },
  counts: { words: 412, boilerplateRatio: 0.18 },
};

function rejects(obj, why) {
  assert.throws(() => assertEmittable(obj), undefined, `should reject: ${why}`);
}

// Happy path: a clean SignalSet passes and is returned.
assert.strictEqual(assertEmittable(valid), valid);
// Optional fields may be omitted.
assert.ok(assertEmittable({ ...valid, pattern: undefined, hreflang: undefined }));

// Fail closed on anything off the allowlist — the whole point of §8.
rejects({ ...valid, html: "<body>…</body>" }, "raw DOM smuggled at top level");
rejects({ ...valid, og: { ...valid.og, cookie: "sid=secret" } }, "unknown nested key");
rejects({ ...valid, http: { ...valid.http, authorization: "Bearer x" } }, "auth header nested");
rejects({ ...valid, canonical: 42 }, "wrong scalar type");
rejects({ ...valid, robots: undefined }, "missing required (non-optional) field");
rejects({ ...valid, http: { ...valid.http, status: null } }, "null in non-nullable");
rejects({ ...valid, pattern: [1, 2] }, "wrong array element type");
rejects("not an object", "non-object payload");

console.log("signals: all boundary checks passed");

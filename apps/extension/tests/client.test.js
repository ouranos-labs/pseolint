// Runnable check for the single egress point (architecture §3).
// No framework (ponytail): `bun tests/client.test.js`. fetch is injected.
import assert from "node:assert";
import { sendSignals } from "../src/background/client.js";

const valid = {
  url: "https://example.com/p/123",
  canonical: null,
  robots: null,
  og: { title: "T", description: null, image: null },
  http: { status: 200, xRobotsTag: null, redirectHops: 0 },
  counts: { words: 412, boilerplateRatio: 0.18 },
};

// Hand-rolled fetch double: `any` because it implements only the two fields
// sendSignals reads, not the whole Response interface.
/** @type {(calls: any[]) => any} */
const okFetch = (calls) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, json: async () => ({ ok: 1 }) };
};

// Happy path: one POST to one origin, JSON body, cookies omitted; returns parsed json.
let calls = [];
const result = await sendSignals(valid, okFetch(calls));
assert.strictEqual(calls.length, 1, "exactly one request");
assert.strictEqual(calls[0].url, "https://api.pseolint.com/v1/signals", "the one origin");
assert.strictEqual(calls[0].init.method, "POST");
assert.strictEqual(calls[0].init.credentials, "omit", "no session attached");
assert.deepStrictEqual(JSON.parse(calls[0].init.body), valid, "body is the payload");
assert.deepStrictEqual(result, { ok: 1 });

// Security-critical: a non-allowlisted payload throws AND nothing is sent.
calls = [];
await assert.rejects(
  () => sendSignals({ ...valid, html: "<body>secret</body>" }, okFetch(calls)),
  /unknown field html/,
);
assert.strictEqual(calls.length, 0, "rejected payload never reaches fetch");

// API error surfaces, not swallowed.
/** @type {any} */
const errFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
await assert.rejects(() => sendSignals(valid, errFetch), /pseolint API 500/);

console.log("client: all egress checks passed");

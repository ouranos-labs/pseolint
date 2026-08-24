// pseolint extension: the single network egress point (architecture §3).
//
// The ONLY component that talks to the network, and it talks to exactly one
// origin. Every payload passes the §8 allowlist guard BEFORE it leaves the
// browser, so a non-emittable object fails closed; nothing is sent.
import { assertEmittable } from "../shared/signals.js";

// ponytail: one origin, hardcoded by design (§3/§7), not config, there is no
// second endpoint to make configurable.
const API_URL = "https://api.pseolint.com/v1/signals";

// Validate against the allowlist, then POST to the one origin. Throws on a
// non-emittable payload (fail closed) or a non-OK API response.
export async function sendSignals(payload, fetchImpl = fetch) {
  assertEmittable(payload); // §8: reject anything off the allowlist before egress
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit", // never attach cookies/session to the egress (§8)
  });
  if (!res.ok) throw new Error(`pseolint API ${res.status}`);
  return res.json();
}

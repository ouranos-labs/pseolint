// pseolint extension: the exfiltration allowlist (architecture §8).
//
// SINGLE SOURCE OF TRUTH for what may leave the browser. The service worker
// runs assertEmittable() before any transmit; anything not matching the schema
// throws and is dropped. Allowlist, never blocklist: an unknown key, raw DOM,
// cookies, session tokens, a stray `html` field: fails closed by default.
//
// Native validator on purpose: zod would drag a dependency into users'
// authenticated browsers (§10). The schema below is a few lines; so is checking it.

// Field spec grammar:
//   "str" | "num" | "bool"            scalar, required, non-null
//   { type, optional?, nullable? }    type is a scalar, ["str"] for an array, or
//                                      a nested schema object
export const SIGNAL_SCHEMA = {
  url: "str", // page URL (path structure / detected pattern tokens)
  pattern: { type: ["str"], optional: true }, // detected template tokens
  canonical: { type: "str", nullable: true }, // <link rel=canonical>
  robots: { type: "str", nullable: true }, // <meta name=robots>
  hreflang: { type: ["str"], optional: true },
  og: {
    title: { type: "str", nullable: true },
    description: { type: "str", nullable: true },
    image: { type: "str", nullable: true },
  },
  http: {
    status: "num",
    xRobotsTag: { type: "str", nullable: true },
    redirectHops: "num",
  },
  counts: {
    words: "num",
    boilerplateRatio: "num", // 0..1
  },
  hashes: { type: ["str"], optional: true }, // structural hashes
};

const SCALARS = { str: "string", num: "number", bool: "boolean" };

function normalize(spec) {
  if (typeof spec === "string") return { type: spec }; // scalar shorthand
  if ("type" in spec) return spec; // already a field spec
  return { type: spec }; // a nested schema object
}

function checkScalar(value, type, path) {
  if (typeof value !== SCALARS[type]) {
    throw new Error(`signals: ${path} must be ${type}, got ${typeof value}`);
  }
}

function checkValue(value, spec, path) {
  const { type, nullable } = spec;
  if (value === null) {
    if (nullable) return;
    throw new Error(`signals: ${path} is null but not nullable`);
  }
  if (Array.isArray(type)) {
    if (!Array.isArray(value)) throw new Error(`signals: ${path} must be an array`);
    value.forEach((v, i) => checkScalar(v, type[0], `${path}[${i}]`));
    return;
  }
  if (typeof type === "object") {
    assertEmittable(value, type, path); // nested schema: deep allowlist
    return;
  }
  checkScalar(value, type, path);
}

// Throws on the first violation; returns the object when it is fully clean.
export function assertEmittable(obj, schema = SIGNAL_SCHEMA, path = "") {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error(`signals: ${path || "value"} must be a plain object`);
  }
  // undefined === absent: JSON.stringify drops it, so it never reaches the wire.
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue;
    if (!(key in schema)) {
      throw new Error(`signals: unknown field ${path ? path + "." : ""}${key}`);
    }
  }
  for (const [key, rawSpec] of Object.entries(schema)) {
    const spec = normalize(rawSpec);
    const here = path ? `${path}.${key}` : key;
    if (obj[key] === undefined) {
      if (spec.optional) continue;
      throw new Error(`signals: missing required field ${here}`);
    }
    checkValue(obj[key], spec, here);
  }
  return obj;
}

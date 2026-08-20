// pseolint extension: single-URL template pattern guess (Path B seed, §5).
//
// ponytail: heuristic from ONE url, variable segments are guessed by shape.
//   Ceiling: a static page like "/about-us" gets mis-generalised to ":slug".
//   That's fine: the server validates a template actually has siblings before
//   it samples (§5 stratified sampling). This only seeds the crawl with a guess.

// Order matters: the first match wins (uuid/date before the generic slug rule).
const RULES = [
  [/^\d+$/, ":id"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ":uuid"],
  [/^\d{4}(-\d{2}(-\d{2})?)?$/, ":date"],
  [/-/, ":slug"],
];

function classify(segment) {
  for (const [re, token] of RULES) if (re.test(segment)) return token;
  return segment; // static
}

// → { tokens, pattern }. tokens feeds SignalSet.pattern (the §8 allowlist).
export function detectPattern(url) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const tokens = segments.map(classify);
  return { tokens, pattern: "/" + tokens.join("/") };
}

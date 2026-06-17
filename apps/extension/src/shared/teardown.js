// Pure "reads" for the SERP competitive scorecard. Descriptive facts only —
// the strategic framing ("the opening") is pseolint's read, surfaced in the
// summary, never stamped on a competitor's row (§6/§11).

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Normalize a user-typed domain ("https://www.X.com/path", "X.com") → "x.com".
export function userHost(input) {
  if (!input) return "";
  return String(input).trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

// median word count over results actually fetched + parsed (excl. fails/shells).
export function contentBar(results) {
  const w = results.filter((r) => r.ok && !r.isLikelyShell).map((r) => r.words).sort((a, b) => a - b);
  if (w.length === 0) return 0;
  const mid = Math.floor(w.length / 2);
  return w.length % 2 ? w[mid] : Math.round((w[mid - 1] + w[mid]) / 2);
}

// non-exclusive descriptive facts for one row; [] (strong) when none fired.
export function rowTags(r) {
  const tags = [...(r.flags ?? [])]; // thin / soft 404 / no OG tags (from rules-client)
  if (r.templated && !tags.includes("templated")) tags.push("templated");
  if (r.aeoReady) tags.push("AEO"); // positive: structured for AI-Overview citation
  return tags;
}

// how programmatic the SERP is + the dominant host.
export function saturation(results) {
  const templated = results.filter((r) => r.templated);
  const counts = new Map();
  for (const r of templated) counts.set(host(r.url), (counts.get(host(r.url)) ?? 0) + 1);
  let topHost = null;
  let top = 0;
  for (const [h, c] of counts) if (c > top) { top = c; topHost = h; }
  return { templated: templated.length, total: results.length, topHost, topHostCount: top };
}

// the full scorecard model the side panel renders.
export function teardown(results) {
  const bar = contentBar(results);
  const rows = results.map((r) => ({
    ...r,
    host: host(r.url),
    tags: rowTags(r),
    belowBar: r.ok && !r.isLikelyShell && r.words < bar,
  }));
  const fetched = results.filter((r) => r.ok && !r.isLikelyShell);
  // the opening = the weakest ranked page that still ranks: lowest words among
  // fetched results below the bar (ties → best rank).
  // a real opening = below the bar AND genuinely weak (a risk fact, templated, or
  // far below) — not merely below the median by a hair.
  const candidates = rows
    .filter((r) => r.belowBar && ((r.flags?.length ?? 0) > 0 || r.templated || r.words < bar * 0.6))
    .sort((a, b) => a.words - b.words || a.rank - b.rank);
  return {
    bar,
    scanned: fetched.length,
    failed: results.length - fetched.length,
    // flagged = negative risk facts only (templated/AEO are descriptive, not flags).
    flagged: rows.filter((r) => (r.flags?.length ?? 0) > 0).length,
    aeoReady: fetched.filter((r) => r.aeoReady).length,
    saturation: saturation(results),
    opening: candidates[0] ?? null,
    rows, // SERP-rank order (input order)
  };
}

// A synthesized strategic verdict — the "so what", one descriptive line.
export function takeaway(model) {
  const { saturation: sat, opening, scanned, aeoReady } = model;
  const satPct = sat.total ? sat.templated / sat.total : 0;
  if (opening && satPct >= 0.4)
    return "Beatable: programmatic-heavy with thin leaders below the bar — a quality + originality play wins here.";
  if (opening)
    return "Openings exist: some ranked pages are thin or templated — outrank them with real depth.";
  if (scanned > 0 && aeoReady === 0)
    return "AEO gap: nothing here is structured for AI-Overview citation — an AEO-first page can leapfrog.";
  if (satPct >= 0.5)
    return "Programmatic battlefield: templated but solid — you'll need standout depth to break in.";
  return "Fortress: deep, original, well-structured results — hard to displace without exceptional content.";
}

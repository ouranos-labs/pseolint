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
  const scanned = results.filter((r) => r.ok && !r.isLikelyShell).length;
  // the opening = the weakest ranked page that still ranks: lowest words among
  // fetched results below the bar (ties → best rank).
  const candidates = rows.filter((r) => r.belowBar).sort((a, b) => a.words - b.words || a.rank - b.rank);
  return {
    bar,
    scanned,
    failed: results.length - scanned,
    flagged: rows.filter((r) => r.tags.length).length,
    saturation: saturation(results),
    opening: candidates[0] ?? null,
    rows, // SERP-rank order (input order)
  };
}

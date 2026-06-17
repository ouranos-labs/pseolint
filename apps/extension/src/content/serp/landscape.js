// Tier-1 SERP landscape (architecture §6 honesty boundary): describes how
// programmatic the VISIBLE results are. No fetch, no permission, no risk verdict.
//
// Clustering is STRUCTURAL, from the visible siblings — NOT pattern.js's per-URL
// guess. pattern.js only treats a segment as :slug when it has a hyphen, so
// /city/boston and /city/miami would never group. On a SERP we can see the
// siblings, so the sound signal is: ≥2 results sharing host + parent directory
// with differing leaves = one template cluster. (pattern.js stays the single-URL
// Path-B seed; this is the multi-URL landscape.)

// results: [{ url, anchor }] from detect.js
// → { total, templatedUrls:Set, clusters:[{host,pattern,count,urls}], hostCount }
export function analyzeLandscape(results) {
  const groups = new Map(); // "host /parent" → { host, parent, urls:[] }
  for (const { url } of results) {
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) continue; // no parent directory → not a template cluster
    const parent = "/" + segs.slice(0, -1).join("/");
    const key = `${host} ${parent}`;
    if (!groups.has(key)) groups.set(key, { host, parent, urls: [] });
    groups.get(key).urls.push(url);
  }
  const clusters = [...groups.values()]
    .filter((g) => g.urls.length >= 2)
    .map((g) => ({ host: g.host, pattern: `${g.parent}/:slug`, count: g.urls.length, urls: g.urls }))
    .sort((a, b) => b.count - a.count);
  return {
    total: results.length,
    templatedUrls: new Set(clusters.flatMap((c) => c.urls)),
    clusters,
    hostCount: new Set(clusters.map((c) => c.host)).size,
  };
}

// summary → one-line chip text, or null when nothing is templated (don't badge).
export function landscapeChip(summary) {
  if (!summary || summary.templatedUrls.size === 0) return null;
  const n = summary.templatedUrls.size;
  const h = summary.hostCount;
  return `${n}/${summary.total} results templated · ${h} host${h === 1 ? "" : "s"}`;
}

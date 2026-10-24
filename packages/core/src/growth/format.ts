import type { GrowthReport } from "./index.js";
import type { FeatureName } from "./analyze.js";
import type { GrowthAction } from "./plan.js";

const LABEL: Record<FeatureName, string> = {
  inlinks: "internal links pointing in",
  pagerank: "internal PageRank",
  wordCount: "words of content",
  h2Count: "H2 sections",
  jsonLdCount: "JSON-LD blocks",
  outlinks: "internal links out",
  siblingSimilarity: "similarity to sibling pages",
  titleLength: "title length",
  pathDepth: "URL depth",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (f: FeatureName, v: number) => (f === "siblingSimilarity" ? pct(v) : f === "pagerank" ? v.toFixed(2) : String(Math.round(v)));

export function formatGrowthReport(r: GrowthReport, opts: { limit?: number } = {}): string {
  const limit = opts.limit ?? 10;
  const { analysis: a, plan } = r;
  const out: string[] = [];
  out.push(`pseolint grow  ${r.origin}`);
  out.push(`Search Console: ${a.site.impressions.toLocaleString()} impressions, ${a.site.clicks.toLocaleString()} clicks`);
  out.push("");
  out.push(`Google shows ${a.gscComplete ? "" : "at least "}${a.site.shownUrls} of ${a.site.sitemapUrls} sitemap pages (${pct(a.site.showRate)}). Crawled ${a.pages.length}.`);
  if (!a.gscComplete) out.push("Search Console data is capped (UI export = 1,000 rows): pages missing from it are treated as unknown, not ignored. Show rates are lower bounds; prune is disabled. Export via the API for full data.");
  out.push("");
  out.push("BY TEMPLATE".padEnd(42) + "pages".padStart(7) + "shown".padStart(7) + "rate".padStart(6));
  for (const t of a.templates.filter((t) => t.sitemapUrls > 0).slice(0, 12)) {
    out.push(`  ${t.template.slice(0, 39).padEnd(40)}${String(t.sitemapUrls).padStart(7)}${String(t.shownUrls).padStart(7)}${pct(t.showRate).padStart(6)}`);
  }
  out.push("");
  out.push("WHAT GOOGLE REWARDS ON THIS SITE  (shown vs ignored pages within each template, 10% false-discovery rate)");
  if (plan.rewards.length === 0) out.push("  No significant difference yet (too few ignored pages, or too few crawled). The plan below is still mechanical wins.");
  for (const w of plan.rewards.slice(0, 8)) {
    out.push(`  • ${w.scope === "site" ? "" : `[${w.scope}] `}Shown pages have ${w.direction === "more" ? "MORE" : "LESS"} ${LABEL[w.feature]}: ${fmt(w.feature, w.shownMedian)} vs ${fmt(w.feature, w.ignoredMedian)} (AUC ${w.auc.toFixed(2)}, p=${w.p.toExponential(1)})`);
  }
  out.push("");

  const of = <K extends GrowthAction["kind"]>(k: K) => plan.actions.filter((x): x is Extract<GrowthAction, { kind: K }> => x.kind === k);
  const section = <T>(title: string, items: T[], line: (x: T) => string) => {
    if (items.length === 0) return;
    out.push(`${title} (${items.length})`);
    for (const x of items.slice(0, limit)) out.push(`  ${line(x)}`);
    if (items.length > limit) out.push(`  … ${items.length - limit} more (use --json or --out)`);
    out.push("");
  };
  out.push("PLAN");
  section("■ Unblock: sitemap pages telling Google not to show them", of("unblock"), (x) => `${x.url}  [${x.reason}]`);
  section("■ Add to sitemap: already earning impressions, missing from sitemap", of("add-to-sitemap"), (x) => `${x.url}  (${x.impressions} impr)`);
  section("■ Add internal links: from pages Google shows → pages it is close to ranking or ignoring", of("link"), (x) => `${x.from}\n      → ${x.to}  anchor "${x.anchor}"  [${x.why}]`);
  section("■ Rewrite title/meta: ranking but under-clicked", of("retitle"), (x) => `${x.url}  pos ${x.position.toFixed(1)}, CTR ${(x.ctr * 100).toFixed(1)}% vs ~${(x.expectedCtr * 100).toFixed(1)}% expected  "${x.title}"`);
  section("■ Differentiate: ignored near-clones of sibling pages", of("differentiate"), (x) => `${x.url}  (${pct(x.similarity)} similar)`);
  section("■ Prune or merge: templates Google rejects wholesale", of("prune"), (x) => `${x.template}  ${x.shownUrls}/${x.sitemapUrls} shown: noindex + drop from sitemap, or merge into hub pages`);
  if (plan.actions.length === 0) out.push("  Nothing to do: every crawled page is indexable and earning impressions.");
  return out.join("\n");
}

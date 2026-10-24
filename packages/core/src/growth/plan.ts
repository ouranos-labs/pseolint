import type { Analysis, AnalyzedPage, FeatureContrast, FeatureName } from "./analyze.js";

export type GrowthAction =
  | { kind: "unblock"; url: string; reason: "noindex" | "canonical-elsewhere" | "http-error" }
  | { kind: "add-to-sitemap"; url: string; impressions: number }
  | { kind: "link"; from: string; to: string; anchor: string; why: "striking-distance" | "ignored" }
  | { kind: "retitle"; url: string; title: string; position: number; impressions: number; ctr: number; expectedCtr: number }
  | { kind: "differentiate"; url: string; template: string; similarity: number }
  | { kind: "prune"; template: string; sitemapUrls: number; shownUrls: number };

export interface Reward {
  feature: FeatureName;
  /** "more" = shown pages have higher values than ignored ones. */
  direction: "more" | "less";
  auc: number;
  p: number;
  shownMedian: number;
  ignoredMedian: number;
  scope: string;
}

export interface GrowthPlan {
  rewards: Reward[];
  actions: GrowthAction[];
}

/** Rough organic CTR by position (aggregate industry curves). Only used to flag outliers at 0.5×. */
export function expectedCtr(position: number): number {
  const curve = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  const i = Math.max(1, Math.round(position)) - 1;
  return i < curve.length ? curve[i] : i < 20 ? 0.01 : 0.004;
}

const STOP = new Set("a an and the of for to in on with by at from or vs your you how what best top free guide is are de la le et des du".split(" "));

function tokens(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t)))];
}

export interface PlanOptions {
  linksPerTarget?: number;
  linksPerSource?: number;
  maxLinks?: number;
}

export function buildPlan(a: Analysis, opts: PlanOptions = {}): GrowthPlan {
  // ~9 features × N templates is dozens of tests: Benjamini-Hochberg keeps the
  // false-discovery rate at 10% so "what Google rewards" is not p-hacked noise.
  const tests = [
    ...a.site.contrasts.map((c) => ({ c, scope: "site" })),
    ...a.templates.flatMap((t) => t.contrasts.map((c) => ({ c, scope: t.template }))),
  ];
  const q = benjaminiHochberg(tests.map((t) => t.c.p));
  const rewards = tests
    .filter((t, i) => q[i] < 0.1 && Math.abs(t.c.auc - 0.5) >= 0.1)
    .map((t) => toReward(t.c, t.scope))
    // With one contributing template the stratified site test IS that template's test.
    .filter((w, _i, all) => w.scope === "site" || !all.some((o) => o.scope === "site" && o.feature === w.feature && Math.abs(o.auc - w.auc) < 1e-9))
    .sort((x, y) => Math.abs(y.auc - 0.5) - Math.abs(x.auc - 0.5));

  const actions: GrowthAction[] = [];
  // 1. Self-inflicted: sitemap URLs that tell Google not to show them.
  for (const p of a.pages) if (!p.indexable && p.blockReason) actions.push({ kind: "unblock", url: p.url, reason: p.blockReason });

  // 2. Pages already earning impressions that the sitemap forgot.
  for (const r of a.shownOutsideSitemapRows) actions.push({ kind: "add-to-sitemap", url: r.url, impressions: r.impressions });

  // 3. Templates Google rejects wholesale.
  for (const t of a.templates) {
    if (a.gscComplete && t.sitemapUrls >= 50 && t.showRate < 0.05) actions.push({ kind: "prune", template: t.template, sitemapUrls: t.sitemapUrls, shownUrls: t.shownUrls });
  }

  // 4. Near-clones Google ignores.
  for (const p of a.pages) {
    if (p.indexable && p.known && !p.shown && p.features.siblingSimilarity >= 0.9) actions.push({ kind: "differentiate", url: p.url, template: p.template, similarity: p.features.siblingSimilarity });
  }

  // 5. CTR outliers: ranking, seen, not clicked.
  const shown = a.pages.filter((p) => p.indexable && p.shown && p.position !== undefined);
  for (const p of shown) {
    const pos = p.position!;
    const ctr = p.impressions ? p.clicks / p.impressions : 0;
    const exp = expectedCtr(pos);
    if (pos <= 15 && p.impressions >= 50 && ctr < exp * 0.5) {
      actions.push({ kind: "retitle", url: p.url, title: p.title, position: pos, impressions: p.impressions, ctr, expectedCtr: exp });
    }
  }

  actions.push(...linkPlan(a.pages, opts));
  return { rewards, actions };
}

export function benjaminiHochberg(ps: number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const q = new Array<number>(ps.length);
  let min = 1;
  for (let r = order.length - 1; r >= 0; r--) {
    min = Math.min(min, (order[r].p * order.length) / (r + 1));
    q[order[r].i] = min;
  }
  return q;
}

function toReward(c: FeatureContrast, scope: string): Reward {
  return { feature: c.feature, direction: c.auc > 0.5 ? "more" : "less", auc: c.auc, p: c.p, shownMedian: c.shownMedian, ignoredMedian: c.ignoredMedian, scope };
}

/**
 * Internal links are the one ranking input a site fully controls. Route them
 * from pages Google already shows (it recrawls those) to topically related
 * pages it is close to ranking (positions 8-30) or ignoring outright.
 */
export function linkPlan(pages: AnalyzedPage[], opts: PlanOptions = {}): GrowthAction[] {
  const perTarget = opts.linksPerTarget ?? 3;
  const perSource = opts.linksPerSource ?? 5;
  const maxLinks = opts.maxLinks ?? 500;
  // Title minus its " | Brand" tail: H1 text loses spaces across inline elements
  // ("Spotify<span>Playlist</span>"), so it only stands in when there is no title.
  const label = (p: AnalyzedPage) => p.title.split(/\s+[|–—-]\s+/)[0].trim() || p.h1;
  // Never link across locales (/fr/… → /pt-br/…): wrong-language anchors help nobody.
  const locale = (p: AnalyzedPage) => {
    const seg = p.key.split("/")[1] ?? "";
    return /^[a-z]{2}(-[a-z]{2,4})?$/i.test(seg) ? seg.toLowerCase() : "";
  };

  // Tokens in >25% of titles are brand/boilerplate, not topic.
  const df = new Map<string, number>();
  for (const p of pages) for (const t of tokens(label(p))) df.set(t, (df.get(t) ?? 0) + 1);
  const common = (t: string) => (df.get(t) ?? 0) > Math.max(3, pages.length * 0.25);
  const topic = new Map(pages.map((p) => [p.key, tokens(label(p)).filter((t) => !common(t))]));

  const sources = pages.filter((p) => p.indexable && p.shown).sort((x, y) => y.impressions - x.impressions);
  const byToken = new Map<string, AnalyzedPage[]>();
  for (const s of sources) for (const t of topic.get(s.key) ?? []) byToken.set(t, [...(byToken.get(t) ?? []), s]);

  const striking = pages
    .filter((p) => p.indexable && p.shown && p.position !== undefined && p.position >= 8 && p.position <= 30)
    .sort((x, y) => y.impressions - x.impressions)
    .map((p) => ({ p, why: "striking-distance" as const }));
  const ignored = pages
    .filter((p) => p.indexable && p.known && !p.shown)
    .sort((x, y) => x.features.inlinks - y.features.inlinks)
    .map((p) => ({ p, why: "ignored" as const }));

  const used = new Map<string, number>();
  const out: GrowthAction[] = [];
  for (const { p: target, why } of [...striking, ...ignored]) {
    if (out.length >= maxLinks) break;
    const tt = topic.get(target.key) ?? [];
    if (tt.length === 0) continue;
    const scores = new Map<string, { s: AnalyzedPage; score: number }>();
    for (const t of tt) {
      for (const s of byToken.get(t) ?? []) {
        if (s.key === target.key || locale(s) !== locale(target) || s.outlinks.includes(target.key) || (used.get(s.key) ?? 0) >= perSource) continue;
        const cur = scores.get(s.key) ?? { s, score: s.template === target.template ? 0.1 : 0 };
        cur.score += 1 / tt.length;
        scores.set(s.key, cur);
      }
    }
    const picks = [...scores.values()].filter((x) => x.score >= 0.34).sort((x, y) => y.score - x.score || y.s.impressions - x.s.impressions).slice(0, perTarget);
    for (const { s } of picks) {
      used.set(s.key, (used.get(s.key) ?? 0) + 1);
      out.push({ kind: "link", from: s.url, to: target.url, anchor: label(target), why });
    }
  }
  return out;
}

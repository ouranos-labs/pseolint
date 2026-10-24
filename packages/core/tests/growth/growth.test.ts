import { describe, expect, test } from "vitest";
import { mannWhitney, normalCdf } from "../../src/growth/stats.js";
import { pagerank, analyze } from "../../src/growth/analyze.js";
import { buildPlan, benjaminiHochberg, expectedCtr } from "../../src/growth/plan.js";
import { parseGscPages } from "../../src/growth/gsc.js";
import { toGrowthPage, urlKey } from "../../src/growth/crawl.js";

describe("growth stats", () => {
  test("mannWhitney: full separation → AUC 1 and small p; identical → 0.5", () => {
    const sep = mannWhitney([10, 11, 12, 13, 14, 15, 16, 17], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sep.auc).toBe(1);
    expect(sep.p).toBeLessThan(0.001);
    const same = mannWhitney([3, 3, 3, 3], [3, 3, 3, 3]);
    expect(same.auc).toBe(0.5);
    expect(same.p).toBe(1);
  });

  test("benjaminiHochberg is monotone and ≥ raw p", () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
    expect(q[0]).toBeCloseTo(0.04);
    expect(q[1]).toBeCloseTo(0.04 * 4 / 3);
    expect(q[2]).toBeCloseTo(0.04 * 4 / 3); // step-up: inherits the smaller q above it
    expect(q[3]).toBe(0.5);
    q.forEach((v, i) => expect(v).toBeGreaterThanOrEqual([0.01, 0.04, 0.03, 0.5][i]));
  });

  test("pagerank concentrates on the hub everyone links to", () => {
    const edges = new Map([["a", ["hub"]], ["b", ["hub"]], ["c", ["hub"]], ["hub", ["a"]]]);
    const pr = pagerank(["a", "b", "c", "hub"], edges);
    expect(pr.get("hub")!).toBeGreaterThan(pr.get("b")!);
    const total = [...pr.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(4, 5);
  });

  test("normalCdf is symmetric for negative z", () => {
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
  });

  test("expectedCtr decreases with position", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(15)).toBeGreaterThan(expectedCtr(40));
  });
});

describe("growth io", () => {
  test("parses the Search Console Pages.csv export (BOM, quotes, % CTR)", () => {
    const csv = '﻿Top pages,Clicks,Impressions,CTR,Position\n"https://x.dev/a,b",3,1200,0.25%,7.4\nhttps://x.dev/c,0,15,0%,31\n';
    const rows = parseGscPages(csv);
    expect(rows).toEqual([
      { url: "https://x.dev/a,b", clicks: 3, impressions: 1200, position: 7.4 },
      { url: "https://x.dev/c", clicks: 0, impressions: 15, position: 31 },
    ]);
  });

  test("parses searchanalytics JSON rows", () => {
    expect(parseGscPages(JSON.stringify({ rows: [{ keys: ["https://x.dev/a"], clicks: 1, impressions: 9, position: 4 }] }))).toEqual([
      { url: "https://x.dev/a", clicks: 1, impressions: 9, position: 4 },
    ]);
  });

  test("localized exports: French names, German positional fallback, decimal commas", () => {
    const fr = parseGscPages('"Pages les plus populaires",Clics,Impressions,CTR,Position\nhttps://x.dev/a,"1,234",5000,"0,5 %","12,5"\n');
    expect(fr).toEqual([{ url: "https://x.dev/a", clicks: 1234, impressions: 5000, position: 12.5 }]);
    const de = parseGscPages("Top-Seiten,Klicks,Impressionen,CTR,Position\nhttps://x.dev/b,7,90,7%,3\n");
    expect(de).toEqual([{ url: "https://x.dev/b", clicks: 7, impressions: 90, position: 3 }]);
  });

  test("relative canonical to self stays indexable; to another page blocks", () => {
    const html = (c: string) => `<html><head><link rel="canonical" href="${c}"><title>t</title></head><body>x</body></html>`;
    expect(toGrowthPage(html("/foo"), "https://ex.com/foo", 200, "ex.com").indexable).toBe(true);
    expect(toGrowthPage(html("/bar"), "https://ex.com/foo", 200, "ex.com").blockReason).toBe("canonical-elsewhere");
  });

  test("urlKey joins protocol, www and trailing-slash variants", () => {
    expect(urlKey("http://www.X.dev/a/")).toBe(urlKey("https://x.dev/a"));
  });
});

describe("growth plan on a synthetic pSEO site", () => {
  // 40 /city/:slug pages. Shown ones get linked from the hub and have real content;
  // ignored ones are orphaned clones. The plan must find that and route links.
  const origin = "https://site.dev";
  const shownSlugs = Array.from({ length: 20 }, (_, i) => `paris-${i}`);
  const ignoredSlugs = Array.from({ length: 20 }, (_, i) => `lyon-${i}`);
  const words = (seed: string, n: number) => Array.from({ length: n }, (_, i) => `${seed}${i % 97}w${(i * 7) % 13}`).join(" ");
  const pageHtml = (title: string, body: string, links: string[]) =>
    `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p>${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`;
  const pages = [
    toGrowthPage(pageHtml("Home", "welcome", shownSlugs.map((s) => `/city/${s}`)), `${origin}/`, 200, "site.dev"),
    ...shownSlugs.map((s, i) => toGrowthPage(pageHtml(`Plumbers in ${s.replace("-", " ")}`, words(s, 600), [`/city/${shownSlugs[(i + 1) % 20]}`]), `${origin}/city/${s}`, 200, "site.dev")),
    ...ignoredSlugs.map((s) => toGrowthPage(pageHtml(`Plumbers in ${s.replace("-", " ")}`, words("same", 120), []), `${origin}/city/${s}`, 200, "site.dev")),
    toGrowthPage(pageHtml("Hidden", "x", []).replace("<head>", '<head><meta name="robots" content="noindex">'), `${origin}/city/hidden`, 200, "site.dev"),
  ];
  const sitemapUrls = pages.map((p) => p.url);
  const gsc = [
    ...shownSlugs.map((s, i) => ({ url: `${origin}/city/${s}`, impressions: 100 + i, clicks: i === 0 ? 0 : 3, position: i === 0 ? 3 : 12 })),
    { url: `${origin}/forgotten`, impressions: 40, clicks: 1 },
    { url: "https://other.dev/x", impressions: 999, clicks: 9 },
  ];
  const analysis = analyze({ sitemapUrls, pages, gsc, host: "site.dev" });
  const plan = buildPlan(analysis);

  test("show rate and template stats", () => {
    const t = analysis.templates.find((x) => x.template.includes("city"))!;
    expect(t.shownUrls).toBe(20);
    expect(t.sitemapUrls).toBe(40); // "/city/hidden" has no numbered slug, so the detector files it elsewhere
  });

  test("learns that inlinks, content and uniqueness separate shown from ignored", () => {
    const features = new Set(plan.rewards.map((r) => `${r.feature}:${r.direction}`));
    expect(features.has("inlinks:more")).toBe(true);
    expect(features.has("wordCount:more")).toBe(true);
    expect(features.has("siblingSimilarity:less")).toBe(true);
  });

  test("emits unblock, sitemap, retitle, differentiate and link actions", () => {
    const kinds = (k: string) => plan.actions.filter((a) => a.kind === k);
    expect(kinds("unblock")).toEqual([{ kind: "unblock", url: `${origin}/city/hidden`, reason: "noindex" }]);
    expect(kinds("add-to-sitemap").map((a) => (a as { url: string }).url)).toEqual([`${origin}/forgotten`]); // other.dev excluded
    expect(kinds("retitle").length).toBe(1);
    expect(kinds("differentiate").length).toBe(20);
    const links = kinds("link") as Array<{ from: string; to: string }>;
    expect(links.some((l) => l.to.includes("lyon"))).toBe(true);
    // Never suggest a link that already exists.
    const existing = new Set(pages.flatMap((p) => p.outlinks.map((o) => `${p.key}>${o}`)));
    for (const l of links) expect(existing.has(`${urlKey(l.from)}>${urlKey(l.to)}`)).toBe(false);
  });
});

test("capped GSC data: absent pages are unknown, not ignored (no prune/differentiate/ignored links)", () => {
  const origin = "https://cap.dev";
  const mk = (slug: string, links: string[] = []) =>
    toGrowthPage(`<html><head><title>${slug}</title></head><body><h1>Item ${slug}</h1>${"same words ".repeat(50)}${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`, `${origin}/item/${slug}`, 200, "cap.dev");
  const pages = Array.from({ length: 60 }, (_, i) => mk(`item-${i}`, [`/item/item-${(i + 1) % 60}`]));
  const gsc = [{ url: `${origin}/item/item-0`, impressions: 50, clicks: 1, position: 9 }];
  const a = analyze({ sitemapUrls: pages.map((p) => p.url), pages, gsc, host: "cap.dev", gscComplete: false });
  const plan = buildPlan(a);
  expect(a.pages.filter((p) => !p.known).length).toBe(59);
  expect(plan.actions.some((x) => x.kind === "prune" || x.kind === "differentiate")).toBe(false);
  expect(plan.actions.filter((x) => x.kind === "link").every((x) => (x as { why: string }).why === "striking-distance")).toBe(true);
  // Same input with complete data does prune the 1/60 template.
  expect(buildPlan(analyze({ sitemapUrls: pages.map((p) => p.url), pages, gsc, host: "cap.dev" })).actions.some((x) => x.kind === "prune")).toBe(true);
});

test("link plan stays within a locale and uses the brand-less title as anchor", () => {
  const o = "https://loc.dev";
  const mk = (path: string, title: string) => toGrowthPage(`<html><head><title>${title} | Brand</title></head><body><h1>x</h1>${"w ".repeat(30)}</body></html>`, `${o}${path}`, 200, "loc.dev");
  const pages = [mk("/fr/spotify-playlist", "Créateur playlist Spotify"), mk("/pt-br/spotify-playlist", "Criador playlist Spotify"), mk("/fr/apple-playlist", "Créateur playlist Apple")];
  const gsc = [{ url: `${o}/pt-br/spotify-playlist`, impressions: 90, clicks: 1, position: 4 }, { url: `${o}/fr/apple-playlist`, impressions: 80, clicks: 1, position: 4 }];
  const a = analyze({ sitemapUrls: pages.map((p) => p.url), pages, gsc, host: "loc.dev" });
  const links = buildPlan(a).actions.filter((x) => x.kind === "link") as Array<{ from: string; to: string; anchor: string }>;
  expect(links).toEqual([{ kind: "link", from: `${o}/fr/apple-playlist`, to: `${o}/fr/spotify-playlist`, anchor: "Créateur playlist Spotify", why: "ignored" }]);
});

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { growSite, formatGrowthReport, parseGscPages, collectSitemapUrls, submitIndexNow, GSC_UI_EXPORT_CAP, type GrowthAction } from "@pseolint/core/growth";

export interface GrowCommandOptions {
  url: string;
  gsc: string;
  maxPages?: number;
  concurrency?: number;
  json?: boolean;
  out?: string;
  limit?: number;
}

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";

export async function runGrowCommand(o: GrowCommandOptions): Promise<number> {
  const gsc = parseGscPages(await readFile(o.gsc, "utf8"));
  if (gsc.length === 0) {
    console.error(`pseolint grow: no rows in ${o.gsc}. Export Search Console → Performance → Pages (last 3 months) and pass the Pages.csv.`);
    return 2;
  }
  const origin = new URL(o.url).origin;
  // A UI export at the cap may have dropped shown pages: absence is not "ignored".
  const gscComplete = gsc.length < GSC_UI_EXPORT_CAP;
  if (!gscComplete) console.error(`pseolint grow: ${gsc.length} rows looks like the Search Console UI export cap. Pages missing from it are treated as unknown; use an API export (JSON) for the full list.`);
  if (!o.json) console.error(`pseolint grow: ${gsc.length} Search Console pages loaded; crawling ${origin} …`);
  const report = await growSite(origin, gsc, {
    gscComplete,
    maxPages: o.maxPages,
    concurrency: o.concurrency,
    onProgress: o.json ? undefined : (done, total) => {
      if (done % 100 === 0 || done === total) process.stderr.write(`\r  ${done}/${total} pages`);
    },
  });
  if (!o.json) process.stderr.write("\n");

  const serializable = JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  if (o.out) {
    await mkdir(o.out, { recursive: true });
    const of = <K extends GrowthAction["kind"]>(k: K) => report.plan.actions.filter((x): x is Extract<GrowthAction, { kind: K }> => x.kind === k);
    await writeFile(join(o.out, "growth.json"), serializable);
    await writeFile(join(o.out, "links.csv"), csv([["from", "to", "anchor", "why"], ...of("link").map((l) => [l.from, l.to, l.anchor, l.why])]));
    await writeFile(join(o.out, "retitle.csv"), csv([["url", "current_title", "position", "impressions", "ctr"], ...of("retitle").map((r) => [r.url, r.title, r.position.toFixed(1), String(r.impressions), r.ctr.toFixed(4)])]));
    await writeFile(join(o.out, "sitemap-additions.txt"), of("add-to-sitemap").map((x) => x.url).join("\n") + "\n");
    await writeFile(join(o.out, "unblock.csv"), csv([["url", "reason"], ...of("unblock").map((x) => [x.url, x.reason])]));
    if (!o.json) console.error(`pseolint grow: wrote growth.json, links.csv, retitle.csv, sitemap-additions.txt, unblock.csv to ${o.out}`);
  }
  console.log(o.json ? serializable : formatGrowthReport(report, { limit: o.limit }));
  return 0;
}

export interface IndexNowCommandOptions {
  url: string;
  key: string;
  /** Only URLs whose sitemap <lastmod> is within this many days. */
  sinceDays?: number;
  dryRun?: boolean;
}

export async function runIndexNowCommand(o: IndexNowCommandOptions): Promise<number> {
  const origin = new URL(o.url).origin;
  const host = new URL(origin).hostname;
  const keyFile = await fetch(`${origin}/${o.key}.txt`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (keyFile.trim() !== o.key) {
    console.error(`pseolint indexnow: ${origin}/${o.key}.txt must exist and contain exactly the key. Deploy it first (e.g. public/${o.key}.txt).`);
    return 2;
  }
  const cutoff = o.sinceDays ? Date.now() - o.sinceDays * 86_400_000 : 0;
  const entries = await collectSitemapUrls(origin);
  if (entries.length === 0) {
    console.error(`pseolint indexnow: no sitemap URLs found for ${origin} (robots.txt Sitemap: or /sitemap.xml).`);
    return 2;
  }
  const recent = entries.filter((e) => !cutoff || (e.lastmod && Date.parse(e.lastmod) >= cutoff)).map((e) => e.url);
  // IndexNow requires every URL's host to equal `host`: filter once so dry-run and real run agree.
  const urls = recent.filter((u) => new URL(u).hostname === host);
  if (recent.length > 0 && urls.length === 0) {
    const other = new URL(recent[0]).hostname;
    console.error(`pseolint indexnow: the sitemap lists ${other} URLs, not ${host}. Re-run with https://${other} (and serve the key there).`);
    return 2;
  }
  if (o.dryRun) {
    console.log(`pseolint indexnow: would submit ${urls.length} of ${entries.length} sitemap URLs for ${host}`);
    return 0;
  }
  const r = await submitIndexNow(host, o.key, urls);
  console.log(`pseolint indexnow: submitted ${r.submitted} URLs for ${host} (HTTP ${r.status.join(", ") || "-"}). Bing, Yandex, Seznam and Naver share IndexNow submissions.`);
  return r.status.every((s) => s === 200 || s === 202) ? 0 : 1;
}

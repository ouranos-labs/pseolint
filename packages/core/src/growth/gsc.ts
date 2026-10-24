import type { GscPageRow } from "./analyze.js";

/** GSC's Performance → Export caps the Pages table at 1,000 rows. */
export const GSC_UI_EXPORT_CAP = 1000;

/**
 * Reads Search Console page data. Accepts:
 *  - the "Pages.csv" from GSC's Performance → Export (columns: Top pages, Clicks, Impressions, CTR, Position)
 *  - JSON: `[{ url|page|keys[0], clicks, impressions, position }]` (e.g. a searchanalytics.query dump)
 */
export function parseGscPages(text: string): GscPageRow[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const rows: unknown[] = Array.isArray(data) ? data : (data.rows ?? []);
    return rows.map((r) => {
      const o = r as Record<string, unknown>;
      const url = String(o.url ?? o.page ?? (Array.isArray(o.keys) ? o.keys[0] : ""));
      return { url, clicks: Number(o.clicks ?? 0), impressions: Number(o.impressions ?? 0), position: o.position == null ? undefined : Number(o.position) };
    }).filter((r) => r.url);
  }
  const lines = trimmed.split(/\r?\n/);
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  let iUrl = col(/page|url|address|seite|página|pagina|ページ/);
  let iClicks = col(/cli[cq]k|klick|clic/);
  let iImpr = col(/impres/);
  let iPos = col(/posi/);
  // The UI export's column order is fixed in every locale (page, clicks,
  // impressions, CTR, position): fall back to it when names don't match.
  if ((iUrl < 0 || iClicks < 0 || iImpr < 0) && header.length === 5) [iUrl, iClicks, iImpr, iPos] = [0, 1, 2, 4];
  if (iUrl < 0 || iImpr < 0) throw new Error("GSC CSV needs a page/URL column and an Impressions column");
  return lines.slice(1).filter(Boolean).map((line) => {
    const c = splitCsv(line);
    return {
      url: c[iUrl],
      clicks: iClicks >= 0 ? num(c[iClicks]) : 0,
      impressions: num(c[iImpr]),
      position: iPos >= 0 ? num(c[iPos]) : undefined,
    };
  }).filter((r) => r.url);
}

// "1,200" = thousands separator; "12,5" / "0,25%" = decimal comma (fr/de/es exports).
const num = (s: string | undefined) => {
  const v = (s ?? "").replace(/[%\s\u00a0]/g, "");
  return Number(/^\d+,\d{1,2}$/.test(v) ? v.replace(",", ".") : v.replace(/,/g, "")) || 0;
};

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

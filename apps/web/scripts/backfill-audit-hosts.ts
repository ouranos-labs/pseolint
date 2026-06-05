/**
 * One-shot backfill: populate `audits.host` (and OG fields for public rows
 * that still have NULL there) for every completed audit row.
 *
 * Run once after the schema migration that added `host`:
 *   bun run scripts/backfill-audit-hosts.ts
 *
 * Uses postgres-js directly so it is not bound by the `server-only` guard
 * on the app's normal db/index.ts Drizzle instance.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

// Inline SSRF-free OG fetcher (no server-only dependency)
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 256 * 1024;
const UA = "Mozilla/5.0 (compatible; pseolint-backfill/1.0; +https://pseolint.dev/leaderboard)";

async function fetchOgSimple(url: string): Promise<{ title: string; description: string; image: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return empty();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.byteLength;
    }
    reader.cancel().catch(() => undefined);
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c))).slice(0, MAX_BYTES);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const head = headMatch ? headMatch[1] : html;

    const getMeta = (key: string): string => {
      const m = head.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"))
        || head.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i"));
      return m ? m[1].trim() : "";
    };
    const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const docTitle = titleMatch ? titleMatch[1].trim() : "";

    const rawImage = getMeta("og:image:secure_url") || getMeta("og:image") || getMeta("twitter:image");
    let image = "";
    if (rawImage) {
      try {
        const abs = new URL(rawImage, url).toString();
        if (/^https?:\/\//i.test(abs) && abs.length <= 1000) image = abs;
      } catch { /* ignore */ }
    }

    return {
      title: (getMeta("og:title") || getMeta("twitter:title") || docTitle).slice(0, 200),
      description: (getMeta("og:description") || getMeta("twitter:description") || getMeta("description")).slice(0, 500),
      image: image.slice(0, 1000),
    };
  } catch {
    return empty();
  } finally {
    clearTimeout(timer);
  }
}

function empty() { return { title: "", description: "", image: "" }; }

async function main() {
  const sql = postgres(DATABASE_URL!, { ssl: "require" });
  const db = drizzle(sql, { schema });
  const { audits } = schema;

  console.log("Fetching audits missing host…");
  const rows = await db
    .select({
      id: audits.id,
      slug: audits.slug,
      sourceUrl: audits.sourceUrl,
      isPublic: audits.isPublic,
      ogTitle: audits.ogTitle,
      ogDescription: audits.ogDescription,
      ogImageUrl: audits.ogImageUrl,
    })
    .from(audits)
    .where(and(eq(audits.status, "completed"), isNull(audits.host)));

  console.log(`Found ${rows.length} rows to backfill.`);
  if (rows.length === 0) { await sql.end(); return; }

  let ok = 0, fail = 0;
  for (const r of rows) {
    const host = (() => {
      try { return new URL(r.sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); }
      catch { return "unknown"; }
    })();

    // Only try OG if all three fields are NULL (not already "")
    let { ogTitle, ogDescription, ogImageUrl } = r;
    if (r.isPublic && ogTitle === null && ogDescription === null && ogImageUrl === null) {
      process.stdout.write(`[${r.slug}] ${host} → fetching OG… `);
      const og = await fetchOgSimple(r.sourceUrl);
      ogTitle = og.title;
      ogDescription = og.description;
      ogImageUrl = og.image;
      console.log(og.title ? "✓" : "(no OG)");
    }

    try {
      await db.update(audits).set({ host, ogTitle, ogDescription, ogImageUrl }).where(eq(audits.id, r.id));
      ok++;
    } catch (err: any) {
      console.error(`[${r.slug}] DB update failed: ${err.message}`);
      fail++;
    }
  }

  await sql.end();
  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

import { db } from "@/db";
import { audits } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 600;

export default async function Leaderboard() {
  const rows = await db
    .select({
      id: audits.id, sourceUrl: audits.sourceUrl, score: audits.score,
      pageCount: audits.pageCount, createdAt: audits.createdAt,
    })
    .from(audits)
    .where(and(
      eq(audits.isPublic, true),
      eq(audits.status, "completed"),
      gt(audits.expiresAt, new Date()),
      sql`${audits.pageCount} >= 5`,
    ))
    .orderBy(sql`COALESCE(${audits.score}, 100) ASC`, audits.createdAt)
    .limit(100);

  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    try {
      const h = new URL(r.sourceUrl).hostname.toLowerCase();
      if (seen.has(h)) return false;
      seen.add(h); return true;
    } catch { return false; }
  });

  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-muted-foreground">Lower is better. Sites ranked by SpamBrain risk score (0 = safest).</p>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-3 pr-4 font-medium">#</th>
            <th className="py-3 pr-4 font-medium">Site</th>
            <th className="py-3 pr-4 font-medium">Score</th>
            <th className="py-3 pr-4 font-medium">Pages</th>
          </tr>
        </thead>
        <tbody>
          {deduped.map((r, i) => (
            <tr key={r.id} className="border-b hover:bg-muted/50">
              <td className="py-3 pr-4 font-mono text-muted-foreground">{i + 1}</td>
              <td className="py-3 pr-4">
                <a href={`/r/${r.id}`} className="font-mono text-primary hover:underline">{hostOf(r.sourceUrl)}</a>
              </td>
              <td className="py-3 pr-4 font-mono font-semibold">{r.score ?? "—"}</td>
              <td className="py-3 pr-4 font-mono text-muted-foreground">{r.pageCount ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return "unknown"; }
}

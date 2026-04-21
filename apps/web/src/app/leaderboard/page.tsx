import Link from "next/link";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 600;

export default async function Leaderboard() {
  const rows = await db
    .select({
      id: audits.id,
      sourceUrl: audits.sourceUrl,
      score: audits.score,
      pageCount: audits.pageCount,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .where(
      and(
        eq(audits.isPublic, true),
        eq(audits.status, "completed"),
        gt(audits.expiresAt, new Date()),
        sql`${audits.pageCount} >= 5`,
      ),
    )
    .orderBy(sql`COALESCE(${audits.score}, 100) ASC`, audits.createdAt)
    .limit(100);

  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    try {
      const h = new URL(r.sourceUrl).hostname.toLowerCase();
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    } catch {
      return false;
    }
  });

  return (
    <main className="mx-auto max-w-4xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Leaderboard</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          The cleanest pSEO sites on record.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Lower is safer. Ranked by SpamBrain risk score — one entry per domain.
        </p>
      </div>

      {deduped.length === 0 ? (
        <div className="mt-12 rounded-[28px] border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No public audits yet. Run one to claim #1.
        </div>
      ) : (
        <div className="mt-12 overflow-hidden rounded-[28px] border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pl-5 pr-4 font-medium">#</th>
                <th className="py-3 pr-4 font-medium">Domain</th>
                <th className="py-3 pr-4 font-medium">Score</th>
                <th className="py-3 pr-5 text-right font-medium">Pages</th>
              </tr>
            </thead>
            <tbody>
              {deduped.map((r, i) => {
                const score = r.score ?? 0;
                const tone = scoreTone(score);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-card/60"
                  >
                    <td className="py-3.5 pl-5 pr-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-3.5 pr-4">
                      <Link
                        href={`/r/${r.id}`}
                        className="text-foreground transition-colors hover:text-primary hover:underline"
                      >
                        {hostOf(r.sourceUrl)}
                      </Link>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className={`font-mono font-semibold ${tone}`}>{r.score ?? "—"}</span>
                    </td>
                    <td className="py-3.5 pr-5 text-right text-muted-foreground">
                      {r.pageCount ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <LegendDot className="bg-success" label="0–40 safe" />
        <LegendDot className="bg-warning" label="41–69 watch" />
        <LegendDot className="bg-destructive" label="70+ risky" />
      </div>
    </main>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function scoreTone(score: number) {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

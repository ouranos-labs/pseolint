import Link from "next/link";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function HistoryList({ userId }: { userId: string }) {
  const rows = await db
    .select({
      slug: audits.slug, sourceUrl: audits.sourceUrl, score: audits.score,
      findingCount: audits.findingCount, completedAt: audits.completedAt, status: audits.status,
    })
    .from(audits)
    .where(eq(audits.userId, userId))
    .orderBy(desc(audits.createdAt))
    .limit(30);

  if (!rows.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No audits yet — run your first one above.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 rounded-[22px] border border-border/60">
      {rows.map((r) => (
        <li key={r.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate text-foreground">{r.sourceUrl}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {r.status === "completed" && r.completedAt
                ? new Date(r.completedAt).toISOString().slice(0, 16).replace("T", " ")
                : r.status}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums text-foreground">{r.score ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{r.findingCount ?? 0} findings</span>
            <Link href={`/r/${r.slug}`} className="rounded-[12px] bg-secondary px-3 py-1 text-xs hover:bg-secondary/80">
              View
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

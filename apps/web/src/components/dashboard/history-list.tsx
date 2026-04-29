import Link from "next/link";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { HistoryRowActions } from "./history-row-actions";

type Row = {
  slug: string;
  sourceUrl: string;
  risk: number | null;
  findingCount: number | null;
  completedAt: Date | null;
  createdAt: Date;
  status: "queued" | "running" | "completed" | "failed" | "expired";
};

type Group = {
  host: string;
  rows: Row[];
  completedRows: Row[];
};

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

function groupByHost(rows: Row[]): Group[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const h = hostOf(r.sourceUrl);
    const bucket = map.get(h);
    if (bucket) bucket.push(r);
    else map.set(h, [r]);
  }
  return Array.from(map.entries()).map(([host, rows]) => ({
    host,
    rows,
    completedRows: rows.filter((r) => r.status === "completed" && r.risk != null),
  }));
}

export async function HistoryList({ userId }: { userId: string }) {
  const rows = await db
    .select({
      slug: audits.slug,
      sourceUrl: audits.sourceUrl,
      risk: audits.risk,
      findingCount: audits.findingCount,
      completedAt: audits.completedAt,
      createdAt: audits.createdAt,
      status: audits.status,
    })
    .from(audits)
    .where(eq(audits.userId, userId))
    .orderBy(desc(audits.createdAt))
    .limit(100);

  if (!rows.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No audits yet — run your first one above.
      </div>
    );
  }

  const groups = groupByHost(rows)
    .sort((a, b) => (b.rows[0]?.createdAt.getTime() ?? 0) - (a.rows[0]?.createdAt.getTime() ?? 0));

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => <DomainGroup key={g.host} group={g} />)}
    </div>
  );
}

function DomainGroup({ group }: { group: Group }) {
  const { host, rows, completedRows } = group;
  const latest = completedRows[0] ?? null;
  const prior = completedRows[1] ?? null;
  const delta = latest && prior && latest.risk != null && prior.risk != null
    ? latest.risk - prior.risk
    : null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-border/60 bg-card/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground">{host}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "run" : "runs"}
          </span>
          {latest?.risk != null && (
            <span className="font-mono text-xs tabular-nums text-foreground">
              latest: {latest.risk}
              {delta != null && (
                <span className={delta >= 0 ? " text-destructive" : " text-primary"}>
                  {" "}({delta >= 0 ? "+" : ""}{delta})
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Sparkline values={completedRows.slice(0, 7).map((r) => r.risk!).reverse()} />
          {prior && latest && (
            <Link
              href={`/r/compare?a=${prior.slug}&b=${latest.slug}`}
              className="font-mono text-[11px] text-primary hover:underline"
            >
              compare →
            </Link>
          )}
        </div>
      </header>

      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.slug} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground/80">{r.sourceUrl}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.status === "completed" && r.completedAt
                  ? new Date(r.completedAt).toISOString().slice(0, 16).replace("T", " ")
                  : r.status}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono tabular-nums text-foreground">{r.risk ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{r.findingCount ?? 0} findings</span>
              <Link href={`/r/${r.slug}`} className="rounded-[12px] bg-secondary px-3 py-1 text-xs hover:bg-secondary/80">
                View
              </Link>
              <HistoryRowActions slug={r.slug} sourceUrl={r.sourceUrl} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="font-mono text-[10px] text-muted-foreground">not enough data</span>;
  }
  const w = 80;
  const h = 20;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - (v / 100) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const up = last > first;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
        className={up ? "text-destructive" : "text-primary"}
      />
    </svg>
  );
}

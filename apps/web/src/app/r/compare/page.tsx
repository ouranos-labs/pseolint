import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import type { RuleResult } from "@pseolint/core";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { getOptionalSession } from "@/lib/session";
import { type AnyAuditSummary, isV04Summary } from "@/lib/audit-types";

export const runtime = "nodejs";

type Finding = RuleResult;

function findingKey(f: Finding): string {
  return `${f.ruleId}::${f.pageUrl ?? "__site__"}`;
}

/**
 * Flattens findings out of either a v0.3 (flat `findings` array) or v0.4
 * (`issues` buckets) audit summary. R2 storage holds both eras side by side
 * so /r/compare must tolerate either, like /r/[slug].
 */
function flattenFindings(summary: AnyAuditSummary): Finding[] {
  if (isV04Summary(summary)) {
    return [
      ...summary.issues.blockers,
      ...summary.issues.shouldFix,
      ...summary.issues.informational,
    ];
  }
  return summary.findings;
}

function getRisk(summary: AnyAuditSummary): number {
  return isV04Summary(summary) ? summary.risk : summary.score;
}

type SiteType = { type: string; confidence: number } | null;
function getClassification(summary: AnyAuditSummary): SiteType {
  if (!isV04Summary(summary) || !summary.siteClassification) return null;
  return {
    type: summary.siteClassification.type,
    confidence: summary.siteClassification.confidence,
  };
}

function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");

  const { a, b } = await searchParams;
  if (!a || !b || a === b) notFound();

  const rows = await db
    .select()
    .from(audits)
    .where(and(inArray(audits.slug, [a, b]), eq(audits.userId, session.user.id)));

  if (rows.length !== 2) notFound();

  const left = rows.find((r) => r.slug === a);
  const right = rows.find((r) => r.slug === b);
  if (!left || !right) notFound();
  if (!left.storageKey || !right.storageKey) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-sm text-muted-foreground">One of these audits is not yet complete: try again in a minute.</p>
        <p className="mt-2 text-xs"><Link href="/dashboard" className="text-primary hover:underline">← Back to dashboard</Link></p>
      </main>
    );
  }

  const [leftJson, rightJson] = await Promise.all([
    fetchSummaryJson(summaryKey(left.id)),
    fetchSummaryJson(summaryKey(right.id)),
  ]);
  if (!leftJson || !rightJson) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load one of the audit summaries. Either it expired or is still processing.</p>
      </main>
    );
  }

  const aS = JSON.parse(leftJson) as AnyAuditSummary;
  const bS = JSON.parse(rightJson) as AnyAuditSummary;

  const aMap = new Map(flattenFindings(aS).map((f) => [findingKey(f), f]));
  const bMap = new Map(flattenFindings(bS).map((f) => [findingKey(f), f]));
  const resolved: Finding[] = [];
  const added: Finding[] = [];
  for (const [k, f] of aMap) if (!bMap.has(k)) resolved.push(f);
  for (const [k, f] of bMap) if (!aMap.has(k)) added.push(f);

  const aRisk = getRisk(aS);
  const bRisk = getRisk(bS);
  const scoreDelta = bRisk - aRisk;

  const aClass = getClassification(aS);
  const bClass = getClassification(bS);
  const classChanged = aClass && bClass && aClass.type !== bClass.type;

  // Category-delta strip is only meaningful when both summaries share a shape.
  // Mixed v0.3↔v0.4 comparisons skip the strip: the headline risk delta + the
  // resolved/added finding panels carry the story without it.
  const sameShape = isV04Summary(aS) === isV04Summary(bS);
  type CatDelta = { name: string; before: number; after: number; delta: number };
  let catDelta: CatDelta[] = [];
  if (sameShape) {
    if (isV04Summary(aS) && isV04Summary(bS)) {
      const cats = ["integrity", "discoverability", "citation", "data"] as const;
      catDelta = cats.flatMap((name) => {
        const before = aS.categories[name]?.issues ?? 0;
        const after = bS.categories[name]?.issues ?? 0;
        return after - before === 0 ? [] : [{ name, before, after, delta: after - before }];
      });
    } else if (!isV04Summary(aS) && !isV04Summary(bS)) {
      catDelta = (Object.entries(bS.categoryScores) as [string, number][]).map(([name, bVal]) => {
        const aVal = (aS.categoryScores as unknown as Record<string, number>)[name] ?? 0;
        return { name, before: aVal, after: bVal, delta: bVal - aVal };
      }).filter((c) => c.delta !== 0);
    }
  }

  const host = safeHost(left.sourceUrl);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <span aria-hidden>←</span> Back to dashboard
      </Link>

      <div className="text-xs uppercase tracking-wider text-muted-foreground">Compare runs</div>
      <h1 className="mt-2 text-3xl tracking-tight">{host}</h1>

      {(aClass || bClass) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {aClass && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1">
              <span className="text-muted-foreground/70">Before:</span>
              <span className="font-mono text-foreground">{aClass.type}</span>
              <span className="tabular-nums">{Math.round(aClass.confidence * 100)}%</span>
            </span>
          )}
          {bClass && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1">
              <span className="text-muted-foreground/70">After:</span>
              <span className="font-mono text-foreground">{bClass.type}</span>
              <span className="tabular-nums">{Math.round(bClass.confidence * 100)}%</span>
            </span>
          )}
          {classChanged && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/5 px-2.5 py-1 text-warning">
              Site type reclassified: applicable rule set changed
            </span>
          )}
        </div>
      )}

      <section className="mt-6 grid gap-4 rounded-[22px] border border-border/60 bg-card/40 p-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Before</div>
          <Link href={`/r/${left.slug}`} className="mt-1 block font-mono text-xs text-muted-foreground hover:text-foreground">{left.slug}</Link>
          <div className="mt-1 text-[11px] text-muted-foreground">{left.completedAt ? new Date(left.completedAt).toISOString().slice(0, 16).replace("T", " ") : ""}</div>
          <div className="mt-2 font-mono text-3xl tabular-nums text-foreground">{aRisk}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">delta</div>
          <div className={`mt-1 font-mono text-2xl tabular-nums ${scoreDelta < 0 ? "text-primary" : scoreDelta > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {scoreDelta > 0 ? "+" : ""}{scoreDelta}
          </div>
        </div>
        <div className="text-right sm:text-left">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">After</div>
          <Link href={`/r/${right.slug}`} className="mt-1 block font-mono text-xs text-muted-foreground hover:text-foreground">{right.slug}</Link>
          <div className="mt-1 text-[11px] text-muted-foreground">{right.completedAt ? new Date(right.completedAt).toISOString().slice(0, 16).replace("T", " ") : ""}</div>
          <div className="mt-2 font-mono text-3xl tabular-nums text-foreground">{bRisk}</div>
        </div>
      </section>

      {catDelta.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category deltas</h2>
          <ul className="divide-y divide-border/60 rounded-[22px] border border-border/60 bg-card/40">
            {catDelta.map((c) => (
              <li key={c.name} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="capitalize text-foreground">{c.name}</span>
                <span className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                  <span>{c.before}</span>
                  <span>→</span>
                  <span className="text-foreground">{c.after}</span>
                  <span className={`tabular-nums ${c.delta < 0 ? "text-primary" : "text-destructive"}`}>
                    ({c.delta > 0 ? "+" : ""}{c.delta})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <FindingDeltaPanel title="Resolved" tone="primary" findings={resolved} empty="No findings resolved." />
        <FindingDeltaPanel title="New" tone="destructive" findings={added} empty="No new findings introduced." />
      </section>

      {resolved.length === 0 && added.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">The finding set is identical: score change comes from severity adjustments only.</p>
      )}
    </main>
  );
}

function FindingDeltaPanel({
  title, tone, findings, empty,
}: {
  title: string;
  tone: "primary" | "destructive";
  findings: Finding[];
  empty: string;
}) {
  const headTone = tone === "primary" ? "text-primary" : "text-destructive";
  // Collapse to one entry per ruleId.
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    const b = byRule.get(f.ruleId);
    if (b) b.push(f);
    else byRule.set(f.ruleId, [f]);
  }
  const groups = Array.from(byRule.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <section className="rounded-[22px] border border-border/60 bg-card/40 p-5">
      <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${headTone}`}>
        {title} <span className="font-mono text-muted-foreground">{findings.length}</span>
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map(([ruleId, items]) => (
            <li key={ruleId} className="rounded-[14px] border border-border/60 bg-background/50 p-3 text-sm">
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] text-foreground">{ruleId}</code>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {items.length} {items.length === 1 ? "page" : "pages"}
                </span>
              </div>
              <p className="mt-1 text-foreground">{items[0].message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

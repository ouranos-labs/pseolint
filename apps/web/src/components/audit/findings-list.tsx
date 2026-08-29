import type { AnyAuditSummary, AuditSummaryV03, AuditSummaryV04, RuleResult } from "@/lib/audit-types";
import { isV04Summary } from "@/lib/audit-types";
import { gradeOf as canonicalGradeOf } from "@/lib/grade";
import { formatDate, formatNumber } from "@/lib/format";

type Severity = RuleResult["severity"];

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  error: 50,
  warning: 10,
  info: 1,
};

export function FindingsList({ summary }: { summary: AnyAuditSummary }) {
  if (isV04Summary(summary)) {
    return <FindingsListV04 summary={summary} />;
  }
  return <FindingsListV03 summary={summary} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.4: bucketed by severity-tier (blockers / shouldFix / informational).
// ─────────────────────────────────────────────────────────────────────────────

function FindingsListV04({ summary }: { summary: AuditSummaryV04 }) {
  const { blockers, shouldFix, informational } = summary.issues;
  const total = blockers.length + shouldFix.length + informational.length;

  if (total === 0) {
    return <CleanRunCard />;
  }

  // Top fixes: prioritise blockers, then shouldFix, weighted by severity × pages.
  const allWithBucket = [
    ...blockers.map((f) => ({ f, bucket: "blocker" as const })),
    ...shouldFix.map((f) => ({ f, bucket: "shouldFix" as const })),
  ];
  const groupedAll = groupByRule(allWithBucket.map(({ f }) => f));
  const top = Array.from(groupedAll.values())
    .sort((a, b) => {
      const ia = SEVERITY_WEIGHT[a.representative.severity] * a.findings.length;
      const ib = SEVERITY_WEIGHT[b.representative.severity] * b.findings.length;
      return ib - ia;
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      {top.length > 0 && <TopFixesHero top={top} />}

      {blockers.length > 0 && (
        <BucketSection
          title="Blockers"
          subtitle="Severity error/critical · must fix before shipping"
          tone="destructive"
          findings={blockers}
        />
      )}
      {shouldFix.length > 0 && (
        <BucketSection
          title="Should fix"
          subtitle="Severity warning · should fix before scaling"
          tone="warning"
          findings={shouldFix}
        />
      )}
      {informational.length > 0 && (
        <BucketSection
          title="Informational"
          subtitle="Severity info · tracked for trend analysis"
          tone="muted"
          findings={informational}
        />
      )}
    </div>
  );
}

function BucketSection({
  title,
  subtitle,
  tone,
  findings,
}: {
  title: string;
  subtitle: string;
  tone: "destructive" | "warning" | "muted";
  findings: RuleResult[];
}) {
  const grouped = groupByRule(findings);
  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const sevA = SEVERITY_ORDER.indexOf(a.representative.severity);
    const sevB = SEVERITY_ORDER.indexOf(b.representative.severity);
    if (sevA !== sevB) return sevA - sevB;
    return b.findings.length - a.findings.length;
  });

  const headingTone =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  const dotTone =
    tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-muted-foreground";

  return (
    <section>
      {/* Wraps rather than squeezes: at 390px "Should fix" was being broken
          across two lines to make room for the subtitle on the same row. */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold uppercase tracking-wider ${headingTone}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotTone}`} />
          {title}
          <span className="font-mono text-[11px] font-normal text-muted-foreground">· {findings.length}</span>
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      {/* CSS-columns waterfall. `columnCount: 2` was an unconditional inline
          style, so a 390px phone got two ~170px columns of finding cards with
          full URLs in them. One column until lg, where the container is wide
          enough for two to be readable. */}
      <div className="gap-4 lg:columns-2">
        {sorted.map((group) => (
          <div
            key={group.ruleId}
            className="mb-4 inline-block w-full break-inside-avoid"
          >
            <FindingGroup group={group} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v0.3: legacy flat findings array (preserved for posterity).
// ─────────────────────────────────────────────────────────────────────────────

function FindingsListV03({ summary }: { summary: AuditSummaryV03 }) {
  // `audit/origin-readiness` is rendered above the list by OriginReadinessCard
  //: keeping it here would show the same data twice. Only relevant for v0.3
  // where audit/* findings were mixed into `summary.findings`. v0.4 keeps
  // them in `diagnostics.auditFindings`, never in `summary.issues`.
  const visibleFindings = summary.findings.filter((f) => f.ruleId !== "audit/origin-readiness");
  const grouped = groupByRule(visibleFindings);
  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const sevA = SEVERITY_ORDER.indexOf(a.representative.severity);
    const sevB = SEVERITY_ORDER.indexOf(b.representative.severity);
    if (sevA !== sevB) return sevA - sevB;
    return b.findings.length - a.findings.length;
  });

  if (sorted.length === 0) {
    return <CleanRunCard />;
  }

  const top = sorted
    .slice()
    .sort((a, b) => {
      const ia = SEVERITY_WEIGHT[a.representative.severity] * a.findings.length;
      const ib = SEVERITY_WEIGHT[b.representative.severity] * b.findings.length;
      return ib - ia;
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <TopFixesHero top={top} />
      {/* CSS-columns waterfall. `columnCount: 2` was an unconditional inline
          style, so a 390px phone got two ~170px columns of finding cards with
          full URLs in them. One column until lg, where the container is wide
          enough for two to be readable. */}
      <div className="gap-4 lg:columns-2">
        {sorted.map((group) => (
          <div
            key={group.ruleId}
            className="mb-4 inline-block w-full break-inside-avoid"
          >
            <FindingGroup group={group} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CleanRunCard() {
  return (
    <div className="rounded-[22px] border border-success/30 bg-success/5 p-8 text-center">
      <p className="text-success" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, fontSize: "28px" }}>
        No findings. A clean run.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        All SpamBrain + AEO rules passed on the pages we sampled. Monitor to catch regressions.
      </p>
    </div>
  );
}

function TopFixesHero({ top }: { top: RuleGroup[] }) {
  if (top.length === 0) return null;
  return (
    <section className="rounded-[22px] border border-primary/25 bg-primary/5 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Top fixes by impact</span>
        <span className="font-mono text-[11px] text-muted-foreground">severity × pages affected</span>
      </div>
      <ol className="flex flex-col gap-2">
        {top.map((g, idx) => {
          const sev = g.representative.severity;
          const pages = collectPageUrls(g.findings).length;
          const pagesLabel = pages === 1 ? "1 page" : `${pages || g.findings.length} pages`;
          return (
            <li key={g.ruleId} className="flex gap-3 rounded-[14px] border border-border/50 bg-background/60 p-3 text-sm">
              <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-[11px] font-semibold text-primary">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {g.ruleId}
                  </code>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] ${sevBorderBg(sev)}`}>
                    {sev}
                  </span>
                  {g.representative.effort && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] ${effortTone(g.representative.effort)}`}>
                      {g.representative.effort}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{pagesLabel}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">{g.representative.message}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function sevBorderBg(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (sev === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border/60 bg-card/60 text-muted-foreground";
}

// The engine attaches a `confidence` hint (high|medium|low|speculative) so the
// UI can hedge a finding that's known to false-positive on the audited site
// type. Only render a chip when the engine is hedging (low/speculative): a
// `high` (or omitted, which defaults to high) finding needs no caveat.
function ConfidenceChip({ confidence }: { confidence?: RuleResult["confidence"] }) {
  if (confidence !== "low" && confidence !== "speculative") return null;
  const label = confidence === "speculative" ? "speculative" : "low confidence";
  const title =
    confidence === "speculative"
      ? "Heuristic match: verify before acting."
      : "May be a false positive on your site type.";
  return (
    <span
      className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning"
      title={title}
    >
      {label}
    </span>
  );
}

// `context` carries the engine's richest evidence. Render it compactly: the
// worst near-duplicate pair(s) for cluster findings, the boilerplate ratio for
// contentBreakdown findings.
function ContextEvidence({ context }: { context: NonNullable<RuleResult["context"]> }) {
  if (context.type === "cluster") {
    const worst = context.worstPairs.slice(0, 2);
    return (
      <div className="flex flex-col gap-2 rounded-[14px] border border-border/60 bg-background/40 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Near-duplicate cluster</span>
          <span className="font-mono text-[11px] text-muted-foreground">{context.clusterSize} pages</span>
        </div>
        {worst.length > 0 && (
          <ul className="flex flex-col gap-1 font-mono text-[11px]">
            {worst.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="truncate text-muted-foreground" title={p.left}>{pathOf(p.left)}</span>
                <span className="text-muted-foreground/60">vs</span>
                <span className="truncate text-muted-foreground" title={p.right}>{pathOf(p.right)}</span>
                <span className="ml-auto shrink-0 text-warning">{Math.round(p.similarity * 100)}% similar</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  // contentBreakdown: surface the boilerplate ratio (shared / total words).
  const ratio = context.totalWordCount > 0 ? Math.round((context.sharedWordCount / context.totalWordCount) * 100) : 0;
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-border/60 bg-background/40 p-3 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Boilerplate ratio</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        <span className="text-warning">{ratio}%</span> ({formatNumber(context.sharedWordCount)} of {formatNumber(context.totalWordCount)} words shared)
      </span>
    </div>
  );
}

// On carried-forward findings (monitoring mode skipped re-fetching the page),
// surface staleness so re-verified vs stale findings are distinguishable.
function CarriedForwardBadge({ lastVerifiedAt }: { lastVerifiedAt?: string }) {
  let when = "";
  if (lastVerifiedAt) {
    const d = new Date(lastVerifiedAt);
    if (!Number.isNaN(d.getTime())) when = ` · last verified ${formatDate(d)}`;
  }
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
      title="Not re-fetched this run: carried forward from a prior audit under monitoring mode."
    >
      carried forward{when}
    </span>
  );
}

function FindingGroup({ group }: { group: RuleGroup }) {
  const { ruleId, findings, representative } = group;
  const sev = representative.severity;
  const affected = collectPageUrls(findings);
  // v0.4 enriches findings with `docsUrl` (the marketing-page deeplink); v0.3
  // only had `ref` (the upstream Google docs URL). Render whichever is present
  //: the new "Read more" link is preferred when both exist.
  const docsHref = representative.docsUrl ?? null;
  const refHref = representative.ref ?? null;

  return (
    <article className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border/60 px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${sevText(sev)}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(sev)}`} />
          {SEVERITY_LABEL[sev]}
        </span>
        <ConfidenceChip confidence={representative.confidence} />
        <span className="font-mono text-xs text-muted-foreground">{ruleId}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {findings.length} {findings.length === 1 ? "finding" : "findings"}
        </span>
      </header>

      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="text-sm text-foreground">{representative.message}</p>
        {representative.context && <ContextEvidence context={representative.context} />}
        {representative.carriedForward && (
          <CarriedForwardBadge lastVerifiedAt={representative.lastVerifiedAt} />
        )}
        {representative.pageUrl && (
          <a
            href={representative.pageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
            title={representative.pageUrl}
          >
            ↗ {pathOf(representative.pageUrl)}
          </a>
        )}

        {representative.fix && (
          <div className="flex flex-col gap-1.5 rounded-[14px] border border-primary/25 bg-primary/5 p-3 text-sm">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary/80">Fix</span>
            <p className="text-foreground">{representative.fix}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {representative.effort && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono ${effortTone(representative.effort)}`}>
              {representative.effort}
            </span>
          )}
          {docsHref && (
            <a
              href={docsHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              ↗ Read more
            </a>
          )}
          {refHref && (
            <a
              href={refHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              ↗ Google docs
            </a>
          )}
          {affected.length > 0 && (
            <span>
              {affected.length} {affected.length === 1 ? "page" : "pages"} affected
            </span>
          )}
        </div>

        {affected.length > 0 && <AffectedPages urls={affected} />}
      </div>
    </article>
  );
}

function AffectedPages({ urls }: { urls: string[] }) {
  const MAX = 8;
  const shown = urls.slice(0, MAX);
  const rest = urls.length - shown.length;
  return (
    <details className="group rounded-[12px] border border-border/60 bg-background/40">
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <span>Affected pages</span>
        <span className="font-mono">{urls.length}</span>
      </summary>
      <ul className="flex flex-col gap-1 border-t border-border/60 px-3 py-2 font-mono text-[11px]">
        {shown.map((u) => (
          <li key={u} className="truncate">
            <a
              href={u}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground hover:text-foreground"
              title={u}
            >
              {pathOf(u)}
            </a>
          </li>
        ))}
        {rest > 0 && (
          <li className="text-muted-foreground/70">… and {rest} more</li>
        )}
      </ul>
    </details>
  );
}

/**
 * Category breakdown: shape-aware.
 * - v0.4: 4 letter-graded tiles (Integrity, Discoverability, Citation, Data)
 * - v0.3: legacy 8-category numeric risk breakdown
 */
export function CategoryBreakdown({ summary }: { summary: AnyAuditSummary }) {
  if (isV04Summary(summary)) {
    return <CategoryBreakdownV04 summary={summary} />;
  }
  return <CategoryBreakdownV03 summary={summary} />;
}

function CategoryBreakdownV04({ summary }: { summary: AuditSummaryV04 }) {
  // Show only the 4 weighted categories. `audit` is engine-internal (weight 0).
  const order: Array<{ key: "integrity" | "discoverability" | "citation" | "data"; label: string }> = [
    { key: "integrity", label: "Integrity" },
    { key: "discoverability", label: "Discoverability" },
    { key: "citation", label: "Citation" },
    { key: "data", label: "Data" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {order.map(({ key, label }) => {
        const cat = summary.categories[key];
        if (!cat) return null;
        const tone = gradeTone(cat.grade);
        const bg = gradeBg(cat.grade);
        return (
          <div key={key} className="rounded-[18px] border border-border/60 bg-card/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className={`font-mono text-3xl tabular-nums ${tone}`}>{cat.grade}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {cat.issues} {cat.issues === 1 ? "issue" : "issues"}
              </div>
            </div>
            <div className={`mt-3 h-1 rounded-full ${bg}`} />
          </div>
        );
      })}
    </div>
  );
}

function CategoryBreakdownV03({ summary }: { summary: AuditSummaryV03 }) {
  const entries = Object.entries(summary.categoryScores) as [string, number][];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {entries.map(([name, score]) => {
        const clean = Math.max(0, Math.min(100, 100 - score));
        return (
          <div key={name} className="rounded-[18px] border border-border/60 bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{name}</div>
            <div className={`mt-0.5 font-mono text-xl tabular-nums ${scoreTone(score)}`}>{score}</div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60"
              title={`${clean}% clean · ${score}/100 risk`}
            >
              <div
                className={`h-full ${scoreBg(score)}`}
                style={{ width: `${clean}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type RuleGroup = {
  ruleId: string;
  findings: RuleResult[];
  representative: RuleResult;
};

function groupByRule(findings: RuleResult[]): Map<string, RuleGroup> {
  const out = new Map<string, RuleGroup>();
  for (const f of findings) {
    const existing = out.get(f.ruleId);
    if (existing) {
      existing.findings.push(f);
      if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(existing.representative.severity)) {
        existing.representative = f;
      }
    } else {
      out.set(f.ruleId, { ruleId: f.ruleId, findings: [f], representative: f });
    }
  }
  return out;
}

function collectPageUrls(findings: RuleResult[]): string[] {
  const set = new Set<string>();
  for (const f of findings) {
    if (f.pageUrl) set.add(f.pageUrl);
    for (const u of f.relatedUrls ?? []) set.add(u);
  }
  return Array.from(set);
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "/" : u.pathname;
    return `${u.host}${p}${u.search}`;
  } catch {
    return url;
  }
}

function sevText(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "text-destructive";
  if (sev === "warning") return "text-warning";
  return "text-warning/60";
}

function sevDot(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "bg-destructive";
  if (sev === "warning") return "bg-warning";
  return "bg-warning/60";
}

function effortTone(effort: string): string {
  if (effort === "quick") return "border-success/40 text-success";
  if (effort === "moderate") return "border-warning/40 text-warning";
  if (effort === "structural") return "border-destructive/40 text-destructive";
  return "border-border text-muted-foreground";
}

// v0.3 category scores are a risk model (lower is safer), so the canonical
// 5-band system applies: keeps the colour vocabulary consistent with v0.4.
function scoreTone(score: number): string {
  return canonicalGradeOf(score).text;
}

function scoreBg(score: number): string {
  return canonicalGradeOf(score).dot;
}

function gradeTone(grade: string): string {
  if (grade === "A" || grade === "B") return "text-success";
  if (grade === "C") return "text-warning";
  if (grade === "D") return "text-warning";
  return "text-destructive"; // F + anything else
}

function gradeBg(grade: string): string {
  if (grade === "A" || grade === "B") return "bg-success/60";
  if (grade === "C") return "bg-warning/60";
  if (grade === "D") return "bg-warning/80";
  return "bg-destructive/80";
}

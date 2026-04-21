import type { AuditSummary } from "@pseolint/core";

type RuleResult = AuditSummary["findings"][number];
type Severity = RuleResult["severity"];

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export function FindingsList({ summary }: { summary: AuditSummary }) {
  const grouped = groupByRule(summary.findings);
  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const sevA = SEVERITY_ORDER.indexOf(a.representative.severity);
    const sevB = SEVERITY_ORDER.indexOf(b.representative.severity);
    if (sevA !== sevB) return sevA - sevB;
    return b.findings.length - a.findings.length;
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-[22px] border border-success/30 bg-success/5 p-8 text-center">
        <p className="text-success" style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, fontSize: "28px" }}>
          No findings. A clean run.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          All 35 SpamBrain rules passed on the pages we sampled. Monitor to catch regressions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((group) => (
        <FindingGroup key={group.ruleId} group={group} />
      ))}
    </div>
  );
}

function FindingGroup({ group }: { group: RuleGroup }) {
  const { ruleId, findings, representative } = group;
  const sev = representative.severity;
  const affected = collectPageUrls(findings);

  return (
    <article className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border/60 px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${sevText(sev)}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(sev)}`} />
          {SEVERITY_LABEL[sev]}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{ruleId}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {findings.length} {findings.length === 1 ? "finding" : "findings"}
        </span>
      </header>

      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="text-sm text-foreground">{representative.message}</p>

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
          {representative.ref && (
            <a
              href={representative.ref}
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

export function CategoryBreakdown({ summary }: { summary: AuditSummary }) {
  const entries = Object.entries(summary.categoryScores) as [string, number][];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {entries.map(([name, score]) => (
        <div key={name} className="rounded-[18px] border border-border/60 bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{name}</div>
          <div className={`mt-0.5 font-mono text-xl tabular-nums ${scoreTone(score)}`}>{score}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
            <div
              className={`h-full ${scoreBg(score)}`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
      ))}
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

function scoreTone(score: number): string {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function scoreBg(score: number): string {
  if (score <= 40) return "bg-success";
  if (score <= 69) return "bg-warning";
  return "bg-destructive";
}

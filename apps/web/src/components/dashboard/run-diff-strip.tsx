import { sevDot, sevBorderBg, type Severity } from "@/lib/severity-style";

interface NewFinding {
  ruleId: string;
  severity: Severity;
  templateSignature: string;
}

interface RecoveredFinding {
  ruleId: string;
  severity: Severity;
  templateSignature: string;
  lastSeenAt: Date;
  representativeUrl: string | null;
  affectedPageCount: number;
}

interface RunDiffStripProps {
  /** Findings whose firstSeenAt >= previousAudit.completedAt — first appeared in the latest run. */
  newFindings: NewFinding[];
  /** Open findings that were present in the prior run but didn't reappear in this run. */
  recoveredCount: number;
  /** Up-to-N recovered rows for the drawer. May be shorter than recoveredCount when capped. */
  recoveredFindings?: RecoveredFinding[];
  /** Date stamps so the user can read what window we're comparing. */
  latestAt: Date;
  previousAt: Date | null;
}

const SEV_RANK: Record<Severity, number> = { critical: 0, error: 1, warning: 2, info: 3 };

/**
 * "What changed since last run" strip — sits above the findings panel.
 *
 * The point of monitoring is to notice things on the user's behalf. If the
 * dashboard renders the same numbers every visit, the user can't tell whether
 * the tool is doing anything. This strip is the answer to "what did pSEOLint
 * notice between Tuesday and today?" and is the most concrete monitoring-
 * value signal we surface.
 */
export function RunDiffStrip({ newFindings, recoveredCount, recoveredFindings = [], latestAt, previousAt }: RunDiffStripProps) {
  if (!previousAt) {
    return (
      <section className="rounded-[18px] border border-border/60 bg-card/40 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          What changed
        </p>
        <p className="mt-1 text-sm text-foreground">First completed run — diff will appear after the next audit.</p>
      </section>
    );
  }

  const newCount = newFindings.length;
  const sevCounts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const f of newFindings) sevCounts[f.severity] += 1;

  const ruleCounts = new Map<string, number>();
  for (const f of newFindings) ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  const topRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (newCount === 0 && recoveredCount === 0) {
    return (
      <section className="rounded-[18px] border border-border/60 bg-card/40 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          What changed since {formatDate(previousAt)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No new findings, no recoveries — your sites are holding steady.
        </p>
      </section>
    );
  }

  // Tone the strip so the user can read the gestalt before reading the words.
  // Net regression (more new than recovered) → warning; net improvement → success;
  // pure churn → muted info tone.
  const tone =
    newCount > recoveredCount
      ? "border-warning/40 bg-warning/5"
      : recoveredCount > newCount
      ? "border-success/30 bg-success/5"
      : "border-primary/25 bg-primary/5";

  return (
    <section className={`rounded-[18px] border ${tone} px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          What changed · {formatDate(previousAt)} → {formatDate(latestAt)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        {newCount > 0 && (
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="font-mono text-lg tabular-nums text-warning">+{newCount}</span>
            <span className="text-muted-foreground">new finding{newCount === 1 ? "" : "s"}</span>
          </span>
        )}
        {recoveredCount > 0 && (
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className="font-mono text-lg tabular-nums text-success">−{recoveredCount}</span>
            <span className="text-muted-foreground">recovered</span>
          </span>
        )}
      </div>

      {newCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["critical", "error", "warning", "info"] as Severity[]).map((sev) => sevCounts[sev] > 0 && (
            <span
              key={sev}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sevBorderBg(sev)}`}
            >
              <span className={`inline-block h-1 w-1 rounded-full ${sevDot(sev)}`} />
              {sev}
              <span className="tabular-nums">{sevCounts[sev]}</span>
            </span>
          ))}
        </div>
      )}

      {topRules.length > 0 && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          Mostly:{" "}
          {topRules.map(([ruleId, n], i) => (
            <span key={ruleId}>
              {i > 0 && " · "}
              <code className="text-foreground">{ruleId}</code>
              <span className="text-muted-foreground"> ({n})</span>
            </span>
          ))}
        </p>
      )}

      {recoveredCount > 0 && recoveredFindings.length > 0 && (
        <RecoveredDrawer
          recoveredCount={recoveredCount}
          recoveredFindings={recoveredFindings}
        />
      )}
    </section>
  );
}

/**
 * Recovered findings drawer — closes the loop on the "−N recovered" chip.
 *
 * The strip's count says *that* something was verified gone; the drawer says
 * *what*. Without this, "−2 recovered" is a number without a referent — the
 * user can't tell whether their fix worked or whether some unrelated rule
 * stopped firing. Pro is monitoring; monitoring is only legible when the
 * artifact of the verification is visible.
 */
function RecoveredDrawer({
  recoveredCount,
  recoveredFindings,
}: {
  recoveredCount: number;
  recoveredFindings: RecoveredFinding[];
}) {
  const sorted = [...recoveredFindings].sort(
    (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity],
  );
  const overflow = recoveredCount - recoveredFindings.length;

  return (
    <details className="group mt-3 rounded-[12px] border border-success/25 bg-success/[0.04] open:bg-success/[0.07]">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-success">
            Verified gone
          </span>
          <span className="text-muted-foreground">
            See {recoveredCount === 1 ? "the finding" : `the ${recoveredCount} findings`} pSEOLint confirmed fixed
          </span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-success/15 px-3 py-3">
        <ul className="flex flex-col gap-1.5">
          {sorted.map((r, i) => <RecoveredRow key={`${r.ruleId}-${r.templateSignature}-${i}`} r={r} />)}
        </ul>
        {overflow > 0 && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            + {overflow} more recovered finding{overflow === 1 ? "" : "s"} this run
          </p>
        )}
      </div>
    </details>
  );
}

function RecoveredRow({ r }: { r: RecoveredFinding }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[10px] border border-border/40 bg-card/30 px-2.5 py-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${sevBorderBg(r.severity)}`}
      >
        <span className={`inline-block h-1 w-1 rounded-full ${sevDot(r.severity)}`} />
        {r.severity}
      </span>
      <code className="rounded border border-border/50 bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
        {r.ruleId}
      </code>
      <span className="truncate font-mono text-[10px] text-muted-foreground" title={r.templateSignature}>
        {r.templateSignature}
      </span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">
        last seen {relDays(r.lastSeenAt)}
      </span>
    </li>
  );
}

function relDays(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


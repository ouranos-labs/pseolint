import type { AuditSummaryV04 } from "@/lib/audit-types";
import type { MarketingTool } from "@/lib/marketing-tools";

type Finding = AuditSummaryV04["issues"]["blockers"][number];

/** Glob-match a rule ID against a tool's ruleLens ("spam/*" or "spam/thin-content"). */
function matchesLens(ruleId: string, lens: string): boolean {
  return lens.endsWith("/*") ? ruleId.startsWith(lens.slice(0, -1)) : ruleId === lens;
}

function sevTone(sev: Finding["severity"]): string {
  if (sev === "critical" || sev === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (sev === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border/60 bg-card/60 text-muted-foreground";
}

/**
 * Focused-lens result for a /tools/[slug] audit. The audit ran the FULL rule
 * set; this card surfaces only the tool's `ruleLens` so the page delivers its
 * "we scan for {lens}" promise honestly, then funnels to the complete report
 * below (the data-driven "we found N more across the other rules" CTA). Rendered
 * only when the audit was created from a tool entry point.
 */
export function FocusedLensCard({ tool, summary }: { tool: MarketingTool; summary: AuditSummaryV04 }) {
  const all: Finding[] = [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
  const lens = all.filter((f) => matchesLens(f.ruleId, tool.ruleLens));
  const otherCount = all.length - lens.length;

  return (
    <section
      aria-label={`${tool.title}: focused result`}
      className="mt-6 rounded-[22px] border border-primary/25 bg-primary/5 p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Focused result
          <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{tool.ruleLens}</span>
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">{tool.primaryKeyword}</span>
      </div>

      {lens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No <span className="font-mono text-foreground">{tool.ruleLens}</span> issues found; this site is
          clean on the {tool.title.toLowerCase()} lens.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lens.map((f, i) => (
            <li
              key={`${f.ruleId}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border/50 bg-background/60 p-3 text-sm"
            >
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] ${sevTone(f.severity)}`}>
                {f.severity}
              </span>
              <code className="font-mono text-[11px] text-muted-foreground">{f.ruleId}</code>
              <span className="min-w-0 flex-1 text-foreground/90">{f.message}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Funnel: the audit ran the full rule set, so this number is real. */}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        We ran the <span className="text-foreground">full pSEO audit</span>, not just this lens: {" "}
        {otherCount > 0 ? (
          <>
            it flagged <span className="font-semibold text-foreground">{otherCount} more issue{otherCount === 1 ? "" : "s"}</span> across the
            other rules.{" "}
          </>
        ) : (
          <>no other issues across the remaining rules. </>
        )}
        <a href="#findings" className="font-medium text-primary underline decoration-dotted underline-offset-2">
          See the complete report ↓
        </a>
      </p>
    </section>
  );
}

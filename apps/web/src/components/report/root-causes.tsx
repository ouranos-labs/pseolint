import type { Severity, TriageResult } from "@pseolint/core";
import { GenerateFixesButton } from "./generate-fixes-button";

/**
 * AI triage root-causes: the "what to fix first" summary.
 *
 * The engine's triage pass (Pro audits) clusters the raw findings into a small
 * set of root causes and assigns each a `fixOrder`. We render them as a ranked
 * "Fix these first" list so the operator gets the prioritised plan before the
 * detailed per-rule findings below.
 *
 * Severity chip styling mirrors the findings list (see `sevBorderBg` in
 * `findings-list.tsx`) so the colour vocabulary stays consistent across the
 * report. Rendered nowhere unless `triage.rootCauses` is non-empty: the
 * caller gates on that.
 */
export function RootCauses({
  triage,
  generateFixes,
}: {
  triage: TriageResult;
  generateFixes?: { domain: string };
}) {
  const ranked = [...triage.rootCauses].sort((a, b) => a.fixOrder - b.fixOrder);
  if (ranked.length === 0) return null;

  const archetypeLabel = triage.archetype ? triage.archetype.replace(/-/g, " ") : null;

  // Brief handed to the orchestrator: the inferred site archetype (so the run
  // is strategy-aware too), then the narrative, then the ranked root causes.
  const brief = [
    triage.archetype ? `Site archetype: ${triage.archetype}${triage.archetypeRationale ? `, ${triage.archetypeRationale}` : ""}` : null,
    triage.narrative,
    ...ranked.map((rc, i) => `${i + 1}. ${rc.label}, rules: ${rc.affectedRuleIds.join(", ")}`),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section
      aria-label="Fix these first"
      className="mt-6 rounded-[22px] border border-primary/25 bg-primary/5 p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground">
          Fix these first
          <span className="font-mono text-[11px] font-normal text-muted-foreground">
            · {ranked.length} root cause{ranked.length === 1 ? "" : "s"}
          </span>
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">AI triage</span>
      </div>

      {archetypeLabel && (
        <div className="mb-3 flex items-baseline gap-2 text-xs">
          <span className="text-muted-foreground">Strategy:</span>
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono capitalize text-primary">
            {archetypeLabel}
          </span>
          {triage.archetypeRationale && (
            <span className="text-muted-foreground/80">{triage.archetypeRationale}</span>
          )}
        </div>
      )}

      {triage.narrative && (
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {triage.narrative}
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {ranked.map((rc, idx) => (
          <li
            key={`${rc.label}-${rc.fixOrder}`}
            className="flex gap-3 rounded-[14px] border border-border/50 bg-background/60 p-3 text-sm"
          >
            <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-[11px] font-semibold text-primary">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{rc.label}</span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] ${sevBorderBg(rc.severity)}`}
                >
                  {rc.severity}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  affects {rc.findingsCount} finding{rc.findingsCount === 1 ? "" : "s"}
                </span>
              </div>
              {rc.affectedRuleIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rc.affectedRuleIds.map((id) => (
                    <code
                      key={id}
                      className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {id}
                    </code>
                  ))}
                </div>
              )}
              {rc.rationale && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{rc.rationale}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {generateFixes && <GenerateFixesButton domain={generateFixes.domain} brief={brief} />}
    </section>
  );
}

// Mirrors `sevBorderBg` in findings-list.tsx so the severity colour vocabulary
// stays consistent across the report surface.
function sevBorderBg(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (sev === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border/60 bg-card/60 text-muted-foreground";
}

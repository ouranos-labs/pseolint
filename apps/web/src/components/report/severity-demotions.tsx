import type { AuditSummary } from "@pseolint/core";

/**
 * "Rules the profile softened" disclosure — a credibility signal.
 *
 * The engine remaps some rules' severity based on the detected site type
 * (e.g. `aeo/citable-facts` demoted from `error` to `info` on a
 * `programmatic-directory` site) and records the affected rule IDs in
 * `summary.appliedSeverityDemotions`. Surfacing them lets the operator see the
 * engine's reasoning rather than wondering whether the score was gamed.
 *
 * Renders nothing when the array is empty or absent. Styling mirrors the
 * report's other disclosures (RootCauses card / mono rule-id chips in
 * `root-causes.tsx`).
 */
export function SeverityDemotions({ summary }: { summary: AuditSummary }) {
  const demoted = summary.appliedSeverityDemotions ?? [];
  if (demoted.length === 0) return null;

  const profile = summary.siteClassification?.type;

  return (
    <details className="mt-6 rounded-[22px] border border-border/60 bg-card/40 p-5 text-sm">
      <summary className="cursor-pointer list-none font-medium text-foreground marker:hidden">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Severity adjustments
        </span>
        <span className="ml-2">
          {demoted.length} rule{demoted.length === 1 ? "" : "s"} softened
          {profile ? (
            <>
              {" "}by the <span className="font-mono">{profile}</span> profile
            </>
          ) : (
            " by the active scoring profile"
          )}
        </span>
      </summary>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        These rules still ran and emitted findings — the site-type profile lowered
        their severity so the score reflects how the signal applies to this kind of
        site, not a one-size-fits-all penalty.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {demoted.map((id) => (
          <code
            key={id}
            className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {id}
          </code>
        ))}
      </div>
    </details>
  );
}

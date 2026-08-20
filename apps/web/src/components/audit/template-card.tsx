"use client";
import type { Template, Verdict } from "@pseolint/core";

export interface TemplateCardProps {
  template: Template;
  /**
   * Deprecated/unused: coverage is read off `template.totalDiscoveredUrls`
   * (the correct per-cluster discovered count) rather than this prop, which
   * callers historically set to the sampled page count. Kept optional so
   * existing call sites compile while the prop is dropped.
   */
  totalDiscoveredUrls?: number;
  /** Called with the template signature when the card is clicked. */
  onDrillDown?: (signature: string) => void;
  /** Whether this template is the currently selected drill-down target. */
  selected?: boolean;
}

/**
 * Engine verdict → letter + chip styling. Renders the canonical per-template
 * `verdict` the engine assigned instead of re-deriving a grade from `risk`
 * (which can disagree with the verdict). Letters map verdict→A/B/C/F so the
 * chip stays compact; the full verdict word is in the title + aria-label.
 */
const VERDICT_STYLE: Record<
  Verdict,
  { letter: string; bg: string; text: string }
> = {
  ready: { letter: "A", bg: "bg-success/15", text: "text-success" },
  caution: { letter: "B", bg: "bg-warning/10", text: "text-warning" },
  concerning: { letter: "C", bg: "bg-warning/20", text: "text-warning" },
  critical: { letter: "F", bg: "bg-destructive/15", text: "text-destructive" },
};

/** Uniformity bar colour: ≥0.7 green, ≥0.4 yellow, red below. */
function uniformityColor(score: number): string {
  if (score >= 0.7) return "bg-success";
  if (score >= 0.4) return "bg-warning";
  return "bg-destructive";
}

/** "8/10 samples fail spam/thin-content" */
function topDriverLine(template: Template): string | null {
  const td = template.variance.topDriver;
  if (!td) return null;
  const fired = Math.round(td.fireRate * template.auditedUrls.length);
  const total = template.auditedUrls.length;
  return `${fired}/${total} samples fail ${td.ruleId}`;
}

/**
 * "234 / 8 200 URLs (2.9%)": share of all discovered URLs this cluster
 * represents. Denominator is the per-cluster `totalDiscoveredUrls` off the
 * template itself (what the CLI formatter uses), never the sampled page count.
 */
function coverageLine(template: Template): string {
  const denom =
    template.totalDiscoveredUrls > 0
      ? template.totalDiscoveredUrls
      : template.totalUrls;
  const pct = denom > 0 ? ((template.totalUrls / denom) * 100).toFixed(1) : "; ";
  return `${template.totalUrls.toLocaleString()} / ${denom.toLocaleString()} URLs (${pct}%)`;
}

/** "12 / 234 sampled"; how many of the cluster's URLs were actually audited. */
function sampledLine(template: Template): string {
  return `${template.auditedUrls.length.toLocaleString()} / ${template.totalUrls.toLocaleString()} sampled`;
}

export function TemplateCard({
  template,
  onDrillDown,
  selected = false,
}: TemplateCardProps) {
  const verdict = VERDICT_STYLE[template.verdict];
  const driver = topDriverLine(template);
  const coverage = coverageLine(template);
  const sampled = sampledLine(template);
  const uniformityScore = template.variance.uniformityScore;
  const uniformityPct = Math.round(uniformityScore * 100);

  return (
    <button
      type="button"
      onClick={() => onDrillDown?.(template.signature)}
      className={[
        "w-full rounded-[18px] border bg-card/40 px-5 py-4 text-left transition-colors",
        selected
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 hover:border-border hover:bg-card/60",
      ].join(" ")}
      aria-pressed={selected}
      aria-label={`Template ${template.signature}: ${template.verdict}`}
    >
      {/* Header row: signature + verdict chip */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="font-mono text-sm font-semibold text-foreground truncate"
          title={template.signature}
        >
          {template.signature}
        </span>
        <span
          className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold ${verdict.bg} ${verdict.text}`}
          title={`${template.verdict} · risk ${template.risk}`}
        >
          {verdict.letter}
        </span>
      </div>

      {/* Top driver line */}
      {driver && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {driver}
        </p>
      )}

      {/* Coverage stat + sampling depth */}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
        {coverage}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/60 tabular-nums">
        {sampled}
      </p>

      {/* Uniformity bar */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 flex-shrink-0">
          Uniformity
        </span>
        <div className="relative flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${uniformityColor(uniformityScore)}`}
            style={{ width: `${uniformityPct}%` }}
            aria-label={`Uniformity ${uniformityPct}%`}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-7 text-right">
          {uniformityPct}%
        </span>
      </div>
    </button>
  );
}

export interface TemplateGridProps {
  templates: Template[];
  /**
   * Deprecated/unused: per-cluster coverage is read off
   * `template.totalDiscoveredUrls` inside each card. Kept optional so existing
   * call sites compile while the prop is dropped.
   */
  totalDiscoveredUrls?: number;
  onDrillDown?: (signature: string) => void;
  selectedSignature?: string | null;
}

export function TemplateGrid({
  templates,
  onDrillDown,
  selectedSignature,
}: TemplateGridProps) {
  return (
    <section aria-label="Template breakdown">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Templates · {templates.length} detected
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.signature}
            template={t}
            onDrillDown={onDrillDown}
            selected={selectedSignature === t.signature}
          />
        ))}
      </div>
    </section>
  );
}

"use client";
import type { Template } from "@pseolint/core";
import { gradeOf } from "@/lib/grade";

export interface TemplateCardProps {
  template: Template;
  totalDiscoveredUrls: number;
  /** Called with the template signature when the card is clicked. */
  onDrillDown?: (signature: string) => void;
  /** Whether this template is the currently selected drill-down target. */
  selected?: boolean;
}

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

/** "234 / 8 200 URLs (2.9%)" */
function coverageLine(template: Template, totalDiscoveredUrls: number): string {
  const pct =
    totalDiscoveredUrls > 0
      ? ((template.totalUrls / totalDiscoveredUrls) * 100).toFixed(1)
      : "—";
  return `${template.totalUrls.toLocaleString()} / ${totalDiscoveredUrls.toLocaleString()} URLs (${pct}%)`;
}

export function TemplateCard({
  template,
  totalDiscoveredUrls,
  onDrillDown,
  selected = false,
}: TemplateCardProps) {
  const grade = gradeOf(template.risk);
  const driver = topDriverLine(template);
  const coverage = coverageLine(template, totalDiscoveredUrls);
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
      aria-label={`Template ${template.signature} — ${grade.band}`}
    >
      {/* Header row: signature + grade chip */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-semibold text-foreground truncate">
          {template.signature}
        </span>
        <span
          className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold ${grade.bg} ${grade.text}`}
          title={`Grade ${grade.letter} · ${grade.band} · risk ${template.risk}`}
        >
          {grade.letter}
        </span>
      </div>

      {/* Top driver line */}
      {driver && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {driver}
        </p>
      )}

      {/* Coverage stat */}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground/80 tabular-nums">
        {coverage}
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
  totalDiscoveredUrls: number;
  onDrillDown?: (signature: string) => void;
  selectedSignature?: string | null;
}

export function TemplateGrid({
  templates,
  totalDiscoveredUrls,
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
            totalDiscoveredUrls={totalDiscoveredUrls}
            onDrillDown={onDrillDown}
            selected={selectedSignature === t.signature}
          />
        ))}
      </div>
    </section>
  );
}

import { scoreTone } from "@/lib/grade";
import { formatShortDate } from "@/lib/format";

interface TrendPoint {
  /** Risk score for the run (0–100, lower is safer). Null for non-completed runs (skipped). */
  risk: number | null;
  completedAt: Date | null;
  status: string;
}

interface RiskTrendChartProps {
  runs: TrendPoint[];
  /**
   * Alert threshold: the run-to-run risk RISE (delta) that trips an alert.
   * Marks the runs that breached it: it is NOT an absolute score level.
   */
  alertThreshold?: number | null;
}

const W = 800;
const H = 160;
const PAD_X = 36;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_T - PAD_B;
/** Risk axis is fixed 0–100 so the eye sees absolute level, not relative bumps. */
const Y_MAX = 100;

/**
 * Risk-score area chart: 30/90 day trend on the per-host page.
 *
 * Pro is "monitoring," but a single risk number tells the user nothing about
 * direction. This is the headline answer to "is my site getting better or
 * worse?": the question monitoring exists to answer.
 *
 * Pure SVG so we don't take a chart-lib dep for one chart. The tradeoff is
 * fewer features (no zoom, no crosshair) but the visual is exactly what we want.
 */
export function RiskTrendChart({ runs, alertThreshold }: RiskTrendChartProps) {
  const completed = runs
    .filter((r) => r.status === "completed" && r.risk != null && r.completedAt != null)
    .map((r) => ({ risk: r.risk!, t: r.completedAt!.getTime() }))
    .sort((a, b) => a.t - b.t);

  if (completed.length < 2) {
    return (
      <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
        <Header runs={runs.length} latest={null} delta={null} />
        <p className="mt-3 rounded-[12px] border border-dashed border-border/60 bg-background/40 p-4 text-center text-xs text-muted-foreground">
          Two completed runs needed to chart a trend. Check back after tomorrow's audit.
        </p>
      </section>
    );
  }

  const tMin = completed[0].t;
  const tMax = completed[completed.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);

  const x = (t: number) => PAD_X + ((t - tMin) / tSpan) * PLOT_W;
  const y = (r: number) => PAD_T + (1 - Math.min(Y_MAX, Math.max(0, r)) / Y_MAX) * PLOT_H;

  const linePath = completed
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(2)} ${y(p.risk).toFixed(2)}`)
    .join(" ");
  const areaPath =
    `M ${x(completed[0].t).toFixed(2)} ${(PAD_T + PLOT_H).toFixed(2)} ` +
    completed.map((p) => `L ${x(p.t).toFixed(2)} ${y(p.risk).toFixed(2)}`).join(" ") +
    ` L ${x(completed[completed.length - 1].t).toFixed(2)} ${(PAD_T + PLOT_H).toFixed(2)} Z`;

  const latest = completed[completed.length - 1];
  const previous = completed[completed.length - 2];
  const delta = latest.risk - previous.risk;

  // Dot tone: latest run's score band (mirrors the big risk number on the hero).
  const latestTone = scoreFill(latest.risk);

  // The threshold is a run-to-run RISE delta, not an absolute level. Mark the
  // transitions where risk rose by >= threshold; those tripped the risk-rise
  // alert. (New error/critical findings also fire alerts; this chart only knows
  // scores, so it shows the risk-rise part.)
  const th = typeof alertThreshold === "number" && alertThreshold > 0 ? alertThreshold : null;
  const breachIdx = new Set<number>();
  if (th != null) {
    for (let i = 1; i < completed.length; i += 1) {
      if (completed[i].risk - completed[i - 1].risk >= th) breachIdx.add(i);
    }
  }

  return (
    <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
      <Header runs={runs.length} latest={latest.risk} delta={delta} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Risk score trend over time"
      >
        <defs>
          <linearGradient id="risk-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis ticks at 0 / 25 / 50 / 75 / 100: gives the eye an anchor for absolute risk level. */}
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border/40"
              strokeDasharray="2 4"
            />
            <text
              x={PAD_X - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Area fill: uses the same tone as the latest run's score band. */}
        <g className={latestTone}>
          <path d={areaPath} fill="url(#risk-area)" />
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" />
        </g>

        {/* Per-run dots so the discrete events stay legible: important because
            runs are daily/weekly, not continuous. */}
        {completed.map((p, i) => {
          const isLast = i === completed.length - 1;
          return (
            <g key={`${p.t}-${i}`} className={scoreFill(p.risk)}>
              <circle
                cx={x(p.t)}
                cy={y(p.risk)}
                r={isLast ? 4 : 2.5}
                fill="currentColor"
                className={isLast ? "" : "opacity-70"}
              />
              {isLast && <circle cx={x(p.t)} cy={y(p.risk)} r={7} fill="currentColor" opacity="0.18" />}
              {breachIdx.has(i) && (
                <circle
                  cx={x(p.t)}
                  cy={y(p.risk)}
                  r={6}
                  fill="none"
                  className="stroke-warning"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}

        {/* X-axis date labels at the start and end: keeps the chart uncluttered. */}
        <text
          x={PAD_X}
          y={H - 8}
          className="fill-muted-foreground font-mono text-[9px] uppercase tracking-wider"
        >
          {fmtDate(tMin)}
        </text>
        <text
          x={W - PAD_X}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground font-mono text-[9px] uppercase tracking-wider"
        >
          {fmtDate(tMax)}
        </text>
      </svg>

      {th != null && (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          <span className="text-warning">◯</span> risk rose ≥ Δ{th} vs. the prior run: tripped a risk-rise alert
        </p>
      )}
    </section>
  );
}

function Header({ runs, latest, delta }: { runs: number; latest: number | null; delta: number | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">Risk trend · last 30 days</h2>
      <span className="font-mono text-[11px] text-muted-foreground">
        {runs} audit{runs === 1 ? "" : "s"}
        {latest != null && (
          <>
            {" · "}
            <span className={scoreText(latest)}>{latest}</span>
            {delta != null && delta !== 0 && (
              <span className={`ml-1 ${delta < 0 ? "text-success" : "text-destructive"}`}>
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function fmtDate(t: number): string {
  return formatShortDate(t);
}

function scoreFill(score: number): string {
  return scoreTone(score);
}

function scoreText(score: number): string {
  return scoreTone(score);
}

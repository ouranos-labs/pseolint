import { scoreTone } from "@/lib/grade";

export type TrendPoint = { risk: number; t: number };

/**
 * Per-domain risk-trend sparkline. Lets the user scan a portfolio for
 * "which one is regressing?" without drilling in. Tone is keyed off the
 * latest run's score band so the eye reads color = current risk, slope =
 * direction. Cold-start state (<2 completed runs) renders a dash so the
 * surrounding row doesn't shift width.
 */
export function Sparkline({ points }: { points: TrendPoint[] }) {
  const W = 80;
  const H = 20;
  if (points.length < 2) {
    return (
      <span
        className="inline-block font-mono text-[11px] text-muted-foreground/60"
        title="Need two completed runs to chart a trend"
      >
:
      </span>
    );
  }
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const x = (t: number) => ((t - tMin) / tSpan) * W;
  const y = (r: number) => (1 - Math.min(100, Math.max(0, r)) / 100) * H;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.risk).toFixed(1)}`)
    .join(" ");
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest.risk - first.risk;
  const tone = scoreTone(latest.risk);
  const directionLabel = delta < 0 ? "improving" : delta > 0 ? "regressing" : "flat";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-5 w-20 ${tone}`}
      role="img"
      aria-label={`30-day risk trend, ${directionLabel}`}
    >
      <title>{`30d trend · ${directionLabel} (${first.risk} → ${latest.risk})`}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={x(latest.t)} cy={y(latest.risk)} r="1.8" fill="currentColor" />
    </svg>
  );
}

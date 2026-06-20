import { SCORED_RULE_COUNT } from "@pseolint/core";
import { cn } from "@/lib/cn";

export type RuleRingSeverity = "E" | "W" | "I";
export type FiredRule = { index: number; sev: RuleRingSeverity };

export type RuleRingProps = {
  total?: number;
  fired?: FiredRule[];
  size?: number;
  className?: string;
  title?: string;
};

export function RuleRing({
  total = SCORED_RULE_COUNT,
  fired = [],
  size = 26,
  className,
  title = `pseolint — ${SCORED_RULE_COUNT} SpamBrain rules`,
}: RuleRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * 0.34;
  const outerR = size * 0.46;
  const firedMap = new Map(fired.map((f) => [f.index, f.sev]));
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {Array.from({ length: total }, (_, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const sev = firedMap.get(i);
        const x1 = round(cx + Math.cos(angle) * innerR);
        const y1 = round(cy + Math.sin(angle) * innerR);
        const x2 = round(cx + Math.cos(angle) * outerR);
        const y2 = round(cy + Math.sin(angle) * outerR);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={strokeFor(sev)}
            strokeWidth={round(size * 0.05)}
            strokeLinecap="round"
            opacity={sev ? 1 : 0.32}
            style={{ transition: "opacity 320ms, stroke 320ms" }}
          />
        );
      })}
    </svg>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function strokeFor(sev: RuleRingSeverity | undefined): string {
  if (sev === "E") return "hsl(var(--destructive))";
  if (sev === "W") return "hsl(var(--warning))";
  if (sev === "I") return "hsl(var(--warning) / 0.75)";
  return "hsl(var(--muted-foreground))";
}

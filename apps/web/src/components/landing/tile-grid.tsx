import { cn } from "@/lib/cn";

export type TileState = "unscanned" | "clean" | "info" | "warning" | "error";

/** Per-tile context. When provided in same order as `states`, enables tooltip + drill-down. */
export type TileMeta = {
  /** Hover text. Required when meta is provided so the tile is self-explanatory. */
  label: string;
  /** Optional drill-down target. Tile becomes an SVG <a> when set. */
  href?: string;
};

export type TileGridProps = {
  states: TileState[];
  /** Per-tile metadata (tooltip + optional href). Length must match states[]. */
  meta?: TileMeta[];
  cols?: number;
  rows?: number;
  className?: string;
  title?: string;
};

const GAP = 0.18;
const RADIUS = 0.3;

export function TileGrid({ states, meta, cols = 25, rows = 8, className, title }: TileGridProps) {
  const total = cols * rows;
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-auto w-full select-none", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={!title}
    >
      {Array.from({ length: total }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const state = states[i] ?? "unscanned";
        const m = meta?.[i];
        const rect = (
          <rect
            x={col + GAP / 2}
            y={row + GAP / 2}
            width={1 - GAP}
            height={1 - GAP}
            rx={RADIUS}
            fill={tileFill(state)}
            style={{ transition: "fill 320ms cubic-bezier(0.2,0.7,0.2,1)" }}
          />
        );
        if (m?.href) {
          return (
            <a key={i} href={m.href} aria-label={m.label} className="cursor-pointer">
              {rect}
              <title>{m.label}</title>
            </a>
          );
        }
        if (m?.label) {
          return (
            <g key={i}>
              {rect}
              <title>{m.label}</title>
            </g>
          );
        }
        return <g key={i}>{rect}</g>;
      })}
    </svg>
  );
}

function tileFill(state: TileState): string {
  switch (state) {
    case "unscanned":
      return "hsl(var(--border) / 0.3)";
    case "clean":
      return "hsl(var(--success) / 0.55)";
    case "info":
      // Distinct neutral tone so info pages don't look like washed-out warnings.
      return "hsl(var(--muted-foreground) / 0.55)";
    case "warning":
      return "hsl(var(--warning) / 0.75)";
    case "error":
      return "hsl(var(--destructive))";
  }
}

export type Severity = "E" | "W" | "I";
type TileFinding = { sev: Severity; tiles: number[] };

export function deriveTileStates({
  total,
  pages,
  findings,
}: {
  total: number;
  pages: number;
  findings: TileFinding[];
}): TileState[] {
  const sevRank = { I: 1, W: 2, E: 3 } as const;
  const perTileSev: Array<Severity | undefined> = new Array(total);
  for (const f of findings) {
    for (const t of f.tiles) {
      if (t < 0 || t >= total) continue;
      const prev = perTileSev[t];
      if (!prev || sevRank[f.sev] > sevRank[prev]) perTileSev[t] = f.sev;
    }
  }
  return Array.from({ length: total }, (_, i) => {
    const sev = perTileSev[i];
    if (sev === "E") return "error";
    if (sev === "W") return "warning";
    if (sev === "I") return "info";
    if (i < pages) return "clean";
    return "unscanned";
  });
}

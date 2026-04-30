interface TileLegendProps {
  blockers: number;
  shouldFix: number;
  info: number;
  clean: number;
  total: number;
}

/**
 * Per-page legend below the tile grid. The grid itself is page-level (one tile
 * per scanned page, colored by worst-severity rule firing on that page); this
 * legend exposes the same axis in words so users don't conflate it with the
 * finding-level severity counts in the stat row below.
 */
export function TileLegend({ blockers, shouldFix, info, clean, total }: TileLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        Pages
      </span>
      <Item dotClass="bg-destructive" tone="text-destructive" count={blockers} label="with blockers" />
      <Item dotClass="bg-warning" tone="text-warning" count={shouldFix} label="with should-fix" />
      <Item dotClass="bg-muted-foreground" tone="text-foreground" count={info} label="with info" />
      <Item dotClass="bg-success" tone="text-success" count={clean} label="clean" />
      <span className="ml-auto text-muted-foreground/70">{total} scanned</span>
    </div>
  );
}

function Item({
  dotClass,
  tone,
  count,
  label,
}: {
  dotClass: string;
  tone: string;
  count: number;
  label: string;
}) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 opacity-40">
        <span className={`inline-block h-1.5 w-1.5 rounded-sm ${dotClass}`} />
        <span className="tabular-nums">0</span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-sm ${dotClass}`} />
      <span className={`tabular-nums ${tone}`}>{count}</span>
      <span>{label}</span>
    </span>
  );
}

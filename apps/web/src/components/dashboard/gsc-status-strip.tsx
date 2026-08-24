import Link from "next/link";

type Variant = "not-connected" | "connected-not-bound" | "bound-no-data" | "bound-with-data";

interface MonthlyTrendPoint {
  /** "YYYY-MM"; only used as a tooltip key, not parsed. */
  monthBucket: string;
  impressions: number;
  clicks: number;
}

interface TopTemplate {
  /** Template signature like "/blog/:slug". */
  signature: string;
  impressions: number;
  clicks: number;
}

interface GscStatusStripProps {
  variant: Variant;
  host: string;
  /** GSC property URL bound to this domain (only for `bound-*` variants). */
  siteUrl?: string | null;
  /** Current-month totals across this domain's pages. */
  totalImpressions?: number;
  totalClicks?: number;
  /** Last cron sync timestamp for the user's GSC integration. */
  lastSyncAt?: Date | null;
  /** Last 6 month buckets, oldest → newest. Sparkline is hidden when <2 points. */
  monthlyTrend?: MonthlyTrendPoint[];
  /** Top 3 templates by current-month impressions. */
  topTemplates?: TopTemplate[];
  /** Impressions-weighted avg position (lower = better; pages 1–10 = positions 1–10). */
  weightedAvgPosition?: number | null;
  /** Total CTR for the current month (clicks / impressions, 0–1). */
  ctr?: number | null;
}

export function GscStatusStrip(props: GscStatusStripProps) {
  if (props.variant === "not-connected") {
    return (
      <Strip tone="info" eyebrow="Search Console">
        <p className="text-sm text-foreground">
          Rank findings by traffic-at-risk, not guesswork.{" "}
          <Link href="/dashboard/integrations" className="text-primary hover:underline">
            Connect Search Console →
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Findings on high-impression templates outrank low-traffic ones once connected.
        </p>
      </Strip>
    );
  }

  if (props.variant === "connected-not-bound") {
    return (
      <Strip tone="warning" eyebrow="Search Console · connected">
        <p className="text-sm text-foreground">
          Bind a property to this domain so findings here get traffic-weighted.{" "}
          <Link
            href={`/dashboard/${encodeURIComponent(props.host)}/settings`}
            className="text-warning hover:underline"
          >
            Bind a property →
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The OAuth grant covers your account; each domain still needs its GSC property selected.
        </p>
      </Strip>
    );
  }

  if (props.variant === "bound-no-data") {
    return (
      <Strip tone="muted" eyebrow="Search Console · bound">
        <p className="text-sm text-foreground">
          Bound to <span className="font-mono text-xs">{props.siteUrl}</span>: first sync pending.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          GSC data appears within ~24h. Findings rank by severity × pages until then.
        </p>
      </Strip>
    );
  }

  // bound-with-data: rich card. The monitoring story finally has numbers
  // attached: trend direction, where the traffic is concentrated, and where
  // the operator is actually ranking. The old single-line pill confirmed
  // the integration was alive without saying anything useful about it.
  return <BoundWithDataCard {...props} />;
}

function BoundWithDataCard({
  siteUrl,
  totalImpressions,
  totalClicks,
  lastSyncAt,
  monthlyTrend,
  topTemplates,
  weightedAvgPosition,
  ctr,
}: GscStatusStripProps) {
  const trend = monthlyTrend ?? [];
  const showTrend = trend.length >= 2;
  const first = showTrend ? trend[0] : null;
  const last = showTrend ? trend[trend.length - 1] : null;
  const trendDelta =
    first && last && first.impressions > 0
      ? ((last.impressions - first.impressions) / first.impressions) * 100
      : null;

  const top = (topTemplates ?? []).filter((t) => t.impressions > 0);

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-success/30 bg-success/5 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-success">
            Search Console · ranking by traffic
          </p>
          {siteUrl && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={siteUrl}>
              {siteUrl}
            </p>
          )}
        </div>
        {lastSyncAt && (
          <span className="font-mono text-[10px] text-muted-foreground/80">
            synced {relTime(lastSyncAt)}
          </span>
        )}
      </header>

      {/* Headline numbers: what the operator wants to see first. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat
          label="Impressions"
          sub="this month"
          value={fmt(totalImpressions ?? 0)}
        />
        <Stat
          label="Clicks"
          sub="this month"
          value={fmt(totalClicks ?? 0)}
        />
        <Stat
          label="CTR"
          sub="clicks / impr"
          value={ctr != null ? `${(ctr * 100).toFixed(2)}%` : "—"}
        />
        <Stat
          label="Avg position"
          sub="impressions-weighted"
          value={weightedAvgPosition != null ? weightedAvgPosition.toFixed(1) : "—"}
          tone={positionTone(weightedAvgPosition)}
        />
      </dl>

      {/* Monthly trend, the question the old pill couldn't answer:
          "is my Google traffic growing or dying?" */}
      {showTrend && (
        <div className="flex items-end gap-3 rounded-[12px] border border-success/20 bg-background/30 p-3">
          <TrendChart points={trend} />
          <div className="ml-auto text-right">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {trend.length}-month trend
            </div>
            {trendDelta != null && (
              <div
                className={`font-mono text-sm tabular-nums ${
                  trendDelta >= 0 ? "text-success" : "text-destructive"
                }`}
                title={`${first?.monthBucket} → ${last?.monthBucket}`}
              >
                {trendDelta >= 0 ? "+" : ""}
                {trendDelta.toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top templates: concentration. "Where should I focus fixes?" */}
      {top.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Top templates · current month
          </p>
          <ul className="flex flex-col gap-1">
            {top.map((t, i) => {
              const pct = totalImpressions && totalImpressions > 0
                ? (t.impressions / totalImpressions) * 100
                : 0;
              return (
                <li
                  key={t.signature}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-[10px] border border-border/40 bg-card/40 px-2.5 py-1.5"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground/70">{i + 1}</span>
                    <code
                      className="truncate font-mono text-[11px] text-foreground"
                      title={t.signature}
                    >
                      {t.signature}
                    </code>
                  </span>
                  <span className="flex items-baseline gap-3 font-mono text-[11px] text-muted-foreground">
                    <span className="tabular-nums text-foreground">{fmt(t.impressions)}</span>
                    <span className="tabular-nums text-muted-foreground/80">{pct.toFixed(0)}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Inline area-ish sparkline for impressions across recent months. Pure SVG
 * to avoid pulling a chart lib for one card. Width auto-fills via viewBox;
 * height is fixed so the card doesn't jump as data lands.
 */
function TrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  const W = 240;
  const H = 36;
  const PAD_Y = 2;
  const max = Math.max(1, ...points.map((p) => p.impressions));
  const stepX = points.length > 1 ? W / (points.length - 1) : 0;
  const x = (i: number) => i * stepX;
  const y = (v: number) =>
    PAD_Y + (1 - v / max) * (H - PAD_Y * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p.impressions).toFixed(2)}`)
    .join(" ");
  const areaPath =
    `M ${x(0).toFixed(2)} ${(H - PAD_Y).toFixed(2)} ` +
    points.map((p, i) => `L ${x(i).toFixed(2)} ${y(p.impressions).toFixed(2)}`).join(" ") +
    ` L ${x(points.length - 1).toFixed(2)} ${(H - PAD_Y).toFixed(2)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-9 w-full text-success"
      role="img"
      aria-label={`Impressions over the last ${points.length} months`}
    >
      <defs>
        <linearGradient id="gsc-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#gsc-area)" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle
          key={p.monthBucket}
          cx={x(i)}
          cy={y(p.impressions)}
          r={i === points.length - 1 ? 2 : 1.4}
          fill="currentColor"
        >
          <title>{`${p.monthBucket} · ${fmt(p.impressions)} impr · ${fmt(p.clicks)} clicks`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Stat({
  label,
  sub,
  value,
  tone = "text-foreground",
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-base font-medium tabular-nums ${tone}`}>{value}</dd>
      {sub && <span className="font-mono text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

function Strip({
  tone,
  eyebrow,
  children,
}: {
  tone: "info" | "warning" | "success" | "muted";
  eyebrow: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "info"
      ? "border-primary/25 bg-primary/5"
      : tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : tone === "success"
      ? "border-success/30 bg-success/5"
      : "border-border/60 bg-card/40";
  return (
    <section className={`rounded-[18px] border ${cls} px-5 py-4`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/**
 * Position tone: pages 1–3 read green (top of page 1), 4–10 muted (still
 * page 1), 11+ warning (off page 1, lots of impressions but few clicks).
 */
function positionTone(p: number | null | undefined): string {
  if (p == null) return "text-muted-foreground";
  if (p <= 3) return "text-success";
  if (p <= 10) return "text-foreground";
  return "text-warning";
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

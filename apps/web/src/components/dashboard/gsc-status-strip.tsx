import Link from "next/link";

type Variant = "not-connected" | "connected-not-bound" | "bound-no-data" | "bound-with-data";

interface GscStatusStripProps {
  variant: Variant;
  host: string;
  /** GSC property URL bound to this domain (only for `bound-*` variants). */
  siteUrl?: string | null;
  /** 28-day totals across this domain's pages. */
  totalImpressions?: number;
  totalClicks?: number;
  /** Last cron sync timestamp for the user's GSC integration. */
  lastSyncAt?: Date | null;
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
          Bound to <span className="font-mono text-xs">{props.siteUrl}</span> — first sync pending.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          GSC data appears within ~24h. Findings rank by severity × pages until then.
        </p>
      </Strip>
    );
  }

  // bound-with-data
  return (
    <Strip tone="success" eyebrow="Search Console · ranking by traffic">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Stat label="Impressions" value={fmt(props.totalImpressions ?? 0)} />
        <Stat label="Clicks" value={fmt(props.totalClicks ?? 0)} />
        <span className="font-mono text-[11px] text-muted-foreground">
          trailing 28d · bound to <span className="text-foreground">{props.siteUrl}</span>
          {props.lastSyncAt && <> · synced {relTime(props.lastSyncAt)}</>}
        </span>
      </div>
    </Strip>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-lg tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
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

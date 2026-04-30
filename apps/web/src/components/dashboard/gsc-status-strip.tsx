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

  // bound-with-data — single compact pill so the happy path doesn't eat
  // hero real estate. Actionable states (not-connected / unbound / no-data)
  // get the loud full strip; working state earns one subtle line.
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-success/30 bg-success/5 px-3 py-1.5 font-mono text-[11px]"
      title={`Bound to ${props.siteUrl}${props.lastSyncAt ? ` · last sync ${props.lastSyncAt.toLocaleString()}` : ""}`}
    >
      <span className="inline-flex items-center gap-1.5 text-success">
        <span className="inline-block h-1 w-1 rounded-full bg-success" />
        Search Console · ranking by traffic
      </span>
      <span className="text-muted-foreground">
        <span className="tabular-nums text-foreground">{fmt(props.totalImpressions ?? 0)}</span> impr ·{" "}
        <span className="tabular-nums text-foreground">{fmt(props.totalClicks ?? 0)}</span> clicks{" "}
        <span className="text-muted-foreground/70">(28d)</span>
      </span>
      {props.lastSyncAt && (
        <span className="text-muted-foreground/70">synced {relTime(props.lastSyncAt)}</span>
      )}
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

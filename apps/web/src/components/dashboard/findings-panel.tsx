"use client";
import { useState, useTransition } from "react";
import { snoozeFinding, dismissFinding } from "@/app/dashboard/_actions/findings";

type Finding = {
  id: string;
  ruleId: string;
  severityLatest: "info" | "warning" | "error" | "critical";
  affectedPageCount: number;
  rankScore: string;
  ruleMessageLatest: string;
  representativeUrl: string | null;
  status: "open" | "snoozed" | "dismissed";
  /** GSC traffic for this finding's template signature, when bound + synced. */
  traffic?: { impressions: number; clicks: number } | null;
};

interface FindingsPanelProps {
  findings: Finding[];
  /** Whether the domain has a GSC property bound — controls rank-source annotation. */
  gscBound?: boolean;
}

const SEV_ORDER = ["critical", "error", "warning", "info"] as const;
type Severity = (typeof SEV_ORDER)[number];

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export function FindingsPanel({ findings, gscBound = false }: FindingsPanelProps) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const visible = findings.filter((f) => showSuppressed || f.status === "open");
  const groups = SEV_ORDER
    .map((sev) => ({ sev, rows: visible.filter((f) => f.severityLatest === sev) }))
    .filter((g) => g.rows.length > 0);

  const openCount = findings.filter((f) => f.status === "open").length;
  const suppressedCount = findings.length - openCount;

  const sevCounts: Record<Severity, number> = {
    critical: 0, error: 0, warning: 0, info: 0,
  };
  for (const f of findings) {
    if (f.status === "open") sevCounts[f.severityLatest] += 1;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {showSuppressed ? "All findings" : "Open findings"}
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground/80">
            {visible.length} {visible.length === 1 ? "issue" : "issues"}
            {gscBound && (
              <span className="ml-2 text-success" title="Ranked by traffic-at-risk via Search Console">
                ↑ traffic-weighted
              </span>
            )}
          </span>
        </div>
        {suppressedCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={showSuppressed}
              onChange={(e) => setShowSuppressed(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border/70 bg-card/60 accent-primary"
            />
            Show suppressed ({suppressedCount})
          </label>
        )}
      </div>

      {openCount > 0 && !showSuppressed && (
        <div className="flex flex-wrap gap-2">
          {SEV_ORDER.map((sev) => sevCounts[sev] > 0 && (
            <span
              key={sev}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${sevBorderBg(sev)}`}
            >
              <span className={`inline-block h-1 w-1 rounded-full ${sevDot(sev)}`} />
              <span className="uppercase tracking-wider">{SEV_LABEL[sev]}</span>
              <span className="tabular-nums">{sevCounts[sev]}</span>
            </span>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <CleanState hasSuppressed={suppressedCount > 0} onShow={() => setShowSuppressed(true)} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <SeverityGroup key={g.sev} sev={g.sev} rows={g.rows} gscBound={gscBound} />
          ))}
        </div>
      )}
    </section>
  );
}

function CleanState({ hasSuppressed, onShow }: { hasSuppressed: boolean; onShow: () => void }) {
  return (
    <div className="rounded-[22px] border border-success/30 bg-success/5 p-8 text-center">
      <p
        className="text-success"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400, fontSize: "24px" }}
      >
        No open findings.
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {hasSuppressed
          ? "Everything has been snoozed or dismissed."
          : "Nothing to fix — this domain is clean."}
      </p>
      {hasSuppressed && (
        <button onClick={onShow} className="mt-3 text-xs text-primary hover:underline">
          Review suppressed →
        </button>
      )}
    </div>
  );
}

function SeverityGroup({ sev, rows, gscBound }: { sev: Severity; rows: Finding[]; gscBound: boolean }) {
  return (
    <div>
      <h3 className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${sevText(sev)}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(sev)}`} />
        {SEV_LABEL[sev]}
        <span className="font-mono text-[11px] font-normal text-muted-foreground">· {rows.length}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((f) => <FindingRow key={f.id} f={f} gscBound={gscBound} />)}
      </ul>
    </div>
  );
}

function FindingRow({ f, gscBound }: { f: Finding; gscBound: boolean }) {
  const [pending, start] = useTransition();
  const isSuppressed = f.status !== "open";
  const hasTraffic = Boolean(f.traffic && (f.traffic.impressions > 0 || f.traffic.clicks > 0));

  return (
    <li>
      <article
        className={`overflow-hidden rounded-[18px] border transition-colors ${
          isSuppressed
            ? "border-border/40 bg-card/20 opacity-70"
            : "border-border/70 bg-card/60 backdrop-blur-sm hover:border-border"
        }`}
      >
        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge sev={f.severityLatest} />
            <code className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {f.ruleId}
            </code>
            {isSuppressed && <StatusBadge status={f.status as "snoozed" | "dismissed"} />}
            <span className="ml-auto flex items-baseline gap-3 font-mono text-[11px] text-muted-foreground">
              <span title="Pages affected">
                {f.affectedPageCount} {f.affectedPageCount === 1 ? "page" : "pages"}
              </span>
              <RankChip rankScore={f.rankScore} hasTraffic={hasTraffic} gscBound={gscBound} />
            </span>
          </div>

          <p className="text-sm text-foreground">{f.ruleMessageLatest}</p>

          {hasTraffic && (
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/5 px-2 py-0.5 text-success"
                title="Trailing 28-day GSC traffic for this template — used to weight the rank score"
              >
                <span className="h-1 w-1 rounded-full bg-success" />
                {fmt(f.traffic!.impressions)} impressions
              </span>
              {f.traffic!.clicks > 0 && (
                <span className="text-muted-foreground">{fmt(f.traffic!.clicks)} clicks</span>
              )}
            </div>
          )}

          {f.representativeUrl && (
            <a
              href={f.representativeUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate font-mono text-[11px] text-muted-foreground hover:text-foreground"
              title={f.representativeUrl}
            >
              ↗ {pathOf(f.representativeUrl)}
            </a>
          )}

          {!isSuppressed && (
            <div className="flex items-center gap-1.5 pt-1">
              <button
                disabled={pending}
                onClick={() => start(() => snoozeFinding(f.id, 7))}
                className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
              >
                Snooze 7d
              </button>
              <button
                disabled={pending}
                onClick={() => start(() => dismissFinding(f.id))}
                className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

/**
 * Rank chip with provenance indicator:
 *   ↑ rank N → traffic-weighted (GSC bound, this template has impressions)
 *   ~ rank N → estimated (no GSC binding, or GSC has no data for this template)
 * The annotation makes the score legible: a high rank without traffic context
 * is misleading, so we mark it.
 */
function RankChip({ rankScore, hasTraffic, gscBound }: { rankScore: string; hasTraffic: boolean; gscBound: boolean }) {
  const trafficWeighted = gscBound && hasTraffic;
  const formatted = Number(rankScore).toFixed(0);
  if (trafficWeighted) {
    return (
      <span
        className="hidden items-center gap-1 text-success sm:inline-flex"
        title="Rank weighted by GSC impressions for this template"
      >
        <span className="text-[10px]">↑</span>
        rank {formatted}
      </span>
    );
  }
  return (
    <span
      className="hidden items-center gap-1 text-muted-foreground/80 sm:inline-flex"
      title={
        gscBound
          ? "No GSC traffic recorded for this template — rank uses severity × pages"
          : "No GSC binding — rank uses severity × pages. Bind a property to weight by traffic."
      }
    >
      <span className="text-[10px]">~</span>
      rank {formatted}
    </span>
  );
}

function SeverityBadge({ sev }: { sev: Severity }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sevBorderBg(sev)}`}
    >
      <span className={`inline-block h-1 w-1 rounded-full ${sevDot(sev)}`} />
      {sev}
    </span>
  );
}

function StatusBadge({ status }: { status: "snoozed" | "dismissed" }) {
  const label = status === "snoozed" ? "Snoozed" : "Dismissed";
  return (
    <span className="inline-flex items-center rounded-full border border-border/50 bg-card/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}

function sevText(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "text-destructive";
  if (sev === "warning") return "text-warning";
  return "text-muted-foreground";
}

function sevDot(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "bg-destructive";
  if (sev === "warning") return "bg-warning";
  return "bg-muted-foreground";
}

function sevBorderBg(sev: Severity): string {
  if (sev === "critical" || sev === "error") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (sev === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border/60 bg-card/60 text-muted-foreground";
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "/" : u.pathname;
    return `${u.host}${p}${u.search}`;
  } catch {
    return url;
  }
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
}

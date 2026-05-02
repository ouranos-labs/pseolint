"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { snoozeFinding, dismissFinding } from "@/app/dashboard/_actions/findings";
import { sevDot, sevBorderBg, sevText } from "@/lib/severity-style";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SNOOZE_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

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
  /** Inline remediation pulled from marketing-rules — one-liner + actionable bullets. */
  help?: {
    slug: string;
    oneLiner: string;
    howToFix: string[];
  } | null;
};

interface FindingsPanelProps {
  findings: Finding[];
  /** Whether the domain has a GSC property bound — controls rank-source annotation. */
  gscBound?: boolean;
  /** Domain host — used to build per-URL deep-dive links. */
  host: string;
}

const SEV_ORDER = ["critical", "error", "warning", "info"] as const;
type Severity = (typeof SEV_ORDER)[number];

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

const PAGE_SIZE = 50;

export function FindingsPanel({ findings, gscBound = false, host }: FindingsPanelProps) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [pages, setPages] = useState(1);
  const visible = findings.filter((f) => showSuppressed || f.status === "open");

  // Sort once globally by severity → rank, then slice. This preserves the
  // overall priority order across pages so "load more" reveals lower-ranked
  // findings rather than re-sorting within a clipped window.
  const sevRank: Record<Severity, number> = { critical: 0, error: 1, warning: 2, info: 3 };
  const ordered = [...visible].sort((a, b) => {
    const sevDelta = sevRank[a.severityLatest] - sevRank[b.severityLatest];
    if (sevDelta !== 0) return sevDelta;
    return Number(b.rankScore) - Number(a.rankScore);
  });
  const pageCap = pages * PAGE_SIZE;
  const sliced = ordered.slice(0, pageCap);
  const remaining = ordered.length - sliced.length;

  const groups = SEV_ORDER
    .map((sev) => ({ sev, rows: sliced.filter((f) => f.severityLatest === sev) }))
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
            <SeverityGroup key={g.sev} sev={g.sev} rows={g.rows} gscBound={gscBound} host={host} />
          ))}
          {remaining > 0 && (
            <div className="flex items-center justify-between rounded-[14px] border border-border/60 bg-card/40 px-4 py-3 text-xs">
              <span className="font-mono text-muted-foreground">
                Showing {sliced.length} of {ordered.length}
              </span>
              <button
                type="button"
                onClick={() => setPages((p) => p + 1)}
                className="inline-flex h-9 items-center rounded-[12px] border border-border-strong bg-card px-3 text-xs font-medium hover:bg-secondary"
              >
                Show next {Math.min(PAGE_SIZE, remaining)} →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CleanState({ hasSuppressed, onShow }: { hasSuppressed: boolean; onShow: () => void }) {
  return (
    <div className="rounded-[18px] border border-success/30 bg-success/5 p-8 text-center">
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

function SeverityGroup({ sev, rows, gscBound, host }: { sev: Severity; rows: Finding[]; gscBound: boolean; host: string }) {
  return (
    <div>
      <h3 className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${sevText(sev)}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(sev)}`} />
        {SEV_LABEL[sev]}
        <span className="font-mono text-[11px] font-normal text-muted-foreground">· {rows.length}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((f) => <FindingRow key={f.id} f={f} gscBound={gscBound} host={host} />)}
      </ul>
    </div>
  );
}

function FindingRow({ f, gscBound, host }: { f: Finding; gscBound: boolean; host: string }) {
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={f.representativeUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate font-mono text-[11px] text-muted-foreground hover:text-foreground"
                title={f.representativeUrl}
              >
                ↗ {pathOf(f.representativeUrl)}
              </a>
              <Link
                href={`/dashboard/${encodeURIComponent(host)}/url/${encodeURIComponent(f.representativeUrl)}`}
                className="font-mono text-[11px] text-primary hover:underline"
                title="See every finding ever recorded for this URL"
              >
                View page history →
              </Link>
            </div>
          )}

          {f.help && <RemediationDetails help={f.help} />}

          {!isSuppressed && (
            <div className="flex items-center gap-1.5 pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={pending}
                  className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:opacity-50"
                >
                  Snooze ▾
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[8rem]">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.days}
                      onSelect={() => start(() => snoozeFinding(f.id, opt.days))}
                    >
                      <span className="font-mono text-xs">{opt.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        until {new Date(Date.now() + opt.days * 86_400_000).toLocaleDateString()}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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

/**
 * Inline remediation drawer — collapsed by default to keep the row scannable,
 * expanded on click for users who want the actionable bullets without opening
 * the marketing-rules page in a separate tab. Closes the "rule fired but how
 * do I fix it?" gap that used to require a context switch.
 */
function RemediationDetails({ help }: { help: NonNullable<Finding["help"]> }) {
  return (
    <details className="group rounded-[12px] border border-primary/25 bg-primary/[0.04]">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
            How to fix
          </span>
          <span className="truncate text-muted-foreground">{help.oneLiner}</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-primary/15 px-3 py-3">
        <ul className="flex flex-col gap-1.5 text-xs text-foreground">
          {help.howToFix.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-primary/60" />
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ul>
        <a
          href={`/rules/${help.slug}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex font-mono text-[11px] text-primary hover:underline"
        >
          Read the full rule explainer →
        </a>
      </div>
    </details>
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

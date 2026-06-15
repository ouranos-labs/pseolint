"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { snoozeFinding, dismissFinding } from "@/app/dashboard/_actions/findings";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { sevDot, sevBorderBg, sevText } from "@/lib/severity-style";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IndexingButton } from "@/components/dashboard/indexing-button";
import { requestBatchIndexingAction } from "@/app/dashboard/indexing-actions";
import { toast } from "sonner";


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
  confidence?: "high" | "medium" | "low" | "speculative";
  carriedForward?: boolean;
  lastVerifiedAt?: string | null;
  effort?: "quick" | "moderate" | "structural";
};

interface FindingsPanelProps {
  findings: Finding[];
  /** Whether the domain has a GSC property bound — controls rank-source annotation. */
  gscBound?: boolean;
  /** Domain host — used to build per-URL deep-dive links. */
  host: string;
  /** v0.6 Indexing orchestration props */
  domainId: string;
  indexingIntegrations: ("google-indexing" | "indexnow")[];
  latestAuditRisk: number | null;
  recentIndexingRequests?: {
    url: string;
    provider: "google" | "indexnow";
    status: "pending" | "completed" | "failed";
    error: string | null;
  }[];
  indexedUrls?: string[];
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

export function FindingsPanel({ 
  findings, 
  gscBound = false, 
  host,
  domainId,
  indexingIntegrations,
  latestAuditRisk,
  recentIndexingRequests = [],
  indexedUrls = []
}: FindingsPanelProps) {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [pages, setPages] = useState(1);
  const [batchPending, startBatch] = useTransition();

  const openUrls = Array.from(new Set(
    findings
      .filter((f) => f.status === "open" && f.representativeUrl)
      .map((f) => f.representativeUrl as string)
  ));

  const handleBatchPush = (provider: "google" | "indexnow") => {
    if (latestAuditRisk !== null && latestAuditRisk > 40) {
      toast.error("Quality Gate: Audit risk is too high. Fix findings before requesting indexation.");
      return;
    }

    if (openUrls.length === 0) {
      toast.error("No open pages to index.");
      return;
    }

    if (provider === "google" && openUrls.length > 50) {
      toast.error("Google Indexing API only allows a max of 50 URLs in a single batch. Pushing the first 50 URLs.");
    }

    const urlsToPush = provider === "google" ? openUrls.slice(0, 50) : openUrls;

    if (!confirm(`Are you sure you want to push ${urlsToPush.length} URL(s) to ${provider === "google" ? "Google" : "IndexNow"}?`)) {
      return;
    }

    startBatch(async () => {
      const res = await requestBatchIndexingAction({
        domainId,
        urls: urlsToPush,
        provider,
      });

      if (res.success) {
        toast.success(`Successfully queued ${urlsToPush.length} URL(s) for indexing via ${provider === "google" ? "Google" : "IndexNow"}`);
      } else {
        toast.error(res.error || "Batch indexing failed");
      }
    });
  };
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

      {/* Batch Indexing Affordances (v0.6) */}
      {openUrls.length > 0 && (indexingIntegrations.includes("google-indexing") || indexingIntegrations.includes("indexnow")) && (
        <div className="flex flex-col gap-3 rounded-[18px] border border-primary/20 bg-primary/[0.02] p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">Programmatic Indexing (Batch Action)</p>
              <p className="mt-0.5 text-muted-foreground">
                Push all <span className="font-mono font-medium text-foreground">{openUrls.length}</span> open affected pages directly to search engines.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {indexingIntegrations.includes("google-indexing") && (
                <button
                  type="button"
                  disabled={batchPending}
                  onClick={() => handleBatchPush("google")}
                  className="inline-flex h-8 items-center rounded-[12px] border border-border-strong bg-card px-3 text-xs font-mono text-foreground hover:bg-secondary disabled:opacity-50"
                  title="Limit 50 per batch. Gated by Google daily quota."
                >
                  {batchPending ? "Pushing..." : "Push all to Google"}
                </button>
              )}
              {indexingIntegrations.includes("indexnow") && (
                <button
                  type="button"
                  disabled={batchPending}
                  onClick={() => handleBatchPush("indexnow")}
                  className="inline-flex h-8 items-center rounded-[12px] border border-border-strong bg-card px-3 text-xs font-mono text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {batchPending ? "Pushing..." : "Push all to IndexNow"}
                </button>
              )}
            </div>
          </div>

          {indexingIntegrations.includes("google-indexing") && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-[11px] text-warning">
              <span className="font-semibold">⚠️ Google Indexing API Daily Quota:</span> Google restricts indexing to <strong>200 requests/day</strong>. Pushing large batches will consume your daily quota quickly. Prefer IndexNow for large batch runs.
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <CleanState hasSuppressed={suppressedCount > 0} onShow={() => setShowSuppressed(true)} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <SeverityGroup 
              key={g.sev} 
              sev={g.sev} 
              rows={g.rows} 
              gscBound={gscBound} 
              host={host} 
              domainId={domainId}
              indexingIntegrations={indexingIntegrations}
              latestAuditRisk={latestAuditRisk}
              recentIndexingRequests={recentIndexingRequests}
              indexedUrls={indexedUrls}
            />
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

function SeverityGroup({ 
  sev, 
  rows, 
  gscBound, 
  host,
  domainId,
  indexingIntegrations,
  latestAuditRisk,
  recentIndexingRequests,
  indexedUrls
}: { 
  sev: Severity; 
  rows: Finding[]; 
  gscBound: boolean; 
  host: string;
  domainId: string;
  indexingIntegrations: ("google-indexing" | "indexnow")[];
  latestAuditRisk: number | null;
  recentIndexingRequests: {
    url: string;
    provider: "google" | "indexnow";
    status: "pending" | "completed" | "failed";
    error: string | null;
  }[];
  indexedUrls: string[];
}) {
  return (
    <div>
      <h3 className={`mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${sevText(sev)}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${sevDot(sev)}`} />
        {SEV_LABEL[sev]}
        <span className="font-mono text-[11px] font-normal text-muted-foreground">· {rows.length}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {rows.map((f) => (
          <FindingRow 
            key={f.id} 
            f={f} 
            gscBound={gscBound} 
            host={host} 
            domainId={domainId}
            indexingIntegrations={indexingIntegrations}
            latestAuditRisk={latestAuditRisk}
            recentIndexingRequests={recentIndexingRequests}
            indexedUrls={indexedUrls}
          />
        ))}
      </ul>
    </div>
  );
}

function FindingRow({ 
  f, 
  gscBound, 
  host,
  domainId,
  indexingIntegrations,
  latestAuditRisk,
  recentIndexingRequests,
  indexedUrls
}: { 
  f: Finding; 
  gscBound: boolean; 
  host: string;
  domainId: string;
  indexingIntegrations: ("google-indexing" | "indexnow")[];
  latestAuditRisk: number | null;
  recentIndexingRequests: {
    url: string;
    provider: "google" | "indexnow";
    status: "pending" | "completed" | "failed";
    error: string | null;
  }[];
  indexedUrls: string[];
}) {
  const [pending, start] = useTransition();
  const { track } = useAnalytics();
  const isSuppressed = f.status !== "open";
  const hasTraffic = Boolean(f.traffic && (f.traffic.impressions > 0 || f.traffic.clicks > 0));
  const hasGoogleIndexing = indexingIntegrations.includes("google-indexing");
  const hasIndexNow = indexingIntegrations.includes("indexnow");
  const isIndexed = f.representativeUrl ? indexedUrls.includes(f.representativeUrl) : false;

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
            {f.effort && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${effortTone(f.effort)}`}>
                {f.effort} effort
              </span>
            )}
            {f.confidence && f.confidence !== "high" && (
              <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning" title="Downweighted false-positive risk for this site type">
                ⚠️ {f.confidence} confidence
              </span>
            )}
            {f.carriedForward && (
              <span
                className="inline-flex items-center rounded-full border border-border/50 bg-card/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                title={f.lastVerifiedAt ? `This finding was carried forward from a prior monitoring run — last actually re-verified at ${new Date(f.lastVerifiedAt).toLocaleString()}` : "Carried forward from a prior monitoring run"}
              >
                Carried forward {f.lastVerifiedAt && `· verified ${relTime(new Date(f.lastVerifiedAt))}`}
              </span>
            )}
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

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {!isSuppressed && (
              <>
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
                        onSelect={() => {
                          track({ name: "triage_action", props: { action: `snooze_${opt.days}d` } });
                          start(() => snoozeFinding(f.id, opt.days));
                        }}
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
                  onClick={() => {
                    track({ name: "triage_action", props: { action: "dismiss" } });
                    start(() => dismissFinding(f.id));
                  }}
                  className="rounded-[10px] border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                >
                  Dismiss
                </button>
              </>
            )}
            
            {/* Indexing Affordances (v0.6) */}
            {f.representativeUrl && (hasGoogleIndexing || hasIndexNow) && (
              <div className="flex items-center gap-1.5 border-l border-border/40 ml-1.5 pl-3">
                {hasGoogleIndexing && (
                  <IndexingButton 
                    domainId={domainId} 
                    url={f.representativeUrl} 
                    provider="google" 
                    latestAuditRisk={latestAuditRisk}
                    disabled={pending}
                    recentStatus={recentIndexingRequests.find(r => r.url === f.representativeUrl && r.provider === "google")?.status}
                    recentError={recentIndexingRequests.find(r => r.url === f.representativeUrl && r.provider === "google")?.error}
                    alreadyIndexed={isIndexed}
                  />
                )}
                {hasIndexNow && (
                  <IndexingButton 
                    domainId={domainId} 
                    url={f.representativeUrl} 
                    provider="indexnow" 
                    latestAuditRisk={latestAuditRisk}
                    disabled={pending}
                    recentStatus={recentIndexingRequests.find(r => r.url === f.representativeUrl && r.provider === "indexnow")?.status}
                    recentError={recentIndexingRequests.find(r => r.url === f.representativeUrl && r.provider === "indexnow")?.error}
                    alreadyIndexed={isIndexed}
                  />
                )}
              </div>
            )}
          </div>
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

function effortTone(effort: "quick" | "moderate" | "structural"): string {
  if (effort === "quick") return "border-success/40 text-success bg-success/5";
  if (effort === "moderate") return "border-warning/40 text-warning bg-warning/5";
  if (effort === "structural") return "border-destructive/40 text-destructive bg-destructive/5";
  return "border-border/40 text-muted-foreground bg-card/5";
}

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  return days + "d ago";
}

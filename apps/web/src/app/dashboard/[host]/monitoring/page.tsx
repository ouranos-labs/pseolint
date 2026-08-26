import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { withDbRetry } from "@/lib/db-retry";
import { watchedPages } from "@/db/schema";
import { getCumulativeCoverage } from "@/lib/monitoring";
import { RiskTrendChart } from "@/components/dashboard/risk-trend-chart";
import { AlertThresholdSimulator } from "@/components/dashboard/alert-threshold-simulator";
import { TimelineStrip } from "@/components/dashboard/timeline-strip";
import { CumulativeCoverageCard } from "@/components/dashboard/cumulative-coverage-card";
import { QuickIndexerCard } from "@/components/dashboard/quick-indexer-card";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { WatchedPagesCard } from "../watched-pages-card";
import {
  getCleanCandidateUrls,
  getIndexedUrls,
  getIndexingState,
  getLatestAudit,
  getLatestSummary,
  getTimelineRuns,
  getWorkspaceDomain,
  requireProSession,
} from "../_data";

export const runtime = "nodejs";

/**
 * Monitoring tab: how this domain is being watched over time. The trend, the
 * alert threshold, the run picker, coverage, pinned pages and the crawl-request
 * queue all answer "is monitoring doing its job", which is a different question
 * from overview's "what is wrong right now".
 *
 * The quick indexer's inputs (an unbounded indexed-URL scan plus the clean
 * candidate derivation) are the second-most expensive work in the workspace, so
 * they stream in rather than blocking the trend chart.
 */
export default async function WorkspaceMonitoring({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: rawHost } = await params;
  const [domain, runs] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getTimelineRuns(rawHost),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <RiskTrendChart runs={runs} alertThreshold={domain.alertThreshold} />

      <AlertThresholdSimulator
        runs={runs}
        currentThreshold={domain.alertThreshold}
        host={domain.host}
      />

      <Suspense fallback={<CardSkeleton className="h-20" />}>
        <CoverageSection rawHost={rawHost} />
      </Suspense>

      <Suspense fallback={<CardSkeleton className="h-40" />}>
        <WatchedPagesSection rawHost={rawHost} />
      </Suspense>

      <Suspense fallback={<CardSkeleton className="h-56" />}>
        <IndexerSection rawHost={rawHost} />
      </Suspense>

      <Suspense fallback={<CardSkeleton className="h-32" />}>
        <OriginReadinessSection rawHost={rawHost} />
      </Suspense>

      {/* Run picker sits last: it's the drill-down you reach for after reading
          the trend, not before. */}
      <TimelineStrip runs={runs} />
    </div>
  );
}

/**
 * v0.5.3: reframes "200 URLs/week" as the running total this domain has
 * accumulated. Hidden for brand-new domains with no completed audit history,
 * where an empty state would just be noise.
 */
async function CoverageSection({ rawHost }: { rawHost: string }) {
  const session = await requireProSession();
  const domain = await getWorkspaceDomain(rawHost);
  const coverage = await getCumulativeCoverage({
    monitoredDomainId: domain.id,
    userId: session.user.id,
    sourceUrl: domain.sourceUrl,
  });
  if (coverage.urlsAuditedTotal === 0) return null;
  return (
    <CumulativeCoverageCard
      urlsAuditedTotal={coverage.urlsAuditedTotal}
      urlsAuditedLast30d={coverage.urlsAuditedLast30d}
    />
  );
}

/**
 * v0.5.3 Pro-only pinning. URLs in this list are force-refetched on every
 * monitoring run regardless of diff-mode skip.
 */
async function WatchedPagesSection({ rawHost }: { rawHost: string }) {
  const domain = await getWorkspaceDomain(rawHost);
  const rows = await withDbRetry(() =>
    db
      .select({
        id: watchedPages.id,
        url: watchedPages.url,
        createdAt: watchedPages.createdAt,
        lastAuditedAt: watchedPages.lastAuditedAt,
      })
      .from(watchedPages)
      .where(eq(watchedPages.monitoredDomainId, domain.id))
      .orderBy(desc(watchedPages.createdAt)),
  );
  return <WatchedPagesCard monitoredDomainId={domain.id} host={domain.host} initialRows={rows} />;
}

/**
 * v0.6 instant indexing: free-form URL push for pages that are clean but not
 * yet surfaced. Respects the same Domain-Level Quality Gate, Hostname Guard and
 * Impression Proxy Correlation as the per-finding IndexingButton.
 */
async function IndexerSection({ rawHost }: { rawHost: string }) {
  const [domain, indexing] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getIndexingState(rawHost),
  ]);
  if (indexing.providers.length === 0) return null;

  const [latestAudit, indexedUrls, cleanCandidateUrls] = await Promise.all([
    getLatestAudit(rawHost),
    getIndexedUrls(rawHost),
    getCleanCandidateUrls(rawHost),
  ]);

  return (
    <QuickIndexerCard
      domainId={domain.id}
      host={domain.host}
      latestAuditRisk={latestAudit?.risk ?? null}
      indexingIntegrations={indexing.providers}
      recentIndexingRequests={indexing.recentRequests}
      indexedUrls={indexedUrls}
      cleanCandidateUrls={cleanCandidateUrls}
    />
  );
}

async function OriginReadinessSection({ rawHost }: { rawHost: string }) {
  const summary = await getLatestSummary(rawHost);
  if (!summary) return null;
  return <OriginReadinessCard summary={summary} />;
}

function CardSkeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[18px] bg-muted/25 ${className}`} aria-hidden />;
}

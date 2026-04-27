import type { AuditSummary } from "@pseolint/core";

/**
 * Origin-readiness summary card — sits above the Findings list.
 *
 * Renders from `summary.readiness` (structured) when present; falls back to
 * the `audit/origin-readiness` finding's message string for older reports
 * written before that field was added.
 *
 * Returns null when the audit made no live origin fetches (a directory-only
 * audit, or every page served from cache). In that case we have nothing
 * meaningful to say about origin behaviour.
 */
export function OriginReadinessCard({ summary }: { summary: AuditSummary }) {
  const report = summary.readiness;
  const legacyFinding = summary.findings.find((f) => f.ruleId === "audit/origin-readiness");
  if (!report && !legacyFinding) return null;

  // Legacy-only path: we have a finding but no structured numbers.
  if (!report) {
    return (
      <div className="mt-6 rounded-[22px] border border-border/60 bg-card/50 p-5 text-sm text-muted-foreground">
        <p className="text-sm font-medium text-foreground">Origin readiness</p>
        <p className="mt-1 leading-relaxed">{legacyFinding?.message}</p>
      </div>
    );
  }

  const verdictCopy: Record<typeof report.verdict, { label: string; tone: string; dot: string; border: string; bg: string }> = {
    "ready": {
      label: "Ready",
      tone: "text-success",
      dot: "bg-success",
      border: "border-success/30",
      bg: "bg-success/5",
    },
    "concerning": {
      label: "Concerning",
      tone: "text-warning",
      dot: "bg-warning",
      border: "border-warning/40",
      bg: "bg-warning/5",
    },
    "not-ready": {
      label: "Not ready",
      tone: "text-destructive",
      dot: "bg-destructive",
      border: "border-destructive/40",
      bg: "bg-destructive/5",
    },
  };
  const v = verdictCopy[report.verdict];

  const interpretation =
    report.verdict === "ready"
      ? "Your origin handled the crawl cleanly. Under Googlebot / AI-crawler bursts you should be fine."
      : report.verdict === "concerning"
      ? "Latency is high. Search-engine and AI-crawler bursts will amplify this — consider an edge cache or app-layer query cache."
      : "Origin looks unprepared for crawl load. A cache-cold dynamic origin at this rate will struggle under bot traffic and may leak to your database bill.";

  return (
    <section className={`mt-6 rounded-[22px] border ${v.border} ${v.bg} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Origin readiness</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-card px-2.5 py-1 font-mono text-[11px] ${v.tone}`}>
            <span className={`inline-block h-1 w-1 rounded-full ${v.dot}`} />
            {v.label}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{report.liveFetchCount} live fetches</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Median TTFB" value={`${report.medianMs}ms`} />
        <Stat label="p95 TTFB" value={`${report.p95Ms}ms`} tone={v.tone} />
        <Stat label="5xx rate" value={`${Math.round(report.serverErrorRatio * 100)}%`} />
        <Stat label="Cache assisted" value={`${Math.round(report.cacheAssistRatio * 100)}%`} />
      </dl>

      <p className="mt-4 text-sm text-muted-foreground">{interpretation}</p>

      {report.verdict !== "ready" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Fix: add an edge CDN with a sensible <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">s-maxage</code>, or an app-layer query cache (Redis / Next.js <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">unstable_cache</code>) between the route handler and the database.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm tabular-nums ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

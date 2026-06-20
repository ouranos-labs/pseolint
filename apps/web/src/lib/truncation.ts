/**
 * Read the core engine's partial-coverage flags off whatever summary shape we
 * parsed from R2. The fields live on the current `AuditSummary` (v0.4+); legacy
 * v0.3 blobs never carry them, so this returns `{ truncated: false }` for them.
 *
 * The R2 blob is UNTRUSTED JSON, so we duck-type defensively rather than trust
 * the static union — an unexpected `truncatedKind` value collapses to `null`
 * (the report then shows the generic degraded-origin copy, never a wrong claim).
 */
export function summaryTruncation(summary: unknown): {
  truncated: boolean;
  reason: string | null;
  kind: "coverage" | "backpressure" | null;
} {
  const s = summary as { truncated?: unknown; truncatedReason?: unknown; truncatedKind?: unknown } | null;
  const truncated = s?.truncated === true;
  const reason =
    truncated && typeof s?.truncatedReason === "string" && s.truncatedReason.trim().length > 0
      ? s.truncatedReason
      : null;
  const kind =
    s?.truncatedKind === "coverage" || s?.truncatedKind === "backpressure" ? s.truncatedKind : null;
  return { truncated, reason, kind };
}

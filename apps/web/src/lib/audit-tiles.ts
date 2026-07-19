import type { AuditSummary, RuleResult, Severity as CoreSeverity } from "@pseolint/core";
import type { TileState, TileMeta } from "@/components/landing/tile-grid";

const RANK: Record<CoreSeverity, number> = { info: 1, warning: 2, error: 3, critical: 4 };

// Storage holds blobs from multiple engine versions. Legacy v0.3 summaries have
// no bucketed `issues` object — they carry a flat `findings` array — so reading
// `summary.issues.blockers` unconditionally threw and took the whole dashboard
// route to the error boundary for any host whose latest audit was pre-v0.4.
function flattenIssues(summary: AuditSummary): RuleResult[] {
  const issues = summary.issues as AuditSummary["issues"] | undefined;
  if (issues) {
    return [...(issues.blockers ?? []), ...(issues.shouldFix ?? []), ...(issues.informational ?? [])];
  }
  return (summary as { findings?: RuleResult[] }).findings ?? [];
}

/** pageCount is required in every summary shape, but guard non-numeric legacy blobs
 *  so `new Array(total)` can't hit `RangeError: Invalid array length` on NaN. */
function pageCountOf(summary: AuditSummary): number {
  return typeof summary.pageCount === "number" && Number.isFinite(summary.pageCount) ? summary.pageCount : 0;
}

export function worstSeverityPerPage(summary: AuditSummary): Map<string, CoreSeverity> {
  const map = new Map<string, CoreSeverity>();
  for (const f of flattenIssues(summary)) {
    if (!f.pageUrl) continue;
    const prev = map.get(f.pageUrl);
    if (!prev || RANK[f.severity] > RANK[prev]) map.set(f.pageUrl, f.severity);
  }
  return map;
}

export function summaryToTileStates(summary: AuditSummary, max = 200): TileState[] {
  const total = Math.min(Math.max(pageCountOf(summary), 0), max);
  if (total === 0) return [];
  const perPage = worstSeverityPerPage(summary);
  const severities = Array.from(perPage.values()).sort((a, b) => RANK[b] - RANK[a]);
  const states: TileState[] = new Array(total).fill("clean");
  for (let i = 0; i < severities.length && i < total; i++) {
    states[i] = coreToTileState(severities[i]);
  }
  return states;
}

/**
 * Tile-level metadata (URL + tooltip) parallel to `summaryToTileStates`.
 * Same severity-desc ordering so meta[i] aligns with states[i]. When `host`
 * is provided, dirty tiles get an `href` to /dashboard/{host}/url/{encoded} —
 * converting the strip from decorative into navigational.
 */
export function summaryToTileMeta(
  summary: AuditSummary,
  host?: string,
  max = 200,
): TileMeta[] {
  const total = Math.min(Math.max(pageCountOf(summary), 0), max);
  if (total === 0) return [];
  const perPage = worstSeverityPerPage(summary);
  const dirtySorted = Array.from(perPage.entries())
    .map(([url, sev]) => ({ url, sev }))
    .sort((a, b) => RANK[b.sev] - RANK[a.sev]);

  return Array.from({ length: total }, (_, i) => {
    if (i < dirtySorted.length) {
      const { url, sev } = dirtySorted[i];
      const path = pathOf(url);
      return {
        label: `${sev.toUpperCase()} · ${path}`,
        href: host
          ? `/dashboard/${encodeURIComponent(host)}/url/${encodeURIComponent(url)}`
          : undefined,
      };
    }
    return { label: "Clean page · no findings" };
  });
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? `${u.host}/` : `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

export function severityCounts(summary: AuditSummary): {
  errors: number;
  warnings: number;
  infos: number;
} {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const f of flattenIssues(summary)) {
    if (f.severity === "critical" || f.severity === "error") errors++;
    else if (f.severity === "warning") warnings++;
    else if (f.severity === "info") infos++;
  }
  return { errors, warnings, infos };
}

export function cleanPageCount(summary: AuditSummary): number {
  const withFindings = worstSeverityPerPage(summary).size;
  return Math.max(0, pageCountOf(summary) - withFindings);
}

/**
 * Page-level breakdown by worst-severity-per-page. Tile colors are page-level;
 * surfacing this alongside the finding-level severity counts prevents the
 * "BLOCKERS 3 ≠ 3 red tiles" confusion (3 findings can land on 1 page).
 */
export function pagesByWorstSeverity(summary: AuditSummary): {
  blockers: number;
  shouldFix: number;
  info: number;
  clean: number;
} {
  const wp = worstSeverityPerPage(summary);
  let blockers = 0;
  let shouldFix = 0;
  let info = 0;
  for (const sev of wp.values()) {
    if (sev === "critical" || sev === "error") blockers++;
    else if (sev === "warning") shouldFix++;
    else info++;
  }
  return {
    blockers,
    shouldFix,
    info,
    clean: Math.max(0, pageCountOf(summary) - wp.size),
  };
}

function coreToTileState(sev: CoreSeverity): TileState {
  if (sev === "critical" || sev === "error") return "error";
  if (sev === "warning") return "warning";
  return "info";
}

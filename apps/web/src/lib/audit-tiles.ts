import type { AuditSummary, Severity as CoreSeverity } from "@pseolint/core";
import type { TileState } from "@/components/landing/tile-grid";

const RANK: Record<CoreSeverity, number> = { info: 1, warning: 2, error: 3, critical: 4 };

function flattenIssues(summary: AuditSummary) {
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
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
  const total = Math.min(Math.max(summary.pageCount, 0), max);
  if (total === 0) return [];
  const perPage = worstSeverityPerPage(summary);
  const severities = Array.from(perPage.values()).sort((a, b) => RANK[b] - RANK[a]);
  const states: TileState[] = new Array(total).fill("clean");
  for (let i = 0; i < severities.length && i < total; i++) {
    states[i] = coreToTileState(severities[i]);
  }
  return states;
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
  return Math.max(0, summary.pageCount - withFindings);
}

function coreToTileState(sev: CoreSeverity): TileState {
  if (sev === "critical" || sev === "error") return "error";
  if (sev === "warning") return "warning";
  return "info";
}

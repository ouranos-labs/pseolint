import type { Template, Verdict } from "@pseolint/core";
import { auditLog } from "@/lib/audit-log";

/** Numeric rank for each verdict step. Higher = worse. */
const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

export interface DegradedTemplate {
  signature: string;
  prevVerdict: Verdict;
  currentVerdict: Verdict;
  /** How many verdict steps worse (>= 1). */
  shift: number;
  topDriver: { ruleId: string; fireRate: number } | null;
  totalUrls: number;
}

/**
 * Compare two snapshots of `AuditSummary.templates` and return every template
 * whose verdict has worsened by at least one step on the ready→caution→concerning→critical ladder.
 *
 * Edge-cases handled:
 * - No prior templates → returns [] (no baseline)
 * - Template absent in prior run → returns [] for that signature (no baseline)
 * - Template absent in current run → not a degradation (structural change); returns []
 */
export function detectDegradedTemplates(
  prevTemplates: Template[],
  currTemplates: Template[],
): DegradedTemplate[] {
  if (!prevTemplates.length) return [];

  const prevBySignature = new Map(prevTemplates.map((t) => [t.signature, t]));
  const degraded: DegradedTemplate[] = [];

  for (const curr of currTemplates) {
    const prev = prevBySignature.get(curr.signature);
    if (!prev) continue; // new template — no baseline to compare

    const prevRank = VERDICT_RANK[prev.verdict];
    const currRank = VERDICT_RANK[curr.verdict];
    const shift = currRank - prevRank;

    if (shift >= 1) {
      degraded.push({
        signature: curr.signature,
        prevVerdict: prev.verdict,
        currentVerdict: curr.verdict,
        shift,
        topDriver: curr.variance.topDriver,
        totalUrls: curr.totalUrls,
      });
    }
  }

  return degraded;
}

/**
 * Fire `template_degraded` audit-log events for each degraded template.
 * Pure side-effect: one `auditLog` call per degraded entry.
 */
export function fireDegradedEvents(
  domainId: string,
  degraded: DegradedTemplate[],
): void {
  for (const t of degraded) {
    auditLog("template_degraded", {
      domainId,
      templateSignature: t.signature,
      prevVerdict: t.prevVerdict,
      currentVerdict: t.currentVerdict,
      shift: t.shift,
      topDriver: t.topDriver,
      totalUrls: t.totalUrls,
    });
  }
}

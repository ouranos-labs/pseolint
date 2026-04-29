import { db } from "@/db";
import { alertsDedup } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Severity } from "@pseolint/core";

export function isoWeekOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface AlertEvalInput {
  domainId: string;
  prevRisk: number | null;
  currentRisk: number;
  newCombinations: Array<{ ruleId: string; templateSignature: string; severity: Severity }>;
}

export interface AlertEvalResult {
  shouldAlert: boolean;
  reasons: Array<"risk_rise" | "new_error">;
  firingCombinations: Array<{ ruleId: string; templateSignature: string }>;
}

const RISK_RISE_THRESHOLD = 10;

export async function evaluateAlertGate(input: AlertEvalInput): Promise<AlertEvalResult> {
  const reasons: AlertEvalResult["reasons"] = [];
  const firing: AlertEvalResult["firingCombinations"] = [];

  // v0.4: alert when risk RISES (current - prev >= threshold). Lower risk = better.
  if (input.prevRisk !== null && (input.currentRisk - input.prevRisk) >= RISK_RISE_THRESHOLD) {
    reasons.push("risk_rise");
  }

  const critOrError = input.newCombinations.filter((c) => c.severity === "error" || c.severity === "critical");
  if (critOrError.length > 0) {
    const week = isoWeekOf(new Date());
    const existing = await db.select().from(alertsDedup).where(
      and(
        eq(alertsDedup.domainId, input.domainId),
        eq(alertsDedup.isoWeek, week),
        inArray(alertsDedup.ruleId, critOrError.map((c) => c.ruleId)),
      ),
    );
    const dedupSet = new Set(existing.map((r) => `${r.ruleId}::${r.templateSignature}`));
    for (const c of critOrError) {
      if (!dedupSet.has(`${c.ruleId}::${c.templateSignature}`)) {
        firing.push({ ruleId: c.ruleId, templateSignature: c.templateSignature });
      }
    }
    if (firing.length > 0) reasons.push("new_error");
  }

  return { shouldAlert: reasons.length > 0, reasons, firingCombinations: firing };
}

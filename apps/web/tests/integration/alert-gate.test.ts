import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { findingsState, monitoredDomains, users, alertsDedup } from "@/db/schema";
import { evaluateAlertGate, isoWeekOf } from "@/lib/alert-gate";
import { publicSlug } from "@/lib/slug";
import { eq } from "drizzle-orm";

describe("evaluateAlertGate", () => {
  let userId: string;
  let domainId: string;

  beforeEach(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, name: userId, email: `${userId}@ex.test`, emailVerified: false });
    const [d] = await db.insert(monitoredDomains).values({ slug: publicSlug(), userId, sourceUrl: "https://ex.com", host: "ex.com" }).returning();
    domainId = d.id;
  });

  it("triggers on score delta >= 10", async () => {
    const out = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 65, newCombinations: [] });
    expect(out.shouldAlert).toBe(true);
    expect(out.reasons).toContain("score_delta");
  });

  it("triggers on new critical/error combination not seen before", async () => {
    const out = await evaluateAlertGate({
      domainId, prevScore: 80, currentScore: 79,
      newCombinations: [{ ruleId: "spam/near-duplicate", templateSignature: "__global__", severity: "error" }],
    });
    expect(out.shouldAlert).toBe(true);
    expect(out.reasons).toContain("new_error");
  });

  it("does not trigger below thresholds", async () => {
    const out = await evaluateAlertGate({
      domainId, prevScore: 80, currentScore: 79,
      newCombinations: [{ ruleId: "content/missing-author", templateSignature: "sig", severity: "warning" }],
    });
    expect(out.shouldAlert).toBe(false);
  });

  it("dedups within the same ISO week", async () => {
    const combo = { ruleId: "spam/near-duplicate", templateSignature: "__global__", severity: "error" as const };
    const first = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 79, newCombinations: [combo] });
    expect(first.shouldAlert).toBe(true);
    await db.insert(alertsDedup).values({ domainId, ruleId: combo.ruleId, templateSignature: combo.templateSignature, isoWeek: isoWeekOf(new Date()) });
    const second = await evaluateAlertGate({ domainId, prevScore: 80, currentScore: 79, newCombinations: [combo] });
    expect(second.shouldAlert).toBe(false);
  });
});

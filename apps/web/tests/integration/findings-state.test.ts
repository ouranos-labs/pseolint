import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { findingsState, monitoredDomains, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mergeFindings } from "@/lib/findings-state";
import type { RuleResult } from "@pseolint/core";

describe("mergeFindings", () => {
  let userId: string;
  let domainId: string;

  beforeEach(async () => {
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(users).values({ id: userId, name: userId, email: `${userId}@example.test`, emailVerified: false });
    const [d] = await db.insert(monitoredDomains).values({
      userId, sourceUrl: "https://ex.com", host: "ex.com",
    }).returning();
    domainId = d.id;
  });

  it("inserts new finding with first/last seen equal", async () => {
    const findings: RuleResult[] = [
      { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" },
    ];
    await mergeFindings(domainId, findings, 1000);
    const rows = await db.select().from(findingsState).where(eq(findingsState.domainId, domainId));
    expect(rows).toHaveLength(1);
    expect(rows[0].firstSeenAt.getTime()).toBe(rows[0].lastSeenAt.getTime());
  });

  it("updates last_seen and page count on recurrence", async () => {
    const f: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" };
    await mergeFindings(domainId, [f], 1000);
    const t1 = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    await new Promise((r) => setTimeout(r, 5));
    await mergeFindings(domainId, [f, { ...f, pageUrl: "https://ex.com/p/2" }], 1000);
    const t2 = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    expect(t2.firstSeenAt.getTime()).toBe(t1.firstSeenAt.getTime());
    expect(t2.lastSeenAt.getTime()).toBeGreaterThan(t1.lastSeenAt.getTime());
  });

  it("does not resurrect dismissed findings", async () => {
    const f: RuleResult = { ruleId: "spam/thin-content", severity: "warning", message: "thin", pageUrl: "https://ex.com/p/1" };
    await mergeFindings(domainId, [f], 1000);
    await db.update(findingsState).set({ status: "dismissed" }).where(eq(findingsState.domainId, domainId));
    await mergeFindings(domainId, [f], 1000);
    const row = (await db.select().from(findingsState).where(eq(findingsState.domainId, domainId)))[0];
    expect(row.status).toBe("dismissed");
  });
});

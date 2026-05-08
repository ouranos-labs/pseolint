/**
 * Integration test: template-degraded event firing inside the monitoring pipeline.
 *
 * Strategy: mock all I/O (R2, DB, audit runner, email) and call the exported
 * `detectDegradedTemplates` / `fireDegradedEvents` helpers directly, then verify
 * the audit-log line is produced. We also test the no-prior-state edge case.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Template, AuditSummary, Verdict } from "@pseolint/core";

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTemplate(sig: string, verdict: Verdict): Template {
  return {
    signature: sig,
    totalUrls: 200,
    totalDiscoveredUrls: 2000,
    auditedUrls: ["https://ex.com/p/1"],
    verdict,
    risk: 40,
    categories: {
      integrity: { grade: "B", issues: 1 },
      discoverability: { grade: "A", issues: 0 },
      citation: { grade: "A", issues: 0 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    variance: { ruleFireRates: {}, uniformityScore: 0.8, topDriver: null },
    findingIds: [],
  };
}

// ── wiring tests ─────────────────────────────────────────────────────────────

describe("template-degraded monitoring wiring", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires template_degraded when prev summary has a lower verdict", async () => {
    const { detectDegradedTemplates, fireDegradedEvents } = await import("@/lib/template-degraded");

    const prev: Template[] = [makeTemplate("/listing/:slug", "caution")];
    const curr: Template[] = [makeTemplate("/listing/:slug", "critical")];

    const degraded = detectDegradedTemplates(prev, curr);
    fireDegradedEvents("domain-abc", degraded);

    const logCalls = (console.log as ReturnType<typeof vi.spyOn>).mock.calls;
    expect(logCalls).toHaveLength(1);
    const line = JSON.parse(logCalls[0][0]);
    expect(line.evt).toBe("template_degraded");
    expect(line.domainId).toBe("domain-abc");
    expect(line.templateSignature).toBe("/listing/:slug");
    expect(line.prevVerdict).toBe("caution");
    expect(line.currentVerdict).toBe("critical");
    expect(line.shift).toBe(2);
  });

  it("does NOT fire when there is no prior state (empty prev)", async () => {
    const { detectDegradedTemplates, fireDegradedEvents } = await import("@/lib/template-degraded");

    const curr: Template[] = [makeTemplate("/listing/:slug", "critical")];
    const degraded = detectDegradedTemplates([], curr);
    fireDegradedEvents("domain-abc", degraded);

    expect(console.log).not.toHaveBeenCalled();
  });

  it("does NOT fire for a new template without a prior run entry", async () => {
    const { detectDegradedTemplates, fireDegradedEvents } = await import("@/lib/template-degraded");

    const prev: Template[] = [makeTemplate("/listing/:slug", "caution")];
    const curr: Template[] = [
      makeTemplate("/listing/:slug", "caution"),
      makeTemplate("/new-template/:slug", "critical"), // new, no baseline
    ];
    const degraded = detectDegradedTemplates(prev, curr);
    fireDegradedEvents("domain-abc", degraded);

    expect(console.log).not.toHaveBeenCalled();
  });

  it("does NOT fire when a template disappears between runs (structural change)", async () => {
    const { detectDegradedTemplates, fireDegradedEvents } = await import("@/lib/template-degraded");

    const prev: Template[] = [
      makeTemplate("/listing/:slug", "caution"),
      makeTemplate("/category/:slug", "caution"),
    ];
    const curr: Template[] = [makeTemplate("/listing/:slug", "caution")]; // /category removed
    const degraded = detectDegradedTemplates(prev, curr);
    fireDegradedEvents("domain-abc", degraded);

    expect(console.log).not.toHaveBeenCalled();
  });

  it("fires once per degraded template when multiple degrade in the same run", async () => {
    const { detectDegradedTemplates, fireDegradedEvents } = await import("@/lib/template-degraded");

    const prev: Template[] = [
      makeTemplate("/a/:slug", "ready"),
      makeTemplate("/b/:slug", "caution"),
    ];
    const curr: Template[] = [
      makeTemplate("/a/:slug", "critical"),
      makeTemplate("/b/:slug", "critical"),
    ];
    const degraded = detectDegradedTemplates(prev, curr);
    fireDegradedEvents("domain-multi", degraded);

    const logCalls = (console.log as ReturnType<typeof vi.spyOn>).mock.calls;
    expect(logCalls).toHaveLength(2);
    const sigs = logCalls.map((c: unknown[]) => JSON.parse(c[0] as string).templateSignature).sort();
    expect(sigs).toEqual(["/a/:slug", "/b/:slug"]);
  });
});

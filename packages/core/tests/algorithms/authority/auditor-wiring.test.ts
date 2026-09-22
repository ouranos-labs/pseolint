import { describe, test, expect } from "vitest";
import { auditSource } from "../../../src/auditor.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VERDICT_RANK = { ready: 0, caution: 1, concerning: 2, critical: 3 } as const;

/**
 * Diverse unique pages so integrity stays healthy (allowAuthorityLenient true)
 * while discoverability issues still yield a non-ready verdict that authority
 * can soften. Near-identical pages would hit integrity D and correctly veto.
 */
function softenFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "auth-wire-"));
  const topics = [
    "Alpine hiking elevation tables and permit rules for granite ridge treks across national parks.",
    "Coastal sailing weather windows marina fees and fog harbor safety drills for weekend skippers.",
    "Urban beekeeping hive placement nectar calendars and neighbor ordinances for rooftop apiaries.",
    "Desert photography golden hour filters dust sealing tips for canyon landscape field kits.",
    "Fermentation brine ratios culture banks and cellar humidity control for home sauerkraut labs.",
    "Telescope collimation charts light pollution maps and eyepiece FOV math for backyard astronomers.",
    "Sourdough hydration tables preferment schedules and steam oven hacks for crusty boules.",
    "Kayak roll drills rescue tows and tidal current charts for cold water paddlers.",
  ];
  const manifest: Record<string, string> = {};
  topics.forEach((topic, i) => {
    const file = `p${i}.html`;
    const body = `${topic} ${topic} ${topic} `.repeat(25);
    writeFileSync(
      join(dir, file),
      `<html><head><title>Guide ${i}</title></head><body><h1>Guide ${i}</h1><p>${body}</p></body></html>`,
    );
    manifest[`https://demo.test/guide-${i}`] = file;
  });
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest));
  return dir;
}

/** 12 entity-swapped city pages — enough for a ≥10-member integrity cluster. */
function entitySwapClusterDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "auth-veto-"));
  const cities = [
    "Akron",
    "Toledo",
    "Columbus",
    "Cleveland",
    "Dayton",
    "Cincinnati",
    "Canton",
    "Youngstown",
    "Lima",
    "Mansfield",
    "Lorain",
    "Warren",
  ];
  const base =
    "Find the best plumber near you. Our plumbers are licensed and insured. " +
    "Call today for fast service. Serving all surrounding areas. " +
    "We offer emergency repairs, pipe installation, water heater replacement, " +
    "drain cleaning, and leak detection. Free estimates. Satisfaction guaranteed. " +
    "Licensed bonded insured. Family owned and operated since 1998. " +
    "Available 24 hours a day 7 days a week. No job too big or too small. ";
  const manifest: Record<string, string> = {};
  for (const city of cities) {
    const file = `${city.toLowerCase()}.html`;
    const body = `${base} Proudly serving the ${city} area. ${base}`;
    writeFileSync(
      join(dir, file),
      `<html><head><title>Plumber ${city}</title></head><body><h1>Emergency Plumber in ${city}</h1><p>${body}</p></body></html>`,
    );
    manifest[`https://demo.test/plumber-${city.toLowerCase()}`] = file;
  }
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest));
  return dir;
}

describe("authority wiring in auditSource", () => {
  test("a high-authority injected provider shifts the verdict leniently vs none", async () => {
    const dir = softenFixtureDir();
    const none = await auditSource(dir, { safeMode: "saas" });
    const high = await auditSource(dir, { safeMode: "saas", authorityScore: 95 });
    // explicit high authorityScore must not make the verdict stricter; for any non-ready verdict it is one tier more lenient.
    expect(VERDICT_RANK[high.verdict as keyof typeof VERDICT_RANK]).toBeLessThanOrEqual(
      VERDICT_RANK[none.verdict as keyof typeof VERDICT_RANK],
    );
    if (none.verdict !== "ready") {
      expect(VERDICT_RANK[high.verdict as keyof typeof VERDICT_RANK]).toBe(
        VERDICT_RANK[none.verdict as keyof typeof VERDICT_RANK] - 1,
      );
    }
    expect(high.authority?.score).toBe(95);
  });

  test("authority ≥80 does not soften a 12-page entity-swap integrity cluster", async () => {
    const dir = entitySwapClusterDir();
    const none = await auditSource(dir, { safeMode: "saas", strict: true });
    const high = await auditSource(dir, { safeMode: "saas", strict: true, authorityScore: 95 });

    const issues = [
      ...none.issues.blockers,
      ...none.issues.shouldFix,
      ...none.issues.informational,
    ];
    const swap = issues.find((f) => f.ruleId === "spam/entity-swap");
    expect(swap).toBeDefined();
    expect(swap!.severity).not.toBe("info");
    expect(
      swap!.context?.type === "cluster" ? swap!.context.clusterSize : 1,
    ).toBeGreaterThanOrEqual(10);

    // Lenient arm vetoed: high authority must not drop a tier.
    expect(VERDICT_RANK[high.verdict as keyof typeof VERDICT_RANK]).toBe(
      VERDICT_RANK[none.verdict as keyof typeof VERDICT_RANK],
    );
    expect(high.authority?.score).toBe(95);
  });
});

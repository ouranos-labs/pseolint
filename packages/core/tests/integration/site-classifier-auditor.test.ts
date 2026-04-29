/**
 * Integration test for v0.4 §4.11 — site classifier + rule suppression.
 *
 * Spins up a small "marketing site" fixture (5 distinct top-level pages with
 * varied content), runs `auditSource`, and asserts:
 *   1. `summary.siteClassification.type === "small-marketing"`
 *   2. `suppressedRules` lists the four pSEO-only rules
 *   3. NO `spam/template-*`, `spam/entity-swap`, or `cannibal/url-pattern`
 *      findings appear in any issue bucket (those rules were skipped)
 *   4. With `strict: true` the same audit produces an empty `suppressedRules`
 *      list (classification still computed; no rule suppression)
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { auditSource } from "../../src/auditor.js";
import type { AuditSummary, RuleResult } from "../../src/types.js";
import { PSEO_ONLY_RULE_IDS } from "../../src/site-classifier.js";

function allIssues(summary: AuditSummary): RuleResult[] {
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function buildSmallMarketingFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pseolint-classifier-"));
  tempDirs.push(dir);

  // Five distinct top-level pages with very different content. Each one is
  // > 300 words to clear thinContent threshold, and uses varied prose to
  // avoid near-duplicate / entity-swap pollution.
  const longA = Array.from({ length: 70 }, () =>
    "Our pricing model adapts to growing teams with transparent monthly invoicing tools.",
  ).join(" ");
  const longB = Array.from({ length: 70 }, () =>
    "The founding team built distributed systems at three different cloud providers previously.",
  ).join(" ");
  const longC = Array.from({ length: 70 }, () =>
    "Documentation for our platform spans onboarding guides, API references, and migration playbooks.",
  ).join(" ");
  const longD = Array.from({ length: 70 }, () =>
    "Customers in regulated industries use our compliance tooling for SOC2 and HIPAA workflows.",
  ).join(" ");
  const longE = Array.from({ length: 70 }, () =>
    "Reach out via the contact form below for partnerships, press, or enterprise sales conversations.",
  ).join(" ");

  await writeFile(
    join(dir, "index.html"),
    `<html><head><title>Acme — Home</title></head><body><h1>Acme platform</h1><p>${longA}</p></body></html>`,
    "utf-8",
  );
  await writeFile(
    join(dir, "about.html"),
    `<html><head><title>About Acme</title></head><body><h1>About</h1><p>${longB}</p></body></html>`,
    "utf-8",
  );
  await writeFile(
    join(dir, "docs.html"),
    `<html><head><title>Docs</title></head><body><h1>Docs</h1><p>${longC}</p></body></html>`,
    "utf-8",
  );
  await writeFile(
    join(dir, "customers.html"),
    `<html><head><title>Customers</title></head><body><h1>Customers</h1><p>${longD}</p></body></html>`,
    "utf-8",
  );
  await writeFile(
    join(dir, "contact.html"),
    `<html><head><title>Contact</title></head><body><h1>Contact</h1><p>${longE}</p></body></html>`,
    "utf-8",
  );
  return dir;
}

describe("auditSource + site classifier", () => {
  test("default audit on small-marketing fixture suppresses pSEO rules", async () => {
    const dir = await buildSmallMarketingFixture();
    const summary = await auditSource(dir);

    expect(summary.siteClassification).toBeDefined();
    expect(summary.siteClassification.type).toBe("small-marketing");
    expect(summary.siteClassification.suppressedRules).toEqual([...PSEO_ONLY_RULE_IDS]);

    // None of the suppressed pSEO-only rules should produce findings.
    const findings = allIssues(summary);
    for (const ruleId of PSEO_ONLY_RULE_IDS) {
      expect(
        findings.some((f) => f.ruleId === ruleId),
        `expected no findings for suppressed rule ${ruleId}`,
      ).toBe(false);
    }
  });

  test("--strict mode keeps classification but produces empty suppressedRules", async () => {
    const dir = await buildSmallMarketingFixture();
    const summary = await auditSource(dir, { strict: true });

    // Classification still computed.
    expect(summary.siteClassification.type).toBe("small-marketing");
    // Suppression overridden to empty.
    expect(summary.siteClassification.suppressedRules).toEqual([]);

    // The pSEO rules are now allowed to RUN (they may or may not fire on
    // this fixture; we only assert they were not pre-filtered).
    // Specifically, the audit should not throw and should produce a summary.
    expect(summary.pageCount).toBe(5);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every code path that inserts an audit for a MONITORED domain must inherit
 * that domain's `isPublic` flag, never hardcode it.
 *
 * This is a source-level check because the behaviour it protects only shows up
 * with a live Postgres and a week of elapsed cadence, which no unit test will
 * ever reproduce. The bug it guards against: each of these paths used to write
 * `isPublic: false`, so publishing a site from the UI worked until the next
 * scheduled run minted a fresh private audit and the site silently dropped off
 * the leaderboard. The symptom looked like "the leaderboard is broken" and the
 * cause was five scattered literals.
 *
 * Legitimate exceptions are listed explicitly: a one-off audit has no domain to
 * inherit from, and the seed job publishes by definition.
 */
const MONITORED_INSERT_PATHS = [
  "app/dashboard/domain-actions.ts",
  "lib/monitoring.ts",
  "inngest/functions/monitor-domains.ts",
];

describe("monitored-domain audits inherit the site's publish choice", () => {
  for (const rel of MONITORED_INSERT_PATHS) {
    it(`${rel} never hardcodes isPublic on an audit insert`, () => {
      const src = readFileSync(resolve(root, rel), "utf8");
      // Only flag the literal form. `isPublic: dom.isPublic` and friends pass.
      const hardcoded = src.match(/isPublic:\s*(true|false)\b/g) ?? [];
      expect(
        hardcoded,
        `${rel} hardcodes isPublic on an audit insert. Monitored audits must ` +
          `read the flag off the monitored_domain row, or publishing a site ` +
          `will be undone by the next scheduled run.`,
      ).toEqual([]);
    });
  }

  it("the one-off audit path may still decide visibility by plan", () => {
    // Not a monitored domain: /api/audits has no site row to inherit from, and
    // the free tier's bargain is that its audits are publicly shareable.
    const src = readFileSync(resolve(root, "app/api/audits/route.ts"), "utf8");
    expect(src).toContain('isPublic: plan !== "pro"');
  });

  it("the seed job still publishes, by definition", () => {
    const src = readFileSync(resolve(root, "inngest/functions/seed-leaderboard.ts"), "utf8");
    expect(src).toMatch(/isPublic:\s*true/);
  });
});

describe("publishing a site extends retention", () => {
  it("setDomainVisibilityAction stamps PERMANENT_EXPIRES_AT on newly eligible audits", () => {
    const src = readFileSync(resolve(root, "app/dashboard/domain-actions.ts"), "utf8");
    const action = src.slice(src.indexOf("export async function setDomainVisibilityAction"));
    const body = action.slice(0, action.indexOf("\nexport async function", 1));

    // run-audit only makes an audit permanent when it is eligible AT COMPLETION,
    // and monitored audits complete private. Without this the site lists and
    // then vanishes when its 30/90-day tier expiry lands.
    expect(body).toContain("PERMANENT_EXPIRES_AT");
    // ...and only for rows that actually qualify, mirroring isLeaderboardEligible.
    expect(body).toContain("LEADERBOARD_MIN_PAGES");
    expect(body).toContain("LEADERBOARD_RISK_MAX");
  });
});

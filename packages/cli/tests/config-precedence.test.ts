/**
 * Config-file precedence and schema surface.
 *
 * Three defects this covers, all found auditing a real monorepo where a
 * pseolint.config.json had been sitting inert:
 *
 *  1. `samplingStrategy` was the one flag that always produced a concrete value
 *     ("stratified") even when the user never passed --strategy, so a config-file
 *     value was overwritten on every run by a default nobody typed.
 *  2. `citationAllowlist` (and the two other content/citation-coverage knobs)
 *     exist on AuditOptions["rules"] and are consumed by the auditor, but were
 *     absent from the CLI's Zod schema — unreachable from a config file.
 *  3. Zod strips unknown keys silently, so a config written against an older
 *     schema parses to {} and the run proceeds as if no config existed.
 */
import { describe, expect, it } from "vitest";
import { mergeOptions } from "../src/config.js";

describe("mergeOptions: a config value survives an untyped CLI default", () => {
  it("keeps samplingStrategy from the config file when --strategy was not passed", () => {
    // `undefined` is what cli.ts now yields for a default --strategy.
    expect(mergeOptions({ samplingStrategy: "random" }, { samplingStrategy: undefined }).samplingStrategy).toBe("random");
  });

  it("still lets an explicit --strategy random win over the config", () => {
    expect(mergeOptions({ samplingStrategy: "stratified" }, { samplingStrategy: "random" }).samplingStrategy).toBe("random");
  });

  it("leaves samplingStrategy unset when neither side supplies one", () => {
    expect(mergeOptions({}, {}).samplingStrategy).toBeUndefined();
  });

  it("does not regress the other default-guarded numeric flags", () => {
    const cfg = { concurrency: 1, timeout: 5000, sampleSize: 10, maxPerTemplate: 12 };
    const merged = mergeOptions(cfg, {});
    expect(merged.concurrency).toBe(1);
    expect(merged.timeout).toBe(5000);
    expect(merged.sampleSize).toBe(10);
    expect(merged.maxPerTemplate).toBe(12);
  });
});

describe("config schema: content/citation-coverage knobs are expressible", () => {
  it("threads citationAllowlist through from a config file", () => {
    const merged = mergeOptions(
      { rules: { citationAllowlist: ["postgresql.org", "orm.drizzle.team"] } } as never,
      {},
    );
    expect(merged.rules?.citationAllowlist).toEqual(["postgresql.org", "orm.drizzle.team"]);
  });

  it("threads the claim/authoritative thresholds through", () => {
    const merged = mergeOptions(
      { rules: { citationCoverageMinClaims: 8, citationCoverageMinAuthoritative: 2 } } as never,
      {},
    );
    expect(merged.rules?.citationCoverageMinClaims).toBe(8);
    expect(merged.rules?.citationCoverageMinAuthoritative).toBe(2);
  });
});

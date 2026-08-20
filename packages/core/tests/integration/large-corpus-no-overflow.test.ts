import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditSource } from "../../src/auditor.js";

/**
 * Regression for the V8 argument-count overflow in the rule-aggregation push.
 *
 * The pairwise spam rules (spam/near-duplicate, spam/entity-swap) emit ONE
 * finding per similar pair, so a dense site produces C(N,2) findings. The old
 * `findings.push(...tag(rule.findings))` spread passed every finding as a
 * separate call argument, and V8 caps that (~131072): so the audit threw
 * `RangeError: Maximum call stack size exceeded` at the rule-aggregation step,
 * BEFORE enrichment was even reached. (The earlier enrichment-only regression
 * test missed this because it bypassed the rule-aggregation push.) Fixed by the
 * iterative `pushAll` helper in auditor.ts.
 *
 * This test drives the FULL public `auditSource` over a directory source (no
 * sampling → every page audited), so it covers the real pipeline order.
 */

const PAGES = 600;
const PAIR_COUNT = (PAGES * (PAGES - 1)) / 2; // 179,700 near-duplicate findings

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("large dense corpus does not overflow the call stack", () => {
  it("confirms the spread this guards against still overflows at the corpus's pair count on this runtime", () => {
    // Premise check. If a future V8 raises the arg cap above PAIR_COUNT this
    // fails loudly: bump PAGES so the integrated test below stays meaningful.
    expect(() => {
      const sink: number[] = [];
      sink.push(...new Array(PAIR_COUNT).fill(0));
    }).toThrow(RangeError);
  });

  it("audits 600 near-identical pages without a Maximum-call-stack crash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-bigcorpus-"));
    tempDirs.push(dir);

    // Identical visible body text → identical simhash → every C(600,2) pair
    // clears the near-duplicate threshold, maximising the pairwise finding count.
    const body = `<p>${"Identical boilerplate sentence about widgets and gadgets and things. ".repeat(40)}</p>`;
    await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        writeFile(
          join(dir, `page-${i}.html`),
          `<!doctype html><html><head><title>Page ${i}</title></head><body><h1>Heading ${i}</h1>${body}</body></html>`,
        ),
      ),
    );

    // strict: run every rule incl. the pairwise spam rules. No sampleSize → all
    // 600 pages audited (a filesystem source is never sampled by default).
    const summary = await auditSource(dir, { strict: true, backpressure: false });

    expect(summary).toBeDefined();
    // Prove the pairwise findings were actually generated (not silently sampled
    // away): enrichment collapses the 179,700 pair findings into one cluster
    // finding, which also exercises the enrich-findings min/max fix end-to-end.
    const allRuleIds = [
      ...summary.issues.blockers,
      ...summary.issues.shouldFix,
      ...summary.issues.informational,
    ].map((f) => f.ruleId);
    expect(allRuleIds).toContain("spam/near-duplicate");
  }, 120_000);
});

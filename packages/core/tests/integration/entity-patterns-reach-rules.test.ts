/**
 * Regression: user-configured `entityPatterns` must actually reach the rules.
 *
 * They were read from AuditOptions, regex-validated and eagerly compiled — and then dropped:
 * runRulesOnPages was called with [...DEFAULT_ENTITY_PATTERNS, ...derivedEntityPatterns], never
 * the merged set, so every configured pattern was silently discarded. The pre-existing coverage
 * asserted only that an audit with entityPatterns produced `pageCount === 1`, which passes whether
 * or not the patterns are used, so the defect was invisible.
 *
 * content/meta-uniqueness is the direct observable: it compares meta descriptions AFTER entity
 * masking. Two descriptions that differ only by a masked token collapse to one string and the rule
 * fires; leave the token unmasked and they are genuinely distinct, so it must not.
 *
 * `autoEntityMask: false` isolates the configured patterns from corpus auto-derivation, which would
 * otherwise mask the varying token by itself and hide the regression again.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { auditSource } from "../../src/index.js";

// Invented names, so the shipped defaults (US states, ZIP codes) cannot match them.
const page = (entity: string) =>
  `<html><head><title>${entity} platform guide</title>
   <meta name="description" content="How the ${entity} platform applies migrations in a fixed order."></head>
   <body><h1>${entity} platform guide</h1>
   <p>The ${entity} platform applies migrations in a fixed order and keeps a ledger of applied steps.</p>
   </body></html>`;

async function corpus(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pseolint-entity-patterns-"));
  await writeFile(join(dir, "a.html"), page("Zorbium"), "utf-8");
  await writeFile(join(dir, "b.html"), page("Quaffle"), "utf-8");
  return dir;
}

function ruleIds(summary: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return void x.forEach(walk);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.ruleId === "string") out.push(o.ruleId);
      else Object.values(o).forEach(walk);
    }
  };
  walk((summary as { issues?: unknown }).issues);
  return out;
}

test("a configured entityPattern is applied by the rules, not silently discarded", async () => {
  const summary = await auditSource(await corpus(), {
    autoEntityMask: false,
    entityPatterns: [{ placeholder: "[PRODUCT]", pattern: "Zorbium|Quaffle" }],
  } as never);
  // Masked, the two descriptions are byte-identical, which is exactly what the rule looks for.
  expect(ruleIds(summary)).toContain("content/meta-uniqueness");
});

test("the same corpus is clean when no pattern masks the differing token", async () => {
  const summary = await auditSource(await corpus(), { autoEntityMask: false } as never);
  // Control: without a matching pattern the descriptions genuinely differ. If this ever starts
  // firing, the test above has stopped proving anything.
  expect(ruleIds(summary)).not.toContain("content/meta-uniqueness");
});

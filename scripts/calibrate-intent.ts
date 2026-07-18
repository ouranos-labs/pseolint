/**
 * Tier-3 intent-moderation calibration.
 *
 * Runs the reputable + policy-violating corpus twice per site — intent
 * moderation OFF vs ON — against the committed offline fixtures + injected
 * content-effort scores (no network, no LLM, no spend). It answers the one
 * question that gates turning `intentModeration` on in production:
 *
 *   Does softening cluster-tolerant directories help REPUTABLE sites without
 *   ever wrongly softening a POLICY-VIOLATING farm?
 *
 * Guardrails (a single failure exits non-zero → tier 3 NOT safe to enable):
 *   1. Invariant: raw risk is identical off vs on for every site.
 *   2. Farm safety: NO policy-violating site softens (the effort floor must
 *      block them). A softened farm is a false positive.
 *   3. Reputable ceilings still hold with intent on (softening only helps).
 *
 * It also reports WINS — reputable sites that were over the ceiling with intent
 * off and land at/under it with intent on. Wins with zero farm regressions is
 * the green light to flip the default.
 *
 * Usage:  bun run scripts/calibrate-intent.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditSource } from "../packages/core/src/index.js";
import type { Archetype } from "../packages/core/src/index.js";
import type { AuditOptions, Verdict } from "../packages/core/src/types.js";
import { VERDICT_RANK, type CorpusSite } from "../packages/core/calibration/corpus-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAL = resolve(__dirname, "../packages/core/calibration");

const corpus = JSON.parse(readFileSync(resolve(CAL, "calibration-corpus.json"), "utf-8")) as { sites: CorpusSite[] };
const EFFORT: Record<string, number | null> = (() => {
  try {
    return (JSON.parse(readFileSync(resolve(CAL, "content-effort-scores.json"), "utf-8")) as {
      scores?: Record<string, number | null>;
    }).scores ?? {};
  } catch {
    return {};
  }
})();

/** Corpus archetype: explicit label, else derive from the site-type taxonomy. */
function archetypeOf(site: CorpusSite): Archetype | undefined {
  if (site.archetype) return site.archetype;
  if (site.expectedSiteType === "programmatic-directory") return "directory";
  return undefined;
}

const ansi = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", dim: "\x1b[2m", reset: "\x1b[0m" };
const rank = (v: Verdict) => VERDICT_RANK[v];

interface Row {
  url: string;
  cls: CorpusSite["class"];
  archetype: Archetype | undefined;
  effort: number | null | undefined;
  off: Verdict;
  on: Verdict;
  ceiling?: Verdict;
  riskOff: number;
  riskOn: number;
  softened: boolean;
}

async function run(): Promise<void> {
  const rows: Row[] = [];
  for (const site of corpus.sites) {
    const fixtureDir = site.localFixtureDir ? resolve(__dirname, "..", site.localFixtureDir) : null;
    if (!fixtureDir || !existsSync(fixtureDir)) continue; // offline only
    const effort = EFFORT[site.url];
    const archetype = archetypeOf(site);
    const base: AuditOptions = {
      safeMode: "saas",
      ...(typeof effort === "number" ? { contentEffortScore: effort } : {}),
    };
    const off = await auditSource(fixtureDir, base);
    const on = await auditSource(fixtureDir, { ...base, intentModeration: true, archetype });
    rows.push({
      url: site.url,
      cls: site.class,
      archetype,
      effort,
      off: off.verdict,
      on: on.verdict,
      ceiling: site.expectedVerdictCeiling,
      riskOff: off.risk,
      riskOn: on.risk,
      softened: rank(on.verdict) < rank(off.verdict),
    });
  }

  // ----- guardrails -----
  const riskChanged = rows.filter((r) => r.riskOff !== r.riskOn);
  const farmsSoftened = rows.filter((r) => r.cls === "policy-violating" && r.softened);
  const ceilingBroken = rows.filter(
    (r) => r.cls === "reputable" && r.ceiling != null && rank(r.on) > rank(r.ceiling),
  );
  const wins = rows.filter(
    (r) => r.cls === "reputable" && r.ceiling != null && rank(r.off) > rank(r.ceiling) && rank(r.on) <= rank(r.ceiling),
  );
  const reputableSoftened = rows.filter((r) => r.cls === "reputable" && r.softened);

  // ----- report -----
  console.log(`\n${"".padEnd(2)}Tier-3 intent-moderation calibration — ${rows.length} fixtured sites (offline)\n`);
  const changed = rows.filter((r) => r.softened);
  if (changed.length) {
    console.log("  Sites whose verdict changed (all softens; intent never escalates):");
    for (const r of changed) {
      const tone = r.cls === "policy-violating" ? ansi.r : ansi.g;
      console.log(
        `    ${tone}${r.off} → ${r.on}${ansi.reset}  ${r.cls.padEnd(16)} effort=${String(r.effort ?? "—").padStart(3)}  ${r.url}`,
      );
    }
  } else {
    console.log("  No verdict changed under intent moderation.");
  }

  const line = (ok: boolean, label: string, detail: string) =>
    console.log(`  ${ok ? ansi.g + "✓" : ansi.r + "✗"} ${label}${ansi.reset} ${ansi.dim}${detail}${ansi.reset}`);
  console.log("\n  Guardrails:");
  line(riskChanged.length === 0, "raw risk unchanged", `${riskChanged.length} sites differed`);
  line(farmsSoftened.length === 0, "no farm softened", `${farmsSoftened.length} policy-violating sites softened`);
  line(ceilingBroken.length === 0, "reputable ceilings hold", `${ceilingBroken.length} broke ceiling`);
  console.log(`\n  ${ansi.g}Wins: ${wins.length}${ansi.reset} reputable site(s) rescued to ≤ ceiling · ${reputableSoftened.length} reputable softened total`);
  for (const r of wins) console.log(`    ${ansi.g}win${ansi.reset} ${r.off} → ${r.on} (ceiling ${r.ceiling})  ${r.url}`);

  const safe = riskChanged.length === 0 && farmsSoftened.length === 0 && ceilingBroken.length === 0;
  console.log(
    `\n  ${safe ? ansi.g + "SAFE" : ansi.r + "UNSAFE"}${ansi.reset}: tier 3 ${safe ? "holds all guardrails on this corpus — flip the default when wins justify it." : "REGRESSED a guardrail — do not enable."}\n`,
  );
  process.exit(safe ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});

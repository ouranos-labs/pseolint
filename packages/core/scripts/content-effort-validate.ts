/**
 * Phase-1 content-effort re-validation runner (Task 5 of the SP1 plan).
 *
 * For each gated corpus fixture (class policy-violating | reputable with a
 * localFixtureDir), audits it OFFLINE (content-effort OFF — base audit only, no
 * network), judges per-template content effort, and prints two AUCs:
 *   - structural AUC: from summary.risk (the committed baseline ≈ 0.47)
 *   - content-effort AUC: from (100 - siteEffort) as the "risk" signal
 *
 * Run modes:
 *   - REAL:  bun scripts/content-effort-validate.ts            (needs ANTHROPIC_API_KEY)
 *   - STUB:  PSEO_EFFORT_STUB=1 bun scripts/content-effort-validate.ts   (no key, deterministic)
 *
 * STUB mode swaps in a deterministic scorer (distinct-word ratio × length
 * bucket) and a SEPARATE cache dir so it never touches the real LLM or the real
 * cache. The stub AUC is plumbing-only — a fake scorer — NOT the real signal.
 */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { auditSource, parseHtmlPage, createLanguageModel } from "../src/index.js";
import { judgeContentEffort, makeLlmGenerate, type TemplateSample } from "../src/algorithms/content-effort/judge.js";
import { calibrationMetrics, type ScoreRow, type ScoredAudit } from "../calibration/score.js";
import type { Corpus, CorpusSite, SiteClass } from "../calibration/corpus-types.js";

const HERE = import.meta.dir;
const REPO_ROOT = resolve(HERE, "..", "..", ".."); // packages/core/scripts -> repo root
const CORPUS_PATH = resolve(HERE, "..", "calibration", "calibration-corpus.json");

const STUB = !!process.env.PSEO_EFFORT_STUB;
const CACHE_DIR = resolve(HERE, "..", "calibration", STUB ? ".effort-cache-stub" : ".effort-cache");
const STRUCTURAL_BASELINE = 0.47;

/** Deterministic offline stub scorer: thin/repetitive text -> low, rich text -> higher. */
function stubScore(text: string): number {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length === 0) return 0;
  const distinctRatio = new Set(words).size / words.length; // 0..1, lower = more repetitive
  // Length bucket: very short pages cap low; longer pages can earn more.
  const lengthBucket = Math.min(1, words.length / 600); // saturates at ~600 words
  // Combine: original (high distinct ratio) + substantial (length) => high effort.
  const raw = 100 * (0.65 * distinctRatio + 0.35 * lengthBucket);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Build a TemplateSample[] for one fixture, resolving contentText via parseHtmlPage. */
function buildTemplates(site: CorpusSite, summary: { templates: { signature: string; auditedUrls: string[] }[]; auditedUrls?: string[] }): TemplateSample[] {
  const fixtureDir = resolve(REPO_ROOT, site.localFixtureDir!);
  // url -> relative html filename (the fixture's offline crawl map).
  const manifest = JSON.parse(readFileSync(join(fixtureDir, "_manifest.json"), "utf-8")) as Record<string, string>;

  const pageFor = (url: string): { url: string; contentText: string } | null => {
    const file = manifest[url];
    if (!file) return null; // url not in the fixture (e.g. a non-html asset) -> skip
    try {
      const html = readFileSync(join(fixtureDir, file), "utf-8");
      return { url, contentText: parseHtmlPage(html, url).contentText ?? "" };
    } catch {
      return null; // unreadable fixture file -> skip this page (non-fatal)
    }
  };

  const toSamples = (urls: string[]) =>
    urls.map(pageFor).filter((p): p is { url: string; contentText: string } => p !== null);

  // Template clustering is empty on these small fixtures (classifier -> unclear/
  // small-marketing), so fall back to ONE synthetic site-wide template over the
  // audited URLs. When real templates ARE detected, use their own auditedUrls.
  if (summary.templates.length > 0) {
    return summary.templates
      .map((t) => ({ signature: t.signature, samplePages: toSamples(t.auditedUrls) }))
      .filter((t) => t.samplePages.length > 0);
  }
  const all = toSamples(summary.auditedUrls ?? []);
  return all.length ? [{ signature: "site", samplePages: all }] : [];
}

/** ScoredAudit shape the scorer needs; calibrationMetrics only reads .risk, but fill the rest honestly. */
function scoredAudit(verdict: ScoredAudit["verdict"], risk: number): ScoredAudit {
  return { verdict, risk, firedRuleIds: [], suppressedRuleIds: [], demotedRuleIds: [] };
}

async function main() {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;

  // generate() selection: stub (offline, deterministic) vs real LLM.
  let generate: (text: string) => Promise<number>;
  let modelId: string;
  if (STUB) {
    modelId = "stub-distinct-length-v1";
    generate = async (text: string) => stubScore(text);
  } else {
    const requested = process.env.PSEO_EFFORT_MODEL ?? "claude-opus-4-8";
    const { model, modelId: resolvedId } = await createLanguageModel({ model: requested });
    modelId = resolvedId;
    generate = makeLlmGenerate(model);
  }

  console.log(`# content-effort validation (${STUB ? "STUB — offline, fake scorer" : "REAL LLM"}); model=${modelId}`);
  console.log(`# cache: ${CACHE_DIR}`);

  const structuralRows: ScoreRow[] = [];
  const effortRows: ScoreRow[] = [];
  const perFarm: { url: string; cls: SiteClass; risk: number; effort: number | null }[] = [];

  for (const site of corpus.sites) {
    if (!site.localFixtureDir) continue;
    const cls = site.class;
    if (cls !== "policy-violating" && cls !== "reputable") continue; // skip subjects (non-gated)

    const fixtureDir = resolve(REPO_ROOT, site.localFixtureDir);
    // Base audit only — content-effort is OFF here (no network, no LLM).
    const summary = await auditSource(fixtureDir, { safeMode: "saas" });

    structuralRows.push({ url: site.url, siteClass: cls, audit: scoredAudit(summary.verdict, summary.risk) });

    const templates = buildTemplates(site, { templates: summary.templates, auditedUrls: summary.auditedUrls });
    const { siteEffort } = await judgeContentEffort(templates, { modelId, cacheDir: CACHE_DIR, generate });

    perFarm.push({ url: site.url, cls, risk: summary.risk, effort: siteEffort });

    // Skip sites with no judgeable templates (siteEffort null = absent signal).
    if (siteEffort !== null) {
      // Invert: lower effort = higher "risk", so feed (100 - effort) as the score.
      effortRows.push({ url: site.url, siteClass: cls, audit: scoredAudit(summary.verdict, 100 - siteEffort) });
    }
  }

  const structural = calibrationMetrics(structuralRows);
  const effort = calibrationMetrics(effortRows);

  console.log("");
  console.log("## Per-site (risk = structural, effort = LLM/stub content-effort)");
  for (const f of [...perFarm].sort((a, b) => a.cls.localeCompare(b.cls) || a.url.localeCompare(b.url))) {
    const tag = f.cls === "policy-violating" ? "FARM" : "REPUT";
    const effStr = f.effort === null ? "null(absent)" : String(f.effort);
    console.log(`  [${tag}] risk=${String(f.risk).padStart(3)}  effort=${effStr.padStart(12)}  ${f.url}`);
  }

  // Which addressable farms does the effort signal MOVE (rank below the reputable
  // effort median => the signal would push them toward concerning)?
  const repEfforts = perFarm.filter((f) => f.cls === "reputable" && f.effort !== null).map((f) => f.effort as number);
  const repMedianEffort = repEfforts.length ? median(repEfforts) : NaN;
  console.log("");
  console.log(`## Farms moved by content-effort (effort <= reputable median effort ${Number.isFinite(repMedianEffort) ? repMedianEffort : "n/a"})`);
  const movedFarms = perFarm.filter((f) => f.cls === "policy-violating" && f.effort !== null && (f.effort as number) <= repMedianEffort);
  if (movedFarms.length === 0) console.log("  (none)");
  for (const f of movedFarms.sort((a, b) => (a.effort as number) - (b.effort as number))) {
    console.log(`  MOVED  effort=${String(f.effort).padStart(3)}  ${f.url}`);
  }

  console.log("");
  console.log(`structural AUC:     ${fmt(structural.auc)}  (n_pol=${structural.nPolicy}, n_rep=${structural.nReputable}; committed baseline ${STRUCTURAL_BASELINE})`);
  console.log(`content-effort AUC: ${fmt(effort.auc)}  (n_pol=${effort.nPolicy}, n_rep=${effort.nReputable}; skipped null-effort sites)`);
  if (STUB) {
    console.log("");
    console.log("NOTE: STUB mode — the content-effort AUC above is PLUMBING-ONLY (a fake");
    console.log("      distinct-word-ratio scorer), NOT the real LLM signal. The real gate");
    console.log("      still needs ANTHROPIC_API_KEY: bun scripts/content-effort-validate.ts");
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : "NaN");

await main();

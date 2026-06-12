# Entity Auto-Masking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive entity-mask patterns from the corpus under audit (tokens that vary across templated sibling pages) and merge them into `entityPatterns`, so masking consumers (`entity-swap`, `near-duplicate` proxies, `meta-uniqueness`, etc.) collapse templated pages to a common skeleton — closing the city-templated doorway blind spot.

**Architecture:** One pure module `algorithms/auto-entity-mask.ts` exporting `deriveEntityPatterns(pages, opts)`. It clusters pages by URL template (reusing `template-detection`'s normalizer), and within each cluster of ≥3 siblings collects tokens whose *presence varies across members* (constant template words appear in all members and are skipped; entities appear in a subset). Two token sources — URL-slug tokens and capitalized content tokens — feed the same "varying token" primitive. Wired into `auditor.ts` at one point; gated by a default-on `autoEntityMask` option. Measured against the committed two-sided baseline.

**Tech Stack:** TypeScript (NodeNext, `.js` import specifiers), vitest. The masker (`maskEntities`) and `EntityMaskPattern` (`{placeholder, pattern: RegExp}`) already exist.

**Spec:** `docs/superpowers/specs/2026-06-12-entity-auto-masking-design.md`.

---

## File Structure

- **Create** `packages/core/src/algorithms/auto-entity-mask.ts` — `deriveEntityPatterns` + helpers (pure, no I/O).
- **Create** `packages/core/tests/algorithms/auto-entity-mask.test.ts` — unit tests.
- **Modify** `packages/core/src/template-detection.ts` — `export` the existing `normalizePathToTemplate` (reuse the one normalizer).
- **Modify** `packages/core/src/auditor.ts` — compute derived patterns once before the group loop; merge at the `runRulesOnPages` call (line ~2754); read `options.autoEntityMask`.
- **Modify** `packages/core/src/types.ts` — add `autoEntityMask?: boolean` to `AuditOptions` (line ~442).
- **Modify** `packages/core/src/index.ts` — export `deriveEntityPatterns`.
- **Regenerate + commit** `packages/core/calibration/baseline-scorecard.json` after measuring.

Conventions: `.js` import specifiers for `.ts` sources; run core tests from `packages/core/` (`npx vitest run <file>`); the calibration runner is `bun run scripts/calibration-corpus.ts`.

---

## Task 1: Export the URL-template normalizer

**Files:** Modify `packages/core/src/template-detection.ts`

- [ ] **Step 1: Export `normalizePathToTemplate`**

In `packages/core/src/template-detection.ts`, change the private declaration:
```ts
function normalizePathToTemplate(pathname: string): string {
```
to:
```ts
export function normalizePathToTemplate(pathname: string): string {
```
(No other change — `urlToNormalizedTemplate` in the same file keeps using it.)

- [ ] **Step 2: Verify it still type-checks**

Run (from `packages/core`):
```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/template-detection.ts
git commit -m "refactor(core): export normalizePathToTemplate for reuse"
```

---

## Task 2: The `deriveEntityPatterns` module (TDD)

**Files:**
- Create: `packages/core/src/algorithms/auto-entity-mask.ts`
- Test: `packages/core/tests/algorithms/auto-entity-mask.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/algorithms/auto-entity-mask.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { deriveEntityPatterns } from "../../src/algorithms/auto-entity-mask.js";
import { maskEntities } from "../../src/algorithms/entity-mask.js";

function page(url: string, contentText: string) {
  return { url, contentText };
}

describe("deriveEntityPatterns — URL-slug varying tokens", () => {
  test("masks the varying city token, not the constant template words", () => {
    const pages = ["austin", "dallas", "houston"].map((c) =>
      page(`https://x.test/emergency-plumber-${c}`, `Emergency Plumber in ${c}`),
    );
    const patterns = deriveEntityPatterns(pages, { contentDiff: false });
    const masked = maskEntities("emergency plumber austin dallas", patterns);
    expect(masked).toContain("emergency plumber"); // constant words survive
    expect(masked).not.toMatch(/\baustin\b/i);     // varying tokens masked
    expect(masked).not.toMatch(/\bdallas\b/i);
  });

  test("ignores clusters smaller than minClusterSize", () => {
    const pages = [page("https://x.test/widget-austin", "a"), page("https://x.test/widget-dallas", "b")];
    expect(deriveEntityPatterns(pages, { minClusterSize: 3 })).toEqual([]);
  });
});

describe("deriveEntityPatterns — content-diff varying tokens", () => {
  test("masks a capitalized entity that varies across siblings, not shared headings", () => {
    const pages = ["Austin", "Dallas", "Houston"].map((c, i) =>
      page(`https://x.test/p${i}`, `Overview Section. Our office in ${c} serves clients.`),
    );
    // /p0../p2 normalize to distinct literal templates → put them in one cluster via shared slug
    const clustered = ["austin", "dallas", "houston"].map((c) =>
      page(`https://x.test/office-${c}-directory`, `Overview Section. Our office in ${c[0].toUpperCase()+c.slice(1)} serves clients.`),
    );
    const patterns = deriveEntityPatterns(clustered, { urlSlug: false });
    expect(maskEntities("Austin", patterns)).not.toMatch(/austin/i);
    expect(maskEntities("Overview Section", patterns)).toContain("Overview Section"); // shared → survives
  });
});

describe("deriveEntityPatterns — guards & determinism", () => {
  test("returns identical patterns on repeat runs (deterministic)", () => {
    const pages = ["austin", "dallas", "houston"].map((c) => page(`https://x.test/plumber-${c}`, `Plumber ${c}`));
    const a = deriveEntityPatterns(pages);
    const b = deriveEntityPatterns(pages);
    expect(a.map((p) => p.pattern.source)).toEqual(b.map((p) => p.pattern.source));
  });

  test("escapes regex metacharacters in tokens", () => {
    const pages = ["a.b", "c.d", "e.f"].map((s, i) => page(`https://x.test/x-${s}-${i}`, `t ${s}`));
    // should not throw when building the RegExp
    expect(() => deriveEntityPatterns(pages)).not.toThrow();
  });

  test("returns [] when no qualifying clusters", () => {
    expect(deriveEntityPatterns([])).toEqual([]);
  });

  test("skips common stopwords even if they vary", () => {
    const pages = ["the-austin", "and-dallas", "for-houston"].map((s) => page(`https://x.test/${s}-page`, "x"));
    const patterns = deriveEntityPatterns(pages, { contentDiff: false });
    expect(maskEntities("the and for", patterns)).toContain("the and for");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/core`):
```bash
npx vitest run tests/algorithms/auto-entity-mask.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/algorithms/auto-entity-mask.ts`:
```ts
import type { EntityMaskPattern, ParsedPage } from "../types.js";
import { normalizePathToTemplate } from "../template-detection.js";

export interface DeriveOptions {
  /** Only derive from URL-template clusters with at least this many siblings. */
  minClusterSize?: number; // default 3
  /** Ignore tokens shorter than this. */
  minTokenLength?: number; // default 3
  /** Placeholder substituted for masked entities. */
  placeholder?: string; // default "[ENTITY]"
  /** Enable URL-slug token derivation. */
  urlSlug?: boolean; // default true
  /** Enable capitalized-content-token derivation. */
  contentDiff?: boolean; // default true
  /** Hard cap on total derived tokens (over-masking guard). */
  maxTokens?: number; // default 500
}

type MaskPage = Pick<ParsedPage, "url" | "contentText">;

/** Tiny stopword set so varying function-words never become entities. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "our", "are",
  "you", "all", "new", "best", "top", "how", "what", "why", "who", "about",
  "page", "home", "more", "get", "buy", "free", "online", "now",
]);

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}

function rawSegments(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

/** Tokens from `:slug` path segments only (numeric `:n` segments are not name-entities). */
function urlSlugTokens(path: string): string[] {
  const tmplSegs = normalizePathToTemplate(path).replace(/^\//, "").split("/");
  const raw = rawSegments(path);
  const out: string[] = [];
  tmplSegs.forEach((t, i) => {
    if (t === ":slug" && raw[i]) {
      for (const tok of raw[i].split(/[-_]/)) out.push(tok.toLowerCase());
    }
  });
  return out;
}

const CONTENT_ENTITY_RE = /\b[A-Z][a-zA-Z]{2,}\b/g;
function contentEntityTokens(text: string): string[] {
  return (text.match(CONTENT_ENTITY_RE) ?? []).map((t) => t.toLowerCase());
}

/**
 * Tokens whose presence VARIES across cluster members: present in at least one
 * member but not in all. Constant template vocabulary (in every member) is
 * excluded; per-page entities (in a subset) are kept.
 */
function varyingTokens(perMember: string[][], minLen: number): Set<string> {
  const memberSets = perMember.map(
    (toks) => new Set(toks.filter((t) => t.length >= minLen && !STOPWORDS.has(t))),
  );
  const presence = new Map<string, number>();
  for (const s of memberSets) for (const t of s) presence.set(t, (presence.get(t) ?? 0) + 1);
  const n = memberSets.length;
  const out = new Set<string>();
  for (const [t, c] of presence) if (c >= 1 && c < n) out.add(t);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deriveEntityPatterns(pages: ReadonlyArray<MaskPage>, opts?: DeriveOptions): EntityMaskPattern[] {
  const minCluster = opts?.minClusterSize ?? 3;
  const minLen = opts?.minTokenLength ?? 3;
  const placeholder = opts?.placeholder ?? "[ENTITY]";
  const useUrl = opts?.urlSlug ?? true;
  const useContent = opts?.contentDiff ?? true;
  const maxTokens = opts?.maxTokens ?? 500;

  // Cluster pages by normalized URL template.
  const clusters = new Map<string, MaskPage[]>();
  for (const p of pages) {
    const tmpl = normalizePathToTemplate(pathOf(p.url));
    const bucket = clusters.get(tmpl);
    if (bucket) bucket.push(p);
    else clusters.set(tmpl, [p]);
  }

  const entities = new Set<string>();
  for (const members of clusters.values()) {
    if (members.length < minCluster) continue;
    if (useUrl) {
      for (const t of varyingTokens(members.map((m) => urlSlugTokens(pathOf(m.url))), minLen)) entities.add(t);
    }
    if (useContent) {
      for (const t of varyingTokens(members.map((m) => contentEntityTokens(m.contentText ?? "")), minLen)) entities.add(t);
    }
  }

  const tokens = [...entities].sort().slice(0, maxTokens);
  if (tokens.length === 0) return [];

  const CHUNK = 200;
  const patterns: EntityMaskPattern[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const alt = tokens.slice(i, i + CHUNK).map(escapeRegex).join("|");
    patterns.push({ placeholder, pattern: new RegExp(`\\b(?:${alt})\\b`, "gi") });
  }
  return patterns;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/core`):
```bash
npx vitest run tests/algorithms/auto-entity-mask.test.ts
```
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/auto-entity-mask.ts packages/core/tests/algorithms/auto-entity-mask.test.ts
git commit -m "feat(core): deriveEntityPatterns — corpus-derived entity masks (url-slug + content-diff)"
```

---

## Task 3: Wire into the auditor + option + export

**Files:**
- Modify: `packages/core/src/types.ts` (~line 442, `AuditOptions`)
- Modify: `packages/core/src/auditor.ts` (~line 2751, the `runRulesOnPages` call)
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the option to `AuditOptions`**

In `packages/core/src/types.ts`, inside `interface AuditOptions` (near `entityPatterns?:`, ~line 546), add:
```ts
  /** Auto-derive entity-mask patterns from the corpus (default true). Set false to A/B compare. */
  autoEntityMask?: boolean;
```

- [ ] **Step 2: Import `deriveEntityPatterns` in the auditor**

In `packages/core/src/auditor.ts`, add to the imports (near the other `./algorithms/*` imports):
```ts
import { deriveEntityPatterns } from "./algorithms/auto-entity-mask.js";
```

- [ ] **Step 3: Compute derived patterns once, before the group loop**

In `auditSource`, locate the group loop that contains the `runRulesOnPages(` call (the call is at ~line 2751, passing `DEFAULT_ENTITY_PATTERNS`). Immediately BEFORE that loop begins (where `parsedPagesAll` is already in scope), add:
```ts
    const derivedEntityPatterns =
      options?.autoEntityMask === false ? [] : deriveEntityPatterns(parsedPagesAll);
```
(If `parsedPagesAll` is not the variable name in scope, use the full parsed-and-sampled page array that the group loop iterates over. Confirm by reading the surrounding 30 lines.)

- [ ] **Step 4: Merge derived patterns at the call site**

At the `runRulesOnPages(...)` call (~line 2754), change the entity-patterns argument from:
```ts
      normalizeUrlOptions, source, DEFAULT_ENTITY_PATTERNS,
```
to:
```ts
      normalizeUrlOptions, source, [...DEFAULT_ENTITY_PATTERNS, ...derivedEntityPatterns],
```

- [ ] **Step 5: Export from index**

In `packages/core/src/index.ts`, add:
```ts
export { deriveEntityPatterns } from "./algorithms/auto-entity-mask.js";
```

- [ ] **Step 6: Type-check + run the existing suite**

Run (from `packages/core`):
```bash
npx tsc --noEmit -p tsconfig.json && npx vitest run tests/algorithms/ tests/calibration/score.test.ts
```
Expected: no type errors; algorithm + score tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/auditor.ts packages/core/src/index.ts
git commit -m "feat(core): wire corpus-derived entity masks into the auditor (default on)"
```

---

## Task 4: Measure against the baseline (staged) + commit the new baseline

This is the deliverable — a measured recall delta. Not TDD; it runs the calibration harness.

- [ ] **Step 1: Capture the current (pre-change) numbers from the committed baseline**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint && node -e "const b=require('./packages/core/calibration/baseline-scorecard.json'); const c=b.scorecard.confusion; console.log('BEFORE recall',(c.recall*100).toFixed(0)+'%','precision',(c.precision*100).toFixed(0)+'%','fp',c.fp); console.log('doorwayspam', b.perSiteVerdict['https://doorwayspam.example/']);"
```
Record: recall 44%, fp (reputable false positives), doorwayspam = `caution`.

- [ ] **Step 2: Stage A — measure URL-slug only**

Temporarily run a content-diff-off audit to isolate Strategy A. Run a one-off:
```bash
cd /d/phili/SSD_Projects/pseolint && bun -e '
import { auditSource } from "./packages/core/src/index.js";
const s = await auditSource("packages/core/calibration/fixtures/doorwayspam_example/", { safeMode: "saas" });
console.log("doorwayspam:", s.verdict, "risk", s.risk, "doorway-fired:",
  [...s.issues.blockers,...s.issues.shouldFix,...s.issues.informational].some(r=>r.ruleId==="spam/doorway-pattern"));
' 2>&1 | grep -v "AI triage"
```
Expected: `doorwayspam` now `concerning` (or higher) with `spam/doorway-pattern` fired (entity-swap ∧ thin). If it is still `caution` with doorway NOT fired, STOP and report — the masking isn't collapsing the pages (debug `deriveEntityPatterns` on these 7 URLs).

- [ ] **Step 3: Full harness run, diff vs baseline (do NOT overwrite yet)**

Run:
```bash
cd /d/phili/SSD_Projects/pseolint && rm -f scripts/calibration-results.json && timeout 280 bun run scripts/calibration-corpus.ts 2>&1 | grep -iE "Passed:|Failed:|Verdict regressions" ; node -e '
const cur=require("./scripts/calibration-results.json").scorecard.confusion;
const base=require("./packages/core/calibration/baseline-scorecard.json").scorecard.confusion;
console.log("recall", (base.recall*100).toFixed(0)+"% ->", (cur.recall*100).toFixed(0)+"%");
console.log("reputable FP", base.fp, "->", cur.fp, cur.fp>base.fp?"  *** REGRESSION ***":"  (ok)");
'
```
Expected: recall **up** vs 44%; reputable FP **not increased**. If reputable FP rose, investigate (over-masking or composite-gate weakness per spec §4) before proceeding — do NOT commit a baseline with a reputable regression.

- [ ] **Step 4: Commit the new baseline (records the improvement)**

Only if Step 3 shows recall up and FP not increased:
```bash
cd /d/phili/SSD_Projects/pseolint && bun run scripts/calibration-corpus.ts --write-baseline >/dev/null 2>&1 && rm -f scripts/calibration-results.json scripts/calibration-results.md && git add packages/core/calibration/baseline-scorecard.json && git commit -m "feat(calibration): new baseline after entity auto-masking — recall <before>% -> <after>%"
```
(Fill the real before/after numbers from Step 3 into the message.)

- [ ] **Step 5: Confirm the full suite is green (CI-sim)**

Run (from `packages/core`, with no ephemeral results present):
```bash
npx vitest run 2>&1 | tail -4
```
Expected: full suite green (the legacy soft-gate skips without ephemeral results).

---

## Self-Review

**Spec coverage:** §3.1 module + signature → Task 2. §3.2 URL-slug → Task 2 (`urlSlugTokens` + `varyingTokens`). §3.3 content-diff → Task 2 (`contentEntityTokens` + `varyingTokens`). §3.4 composition/determinism → Task 2 (sort, no randomness, chunked regex). §3.5 over-masking guard → Task 2 (`minClusterSize`, `minTokenLength`, STOPWORDS, `maxTokens`) + the harness ratchet in Task 4. §3.6 wiring/option/diagnostics → Task 3. §4 staged measurement + DoD → Task 4. Normalizer reuse → Task 1.

**Placeholder scan:** Code is complete in every step. The only intentional unknowns are the real before/after numbers (Task 4 Step 4 message) and a confirm-the-variable-name note (Task 3 Step 3) — both are verify-then-fill, not vague instructions.

**Type consistency:** `deriveEntityPatterns(pages, opts?)` returns `EntityMaskPattern[]` (matching the masker) and is used identically in Task 3's merge and Task 2's tests. `DeriveOptions` fields (`urlSlug`/`contentDiff`/`minClusterSize`) are used consistently across tests and impl. `MaskPage = Pick<ParsedPage,"url"|"contentText">` matches what `parsedPagesAll` (ParsedPage[]) provides.

**Known follow-ups (out of scope, per spec §1):** cluster-aware sampling; full normalizer unification; if content-diff (Strategy B) shows no marginal recall over URL-slug or causes FP, disable it via `contentDiff:false` at the wiring and revisit.

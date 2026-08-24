# Richer Deterministic Fact Extraction: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared deterministic fact extractor (`PageFacts`) and a new `content/citation-coverage` rule that counts named entities, authoritative citations, and grounded claims, while keeping `aeo/citable-facts` byte-for-byte frozen.

**Architecture:** A new `algorithms/fact-extraction.ts` module is the single source of truth for "what facts does this page carry." `aeo/citable-facts` delegates its numeric extraction to it (identical output). A new `content/citation-coverage` rule and the `content/value-add` composite consume the richer signals. All detectors are deterministic regex/DOM/URL-string, no LLM, no network.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), cheerio (already a core dep), vitest. Package `@pseolint/core`. Build: `bun run build` (tsc). Test: `bunx vitest run <path>` from `packages/core`.

**Spec:** `docs/superpowers/specs/2026-06-11-richer-fact-extraction-design.md`

**Conventions for this codebase (read before starting):**
- Core source lives in `packages/core/src`, tests in `packages/core/tests` (mirrors the `src` tree). The package test script globs `tests/**/*.test.ts`.
- ESM: every relative import ends in `.js` even though the file is `.ts` (e.g. `import { maskEntities } from "../algorithms/entity-mask.js"`).
- Rules return `RuleResult[]` (see `packages/core/src/types.ts`). Findings carry `ruleId`, `severity`, optional `confidence`, `message`, `fix`, `pageUrl`, `relatedUrls`.
- Run a single test file: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts`.
- After changing exported types/signatures, rebuild dist so downstream (`apps/web`) sees them: `cd packages/core && bun run build`.

---

## File Structure

- **Create** `packages/core/src/algorithms/fact-extraction.ts`: types (`PageFacts`, `FactSpan`, `NamedEntity`, `Citation`, `GroundedClaim`) + detectors (`extractCitableFacts`, `extractMeasurements`, `extractNamedEntities`, `classifyCitations`, `hasAuthoritativeCitation`, `extractGroundedClaims`, `extractPageFacts`, `registrableDomain`, `DEFAULT_CITATION_ALLOWLIST`).
- **Create** `packages/core/tests/algorithms/fact-extraction.test.ts`: unit tests for every detector + a `citable-facts` characterization test.
- **Modify** `packages/core/src/rules/aeo/citable-facts.ts`: delegate numeric extraction to the shared module (frozen behavior).
- **Create** `packages/core/src/rules/content/citation-coverage.ts`: new rule.
- **Create** `packages/core/tests/rules/content/citation-coverage.test.ts`: rule tests.
- **Modify** `packages/core/src/index.ts`: export the new module + rule.
- **Modify** `packages/core/src/types.ts`: add `AuditOptions.rules` knobs.
- **Modify** `packages/core/src/auditor.ts`: register the rule + thread options/defaults.
- **Modify** `packages/core/src/rules/scope.ts`: `RULE_SCOPE["content/citation-coverage"] = "page"`.
- **Modify** `packages/core/src/rule-references.ts`: add the Google policy ref.
- **Modify** `packages/core/src/site-classifier.ts`: add to `PSEO_ONLY_RULE_IDS` (suppressed on small-marketing/blog).
- **Modify** `packages/core/src/rules/content/value-add.ts`: fold authoritative-citation detection into the existing E-E-A-T "sources" category (no new signal, weighting preserved).

---

## Task 1: PageFacts types + numeric extractors (citableFacts frozen + measurements)

**Files:**
- Create: `packages/core/src/algorithms/fact-extraction.ts`
- Test: `packages/core/tests/algorithms/fact-extraction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/algorithms/fact-extraction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  extractCitableFacts,
  extractMeasurements,
} from "../../src/algorithms/fact-extraction.js";

describe("extractCitableFacts (frozen numeric subset)", () => {
  it("extracts money, percent, timeframe, month-date, isoDate, form; dedupes lowercased", () => {
    const text =
      "It costs $1,200.00, grew 45% in 30 days by March 5, 2024 (2024-03-05). File Form W-9. Again $1,200.00.";
    const facts = extractCitableFacts(text);
    expect(facts).toContain("$1,200.00");
    expect(facts).toContain("45%");
    expect(facts).toContain("30 days");
    expect(facts).toContain("march 5, 2024");
    expect(facts).toContain("2024-03-05");
    expect(facts).toContain("form w-9");
    // dedupe: $1,200.00 appears twice -> one entry
    expect(facts.filter((f) => f === "$1,200.00")).toHaveLength(1);
  });

  it("does NOT count bare word-counts as facts (e.g. '300 words')", () => {
    expect(extractCitableFacts("This page has 300 words of content.")).toEqual([]);
  });
});

describe("extractMeasurements (new, NOT part of citableFacts)", () => {
  it("extracts ratios and unit measurements", () => {
    const m = extractMeasurements("3 out of 4 users; 1 in 5 fail; weighs 12 kg over 250 ms.");
    const values = m.map((x) => x.value);
    expect(values).toContain("3 out of 4");
    expect(values).toContain("1 in 5");
    expect(values).toContain("12 kg");
    expect(values).toContain("250 ms");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts`
Expected: FAIL, cannot resolve `../../src/algorithms/fact-extraction.js`.

- [ ] **Step 3: Create the module with types + numeric extractors**

Create `packages/core/src/algorithms/fact-extraction.ts`:

```ts
import { load } from "cheerio";
import { maskEntities } from "./entity-mask.js";
import type { EntityMaskPattern, ParsedPage } from "../types.js";

export type FactKind =
  | "money" | "percent" | "timeframe" | "date" | "isoDate" | "form"
  | "ratio" | "measurement";

export interface FactSpan {
  value: string;
  kind: FactKind;
}

export interface NamedEntity {
  value: string;
  source: "proper-noun" | "cue-word" | "json-ld";
  type?: "organization" | "person" | "product" | "law" | "standard" | "place" | "other";
}

export interface Citation {
  href: string;
  domain: string;
  authority: "authoritative" | "general";
  reason?: "tld" | "allowlist";
}

export interface GroundedClaim {
  sentence: string;
  facts: string[];
  citations: string[];
}

export interface PageFacts {
  /** EXACTLY today's extractRawFacts() output (run on entity-masked text). Frozen. */
  citableFacts: string[];
  measurements: FactSpan[];
  namedEntities: NamedEntity[];
  citations: Citation[];
  groundedClaims: GroundedClaim[];
}

// --- Numeric "citable" facts: the frozen subset aeo/citable-facts counts. ---
// These six patterns are lifted verbatim from rules/aeo/citable-facts.ts and
// MUST stay byte-identical to preserve the calibration corpus.
const CITABLE_FACT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "dollar", regex: /\$[\d,]+(\.\d{2})?/g },
  { name: "percent", regex: /\b\d+(\.\d+)?\s*%/g },
  {
    name: "timeframe",
    regex: /\b\d+(?:-\d+)?\s*(business\s+days?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
  },
  {
    name: "date",
    regex:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
  },
  { name: "isoDate", regex: /\b\d{4}-\d{2}-\d{2}\b/g },
  { name: "form", regex: /\bForm\s+[A-Z0-9][A-Z0-9-]*\b/g },
];

export function extractCitableFacts(text: string): string[] {
  const out = new Set<string>();
  for (const { regex } of CITABLE_FACT_PATTERNS) {
    const matches = text.match(regex);
    if (!matches) continue;
    for (const m of matches) out.add(m.trim().toLowerCase());
  }
  return Array.from(out);
}

// --- Measurements: NEW numeric kinds, deliberately separate from citableFacts. ---
const MEASUREMENT_UNITS =
  "kg|g|lb|lbs|oz|mi|km|cm|mm|ft|in|MB|GB|TB|KB|ms|fps|mph|kWh";
const MEASUREMENT_PATTERNS: Array<{ kind: FactKind; regex: RegExp }> = [
  { kind: "ratio", regex: /\b\d+(?:\.\d+)?\s*(?:out of|in)\s*\d+\b/gi },
  { kind: "ratio", regex: /\b\d+\s*:\s*\d+\b/g },
  { kind: "measurement", regex: new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:${MEASUREMENT_UNITS})\\b`, "g") },
];

export function extractMeasurements(maskedText: string): FactSpan[] {
  const seen = new Set<string>();
  const out: FactSpan[] = [];
  for (const { kind, regex } of MEASUREMENT_PATTERNS) {
    const matches = maskedText.match(regex);
    if (!matches) continue;
    for (const m of matches) {
      const value = m.replace(/\s+/g, " ").trim().toLowerCase();
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, kind });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts`
Expected: PASS (4 assertions across 3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/fact-extraction.ts packages/core/tests/algorithms/fact-extraction.test.ts
git commit -m "feat(core): fact-extraction module, frozen citable facts + measurements"
```

---

## Task 2: Refactor aeo/citable-facts to delegate (characterization test)

**Files:**
- Modify: `packages/core/src/rules/aeo/citable-facts.ts`
- Test: `packages/core/tests/algorithms/fact-extraction.test.ts` (append characterization block)

- [ ] **Step 1: Write the failing characterization test**

Append to `packages/core/tests/algorithms/fact-extraction.test.ts`:

```ts
import { citableFactsRule } from "../../src/rules/aeo/citable-facts.js";
import type { ParsedPage } from "../../src/types.js";

function fakePage(url: string, contentText: string): ParsedPage {
  return {
    url, title: "", titleSource: "none", metaDescription: "", canonical: "",
    robotsMeta: "", og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText, html: `<html><body>${contentText}</body></html>`,
  };
}

describe("aeo/citable-facts characterization (frozen after refactor)", () => {
  it("produces the expected messages on a 2-page fixture", () => {
    const pages = [
      fakePage("https://x.test/a", "Costs $50 and $99. Filed March 5, 2024. Took 3 days."),
      fakePage("https://x.test/b", "Only one fact here: 10%."),
    ];
    const findings = citableFactsRule(pages, []);
    const byUrl = Object.fromEntries(findings.map((f) => [f.pageUrl, f]));
    // page a: 4 unique facts (<8) -> warning; page b: 1 unique fact (<3) -> error
    expect(byUrl["https://x.test/a"]?.severity).toBe("warning");
    expect(byUrl["https://x.test/a"]?.message).toContain("4 unique citable facts");
    expect(byUrl["https://x.test/b"]?.severity).toBe("error");
    expect(byUrl["https://x.test/b"]?.message).toContain("1 unique citable fact");
  });
});
```

- [ ] **Step 2: Run to verify it PASSES against the current implementation first**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "characterization"`
Expected: PASS, this locks current behavior BEFORE the refactor. (If it fails, the expected message strings are wrong; fix the test to match current output before refactoring.)

- [ ] **Step 3: Refactor citable-facts.ts to delegate**

In `packages/core/src/rules/aeo/citable-facts.ts`, delete the local `FACT_PATTERNS` array and the `extractRawFacts` function, and import the shared extractor. Replace the top of the file:

```ts
import type { Confidence, EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import { extractCitableFacts } from "../../algorithms/fact-extraction.js";
```

Then inside `citableFactsRule`, replace the line:

```ts
    const rawFacts = extractRawFacts(masked);
```

with:

```ts
    const rawFacts = extractCitableFacts(masked);
```

Leave everything else (the `applyEntityMask`, template-fact thresholds, severity/confidence ladder, message strings) untouched.

- [ ] **Step 4: Run the characterization test + the existing citable-facts test**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts tests/rules/aeo/citable-facts.test.ts`
Expected: PASS for both, identical behavior, now backed by the shared module.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/aeo/citable-facts.ts packages/core/tests/algorithms/fact-extraction.test.ts
git commit -m "refactor(core): citable-facts delegates to shared fact-extraction (behavior frozen)"
```

---

## Task 3: Named-entity detection

**Files:**
- Modify: `packages/core/src/algorithms/fact-extraction.ts`
- Test: `packages/core/tests/algorithms/fact-extraction.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { extractNamedEntities } from "../../src/algorithms/fact-extraction.js";

describe("extractNamedEntities", () => {
  it("detects acronyms, cue-word orgs, and JSON-LD entities; dedupes", () => {
    const text = "The GDPR and the Federal Trade Commission reviewed it. The GDPR again.";
    const jsonLd = [{ "@type": "Organization", name: "Acme Corp" }];
    const ents = extractNamedEntities(text, jsonLd).map((e) => e.value);
    expect(ents).toContain("gdpr");
    expect(ents).toContain("federal trade commission");
    expect(ents).toContain("acme corp");
    expect(ents.filter((e) => e === "gdpr")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "extractNamedEntities"`
Expected: FAIL, `extractNamedEntities` is not exported.

- [ ] **Step 3: Implement `extractNamedEntities`**

Add to `fact-extraction.ts`:

```ts
const MULTI_WORD_PROPER_NOUN = /\b[A-Z][a-z]+(?:\s+(?:of\s+|de\s+|and\s+|the\s+)?[A-Z][a-z]+)+\b/g;
const ACRONYM = /\b(?:ISO|GDPR|HIPAA|FDA|SEC|FTC|EPA|W3C|IETF|RFC|NIST|OSHA|IRS|EU|UN|WHO|CCPA|PCI)\b/g;
const CUE_WORD = /\b(?:Inc|LLC|Ltd|Corp|GmbH|Act|Regulation|Directive|Agency|Department|Bureau|Commission|Authority|University|Institute|Association|Standard|Protocol)\b/;

const JSON_LD_ENTITY_TYPES = new Set([
  "Organization", "GovernmentOrganization", "Corporation", "NGO",
  "Person", "Product", "Brand",
]);

function jsonLdEntities(nodes: unknown[]): NamedEntity[] {
  const out: NamedEntity[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const name = obj["name"];
    if (typeof name === "string" && typeof type === "string" && JSON_LD_ENTITY_TYPES.has(type)) {
      out.push({ value: name.trim().toLowerCase(), source: "json-ld", type: "organization" });
    }
    for (const v of Object.values(obj)) visit(v);
  };
  nodes.forEach(visit);
  return out;
}

export function extractNamedEntities(maskedText: string, jsonLd: unknown[] = []): NamedEntity[] {
  const seen = new Set<string>();
  const out: NamedEntity[] = [];
  const push = (value: string, source: NamedEntity["source"]): void => {
    const v = value.replace(/\s+/g, " ").trim().toLowerCase();
    if (v.length < 2 || seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, source });
  };
  for (const m of jsonLdEntities(jsonLd)) push(m.value, "json-ld");
  for (const m of maskedText.match(ACRONYM) ?? []) push(m, "cue-word");
  for (const m of maskedText.match(MULTI_WORD_PROPER_NOUN) ?? []) {
    push(m, CUE_WORD.test(m) ? "cue-word" : "proper-noun");
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "extractNamedEntities"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/fact-extraction.ts packages/core/tests/algorithms/fact-extraction.test.ts
git commit -m "feat(core): named-entity detection (acronyms, cue-words, JSON-LD)"
```

---

## Task 4: Citation classification

**Files:**
- Modify: `packages/core/src/algorithms/fact-extraction.ts`
- Test: `packages/core/tests/algorithms/fact-extraction.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import {
  classifyCitations,
  hasAuthoritativeCitation,
  registrableDomain,
} from "../../src/algorithms/fact-extraction.js";

describe("registrableDomain", () => {
  it("handles plain and multi-part suffixes", () => {
    expect(registrableDomain("www.example.com")).toBe("example.com");
    expect(registrableDomain("sub.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("nih.gov")).toBe("nih.gov");
  });
});

describe("classifyCitations", () => {
  const pageUrl = "https://mysite.com/post";
  it("classifies external links by TLD and allowlist; drops internal", () => {
    const hrefs = [
      "https://mysite.com/other",          // internal -> dropped
      "https://www.epa.gov/report",        // .gov -> authoritative (tld)
      "https://en.wikipedia.org/wiki/X",   // allowlist -> authoritative
      "https://randomblog.com/x",          // general
    ];
    const cites = classifyCitations(hrefs, pageUrl);
    expect(cites).toHaveLength(3);
    expect(cites.find((c) => c.domain === "epa.gov")?.authority).toBe("authoritative");
    expect(cites.find((c) => c.domain === "epa.gov")?.reason).toBe("tld");
    expect(cites.find((c) => c.domain === "wikipedia.org")?.reason).toBe("allowlist");
    expect(cites.find((c) => c.domain === "randomblog.com")?.authority).toBe("general");
    expect(hasAuthoritativeCitation(hrefs, pageUrl)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "Citation|registrableDomain"`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement citation classification**

Add to `fact-extraction.ts`:

```ts
export const DEFAULT_CITATION_ALLOWLIST: readonly string[] = [
  "wikipedia.org", "w3.org", "iso.org", "ietf.org", "rfc-editor.org",
  "doi.org", "nih.gov", "ncbi.nlm.nih.gov", "who.int", "schema.org",
  "oecd.org", "worldbank.org", "europa.eu",
];

const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "ac.uk", "gov.uk", "org.uk", "com.au", "gov.au", "edu.au",
  "co.jp", "co.nz", "co.za", "com.br",
]);

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

export function registrableDomain(host: string): string {
  const labels = host.replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

function isAuthoritativeTld(host: string): boolean {
  return /\.(?:gov|edu|mil|int)$/.test(host) || /\.(?:gov|edu|ac)\.[a-z]{2}$/.test(host);
}

export function classifyCitations(
  resolvedHrefs: readonly string[],
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): Citation[] {
  const pageHost = hostOf(pageUrl);
  const pageDomain = pageHost ? registrableDomain(pageHost) : null;
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const href of resolvedHrefs) {
    const host = hostOf(href);
    if (!host) continue;
    const domain = registrableDomain(host);
    if (pageDomain && domain === pageDomain) continue; // internal link
    if (seen.has(href)) continue;
    seen.add(href);
    if (isAuthoritativeTld(host)) {
      out.push({ href, domain, authority: "authoritative", reason: "tld" });
    } else if (allowlist.some((d) => host === d || host.endsWith(`.${d}`))) {
      out.push({ href, domain, authority: "authoritative", reason: "allowlist" });
    } else {
      out.push({ href, domain, authority: "general" });
    }
  }
  return out;
}

export function hasAuthoritativeCitation(
  resolvedHrefs: readonly string[],
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): boolean {
  return classifyCitations(resolvedHrefs, pageUrl, allowlist).some((c) => c.authority === "authoritative");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "Citation|registrableDomain"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/fact-extraction.ts packages/core/tests/algorithms/fact-extraction.test.ts
git commit -m "feat(core): citation classification (TLD + allowlist, registrable-domain external check)"
```

---

## Task 5: Grounded claims + extractPageFacts orchestrator

**Files:**
- Modify: `packages/core/src/algorithms/fact-extraction.ts`
- Test: `packages/core/tests/algorithms/fact-extraction.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { extractGroundedClaims, extractPageFacts } from "../../src/algorithms/fact-extraction.js";

describe("extractGroundedClaims", () => {
  it("flags a block that has a statistic AND an outbound citation", () => {
    const html =
      '<main><p>Emissions fell 30% last year, per the <a href="https://epa.gov/data">EPA</a>.</p>' +
      "<p>This paragraph has 12% but no link.</p>" +
      '<p>This one links to <a href="https://epa.gov/x">EPA</a> but states no number.</p></main>";
    const claims = extractGroundedClaims(html, "https://mysite.com/p");
    expect(claims).toHaveLength(1);
    expect(claims[0].facts).toContain("30%");
    expect(claims[0].citations[0]).toContain("epa.gov");
  });
});

describe("extractPageFacts", () => {
  it("assembles all five buckets", () => {
    const page = {
      url: "https://mysite.com/p",
      contentText: "Costs $50. 3 out of 4 users. The FDA approved it.",
      html: '<main><p>Costs $50, says the <a href="https://fda.gov/x">FDA</a>.</p></main>',
      resolvedHrefs: ["https://fda.gov/x"],
      jsonLd: [],
    };
    const facts = extractPageFacts(page, []);
    expect(facts.citableFacts).toContain("$50");
    expect(facts.measurements.map((m) => m.value)).toContain("3 out of 4");
    expect(facts.namedEntities.map((e) => e.value)).toContain("fda");
    expect(facts.citations[0].authority).toBe("authoritative");
    expect(facts.groundedClaims).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts -t "Grounded|extractPageFacts"`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement claims + orchestrator**

Add to `fact-extraction.ts`:

```ts
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'(])/;

function resolveHrefs(hrefs: string[], base: string): string[] {
  const out: string[] = [];
  for (const h of hrefs) {
    try { out.push(new URL(h, base).href); } catch { /* skip unparseable */ }
  }
  return out;
}

/**
 * Deterministic approximation of "a verifiable claim": a block (<p>/<li>) that
 * contains a statistic AND an outbound citation. Approximated at block level,
 * not exact sentence level: documented limitation. Detects co-occurrence, not
 * semantic truth. Consume at `speculative` confidence.
 */
export function extractGroundedClaims(
  html: string,
  pageUrl: string,
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): GroundedClaim[] {
  const $ = load(html);
  $("nav, header, footer, aside, script, style, noscript").remove();
  const claims: GroundedClaim[] = [];
  const scope = $("article").length > 0 ? $("article") : $("main").length > 0 ? $("main") : $("body");
  scope.find("p, li").each((_i, el) => {
    const $el = $(el);
    const rawLinks = $el.find("a[href]").map((_j, a) => String($(a).attr("href") ?? "")).get();
    const citations = classifyCitations(resolveHrefs(rawLinks, pageUrl), pageUrl, allowlist);
    if (citations.length === 0) return;
    const text = $el.text().replace(/\s+/g, " ").trim();
    for (const sentence of text.split(SENTENCE_SPLIT)) {
      const facts = [
        ...extractCitableFacts(sentence),
        ...extractMeasurements(sentence).map((m) => m.value),
      ];
      if (facts.length === 0) continue;
      claims.push({
        sentence: sentence.trim().slice(0, 240),
        facts,
        citations: citations.map((c) => c.href),
      });
      break; // one grounded claim per block is enough; avoids over-counting
    }
  });
  return claims;
}

export function extractPageFacts(
  page: Pick<ParsedPage, "url" | "contentText" | "html" | "resolvedHrefs" | "jsonLd">,
  entityPatterns: EntityMaskPattern[],
  allowlist: readonly string[] = DEFAULT_CITATION_ALLOWLIST,
): PageFacts {
  const masked = maskEntities(page.contentText, entityPatterns);
  return {
    citableFacts: extractCitableFacts(masked),
    measurements: extractMeasurements(masked),
    namedEntities: extractNamedEntities(masked, page.jsonLd),
    citations: classifyCitations(page.resolvedHrefs, page.url, allowlist),
    groundedClaims: extractGroundedClaims(page.html, page.url, allowlist),
  };
}
```

- [ ] **Step 4: Run the FULL extractor test file**

Run: `cd packages/core && bunx vitest run tests/algorithms/fact-extraction.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/algorithms/fact-extraction.ts packages/core/tests/algorithms/fact-extraction.test.ts
git commit -m "feat(core): grounded-claim detection + extractPageFacts orchestrator"
```

---

## Task 6: Export from the package barrel

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the export**

In `packages/core/src/index.ts`, after the existing `export * from "./algorithms/entity-mask.js";` line, add:

```ts
export * from "./algorithms/fact-extraction.js";
```

- [ ] **Step 2: Build to verify the barrel compiles**

Run: `cd packages/core && bun run build`
Expected: tsc completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export fact-extraction from package barrel"
```

---

## Task 7: content/citation-coverage rule

**Files:**
- Create: `packages/core/src/rules/content/citation-coverage.ts`
- Test: `packages/core/tests/rules/content/citation-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/rules/content/citation-coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { citationCoverageRule } from "../../../src/rules/content/citation-coverage.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string, contentText: string, hrefs: string[]): ParsedPage {
  return {
    url, title: "", titleSource: "none", metaDescription: "", canonical: "",
    robotsMeta: "", og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: hrefs, structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText, html,
  };
}

describe("content/citation-coverage", () => {
  it("fires when a page makes many quantified claims but cites no authoritative source", () => {
    const text = "Up 30%, down 12%, 45% growth, 3 days, $99, 7 weeks more.";
    const html = `<main><p>${text}</p></main>`;
    const findings = citationCoverageRule([page("https://x.test/a", html, text, [])], [], {});
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/citation-coverage");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
  });

  it("stays silent when the page cites an authoritative source", () => {
    const text = "Up 30%, down 12%, 45% growth, 3 days, $99, 7 weeks.";
    const html = `<main><p>${text} <a href="https://epa.gov/x">EPA</a></p></main>`;
    const findings = citationCoverageRule(
      [page("https://x.test/a", html, text, ["https://epa.gov/x"])], [], {},
    );
    expect(findings).toHaveLength(0);
  });

  it("stays silent on a low-claim page (a blog/contact page)", () => {
    const text = "Welcome to my blog. I write about gardening and life.";
    const html = `<main><p>${text}</p></main>`;
    const findings = citationCoverageRule([page("https://x.test/a", html, text, [])], [], {});
    expect(findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && bunx vitest run tests/rules/content/citation-coverage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the rule**

Create `packages/core/src/rules/content/citation-coverage.ts`:

```ts
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import { extractPageFacts } from "../../algorithms/fact-extraction.js";

export interface CitationCoverageOptions {
  /** Quantified-claim count at/above which an authoritative citation is expected. Default: 4. */
  minClaims?: number;
  /** Authoritative citations below which the rule fires (when claims >= minClaims). Default: 1. */
  minAuthoritative?: number;
  /** Extra authoritative domains, merged with the extractor default allowlist. */
  allowlist?: readonly string[];
}

export function citationCoverageRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: CitationCoverageOptions,
): RuleResult[] {
  const minClaims = options?.minClaims ?? 4;
  const minAuthoritative = options?.minAuthoritative ?? 1;
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const facts = extractPageFacts(page, entityPatterns, options?.allowlist);
    // "Quantified claims": distinct numeric facts + measurements + grounded claims.
    const quantified = new Set<string>([
      ...facts.citableFacts,
      ...facts.measurements.map((m) => m.value),
    ]);
    const statClaims = quantified.size + facts.groundedClaims.length;
    const authoritative = facts.citations.filter((c) => c.authority === "authoritative").length;

    if (statClaims < minClaims) continue;
    if (authoritative >= minAuthoritative) continue;

    const entityNames = facts.namedEntities.slice(0, 4).map((e) => e.value).join(", ");
    const entityNote = entityNames ? ` (${facts.namedEntities.length} named entities: ${entityNames})` : "";

    findings.push({
      ruleId: "content/citation-coverage",
      severity: "warning",
      // Low in general; the grounded-claim portion is speculative. A page can
      // legitimately make claims without citing (opinion, first-party data).
      confidence: "low",
      message:
        `${page.url} makes ${statClaims} quantified claim${statClaims === 1 ? "" : "s"} ` +
        `but cites ${authoritative} authoritative source${authoritative === 1 ? "" : "s"}${entityNote}.`,
      pageUrl: page.url,
      fix:
        "Cite the primary sources behind your numbers, link the statute, standard, dataset, " +
        ".gov/.edu page, or research that backs each statistic. AI Overviews and Google's " +
        "helpful-content systems weight pages that ground claims in authoritative references. " +
        "Note: this rule detects statistic+citation co-occurrence, not semantic correctness.",
    });
  }

  return findings;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/core && bunx vitest run tests/rules/content/citation-coverage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/content/citation-coverage.ts packages/core/tests/rules/content/citation-coverage.test.ts
git commit -m "feat(core): content/citation-coverage rule (unsourced-claims detector)"
```

---

## Task 8: Wire the rule into the engine

**Files:**
- Modify: `packages/core/src/types.ts` (AuditOptions.rules knobs)
- Modify: `packages/core/src/auditor.ts` (defaults, resolution, invocation, import)
- Modify: `packages/core/src/index.ts` (export rule)
- Modify: `packages/core/src/rules/scope.ts`
- Modify: `packages/core/src/rule-references.ts`
- Modify: `packages/core/src/site-classifier.ts`

- [ ] **Step 1: Add option knobs to `AuditOptions.rules` in types.ts**

In `packages/core/src/types.ts`, inside the `rules?: { ... }` block of `AuditOptions` (after `templateCoverageMinPages?: number;`), add:

```ts
    /** content/citation-coverage: quantified-claim count that expects a citation. */
    citationCoverageMinClaims?: number;
    /** content/citation-coverage: authoritative-citation floor below which it fires. */
    citationCoverageMinAuthoritative?: number;
    /** content/citation-coverage: extra authoritative domains merged with defaults. */
    citationAllowlist?: readonly string[];
```

- [ ] **Step 2: Register scope, reference, and suppression**

In `packages/core/src/rules/scope.ts`, in the `// content` block of `RULE_SCOPE`, add:

```ts
  "content/citation-coverage": "page",
```

In `packages/core/src/rule-references.ts`, after the `content/eeat-signals` line, add:

```ts
  "content/citation-coverage": "https://developers.google.com/search/docs/fundamentals/creating-helpful-content#eeat",
```

In `packages/core/src/site-classifier.ts`, add `"content/citation-coverage"` to the `PSEO_ONLY_RULE_IDS` array (so it's suppressed on `small-marketing`/`blog` sites, which legitimately cite less):

```ts
  "content/citation-coverage",
```

- [ ] **Step 3: Wire into auditor.ts (import, defaults, resolution, invocation)**

In `packages/core/src/auditor.ts`:

(a) After the citable-facts import (`import { citableFactsRule } from "./rules/aeo/citable-facts.js";`), add:

```ts
import { citationCoverageRule } from "./rules/content/citation-coverage.js";
```

(b) In the `DEFAULTS` object (near `templateCoverageMinPages: 5,`), add:

```ts
  citationCoverageMinClaims: 4,
  citationCoverageMinAuthoritative: 1,
```

(c) In the `resolvedRules` resolution block (near `templateCoverageMinPages: options?.rules?.templateCoverageMinPages ?? DEFAULTS.templateCoverageMinPages,`), add:

```ts
    citationCoverageMinClaims:
      options?.rules?.citationCoverageMinClaims ?? DEFAULTS.citationCoverageMinClaims,
    citationCoverageMinAuthoritative:
      options?.rules?.citationCoverageMinAuthoritative ?? DEFAULTS.citationCoverageMinAuthoritative,
```

(d) Add the matching field types to the inline `resolvedRules` type literal where the other `*: number;` knobs are declared (the block around `templateCoverageMinPages: number;`):

```ts
    citationCoverageMinClaims: number;
    citationCoverageMinAuthoritative: number;
```

(e) In the "Content rules" invocation section (right after the `content/eeat-signals` block near line 794), add:

```ts
  if (isEnabled("content/citation-coverage") && modeOk("content/citation-coverage")) {
    pushAll(findings, tag(citationCoverageRule(pages, entityPatterns, {
      minClaims: resolvedRules.citationCoverageMinClaims,
      minAuthoritative: resolvedRules.citationCoverageMinAuthoritative,
      allowlist: options?.rules?.citationAllowlist,
    })));
  }
```

(f) In `packages/core/src/index.ts`, after `export * from "./rules/content/eeat-signals.js";`, add:

```ts
export * from "./rules/content/citation-coverage.js";
```

- [ ] **Step 4: Build + run the whole core test suite**

Run: `cd packages/core && bun run build && bunx vitest run`
Expected: tsc clean; all tests PASS (new + existing). If a site-classifier test enumerates suppressed rule counts, update its expected count to include the new rule.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/auditor.ts packages/core/src/index.ts packages/core/src/rules/scope.ts packages/core/src/rule-references.ts packages/core/src/site-classifier.ts
git commit -m "feat(core): wire content/citation-coverage into auditor (scope, refs, options, suppression)"
```

---

## Task 9: Feed authoritative citations into value-add (weighting preserved)

**Files:**
- Modify: `packages/core/src/rules/content/value-add.ts`
- Test: `packages/core/tests/rules/content/value-add.test.ts`

Rationale: do NOT add an 8th signal (that would shift the 1/7 mean and disturb value-add's 0.3/0.5 calibration). Instead, enrich the EXISTING "sources/references" E-E-A-T category so an authoritative outbound citation counts the same as a "Sources:" heading. Net effect: only relaxes (raises value); never creates new findings.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/tests/rules/content/value-add.test.ts` (reuse the file's existing page-factory helper if present; otherwise inline one like the citation-coverage test):

```ts
import { citableFactsRule } from "../../../src/rules/aeo/citable-facts.js"; // if needed by helper
// ... (use the existing helper in this file to build a ParsedPage) ...

it("counts an authoritative outbound citation toward the E-E-A-T sources category", () => {
  // A page with NO 'Sources:' text but a .gov citation should get the sources credit,
  // raising its E-E-A-T signal vs. an identical page with neither.
  const withCitation = makePage({
    url: "https://x.test/cited",
    html: '<main><p>Body. <a href="https://epa.gov/x">EPA</a></p></main>',
    resolvedHrefs: ["https://epa.gov/x"],
  });
  const withoutCitation = makePage({
    url: "https://x.test/uncited",
    html: "<main><p>Body.</p></main>",
    resolvedHrefs: [],
  });
  const a = valueAddRule([withCitation], []);
  const b = valueAddRule([withoutCitation], []);
  // The cited page should never score worse than the uncited one on E-E-A-T.
  // Concretely: if the uncited page fires value-add, the cited page's message
  // E-E-A-T percentage is >= the uncited one's. (Assert no regression / improvement.)
  const eeatPct = (msg?: string) => Number(msg?.match(/E-E-A-T: (\d+)%/)?.[1] ?? "0");
  expect(eeatPct(a[0]?.message)).toBeGreaterThanOrEqual(eeatPct(b[0]?.message));
});
```

> Note: adapt `makePage` to the helper already used in `value-add.test.ts`. If the file builds pages inline, copy that exact construction.

- [ ] **Step 2: Run to verify it fails or is inconclusive**

Run: `cd packages/core && bunx vitest run tests/rules/content/value-add.test.ts -t "authoritative outbound citation"`
Expected: FAIL, without the change, the `.gov` link does not affect the E-E-A-T count.

- [ ] **Step 3: Enrich `countEeatCategories` in value-add.ts**

In `packages/core/src/rules/content/value-add.ts`, add the import at the top:

```ts
import { hasAuthoritativeCitation } from "../../algorithms/fact-extraction.js";
```

Change the "sources/references" line inside `countEeatCategories` from:

```ts
  if (EEAT_HTML_PATTERNS.some((p) => p.test(page.html))) count += 1;
```

to:

```ts
  if (
    EEAT_HTML_PATTERNS.some((p) => p.test(page.html)) ||
    hasAuthoritativeCitation(page.resolvedHrefs, page.url)
  ) count += 1;
```

The signal stays one of four E-E-A-T categories; the 7-signal mean denominator is unchanged.

- [ ] **Step 4: Run value-add tests**

Run: `cd packages/core && bunx vitest run tests/rules/content/value-add.test.ts`
Expected: PASS (new test + existing tests unchanged, the change only relaxes, so existing assertions about firing pages should hold; if an existing test asserted an exact E-E-A-T % on a page that happens to have a .gov link, update it).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/content/value-add.ts packages/core/tests/rules/content/value-add.test.ts
git commit -m "feat(core): value-add counts authoritative citations toward E-E-A-T (weighting preserved)"
```

---

## Task 10: Rebuild dist + dogfood regression on the web app

**Files:**
- Modify: `apps/web/src/lib/marketing-rules.test.ts` (extend dogfood to include the new rule)

- [ ] **Step 1: Rebuild core dist so apps/web sees the new rule**

Run: `cd packages/core && bun run build`
Expected: clean.

- [ ] **Step 2: Add the new rule to the web dogfood test**

In `apps/web/src/lib/marketing-rules.test.ts`, import `citationCoverageRule` from `@pseolint/core` and add a test that it does not fire on the `/rules` pages (they cite the engine and Google policy URLs):

```ts
import { citationCoverageRule } from "@pseolint/core";

it("no /rules page trips content/citation-coverage", () => {
  const findings = citationCoverageRule(rulePages, NO_ENTITY_PATTERNS, {});
  const hits = onRulePages(findings);
  expect(hits, `citation-coverage fired on rule pages:\n${describeFindings(hits)}`).toEqual([]);
});
```

> If this test fails, it means a rule explainer makes ≥4 quantified claims but links to zero `.gov`/allowlisted source. That is expected for some pages: the marketing pages link to `developers.google.com` (not authoritative by TLD). Decision point during execution: either (a) add `developers.google.com` to the dogfood call's `allowlist`, or (b) accept the warning as correct signal and assert it does not ERROR. Prefer (a) for the dogfood since Google's own docs ARE the authoritative source these pages cite.

- [ ] **Step 3: Run the web dogfood test**

Run: `cd apps/web && bunx vitest run src/lib/marketing-rules.test.ts`
Expected: PASS (after applying the allowlist decision above).

- [ ] **Step 4: Run the full core suite once more**

Run: `cd packages/core && bunx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing-rules.test.ts
git commit -m "test(web): dogfood content/citation-coverage on /rules pages"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** shared extractor (Tasks 1,3,4,5), `PageFacts` shape (Task 1+5), frozen citable-facts + characterization (Task 2), named entities w/ JSON-LD + masking (Task 3), citation classification TLD+allowlist (Task 4), grounded claims speculative (Task 5), new `content/citation-coverage` rule + site-type suppression (Tasks 7,8), value-add wiring without weight shift (Task 9), tests incl. dogfood (Tasks 1-10). Calibration stability via characterization (Task 2) + suppression (Task 8) + relax-only value-add (Task 9). ✓
- **Out-of-scope** items (LLM verification, 0–100 value score, off-page DA, live URL checks, the `/rules/citation-coverage` marketing page) are not tasked here: correct. ✓
- **Type consistency:** `extractCitableFacts`, `extractMeasurements`, `extractNamedEntities`, `classifyCitations`, `hasAuthoritativeCitation`, `extractGroundedClaims`, `extractPageFacts`, `registrableDomain`, `DEFAULT_CITATION_ALLOWLIST`, `citationCoverageRule`, `CitationCoverageOptions` are used consistently across tasks. ✓
- **Open execution decisions (flagged inline):** (1) Task 8 Step 4: update any site-classifier suppressed-count test. (2) Task 9: adapt to the existing `value-add.test.ts` page helper. (3) Task 10, allowlist `developers.google.com` for the dogfood. None are placeholders; each has a concrete resolution.

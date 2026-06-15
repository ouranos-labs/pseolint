import { describe, it, expect } from "vitest";
import {
  parseHtmlPage,
  thinContentRule,
  uniqueValueRule,
  contentModularityRule,
  metaUniquenessRule,
  citableFactsRule,
  answerFirstRule,
  citationCoverageRule,
  commonPhraseReuseRule,
  type ParsedPage,
  type EntityMaskPattern,
  type RuleResult,
} from "@pseolint/core";
import { MARKETING_RULES, type MarketingRule } from "@/lib/marketing-rules";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";
import {
  resolveSources,
  SOURCE_LIBRARY,
  type MarketingSourceRef,
} from "@/lib/marketing-sources";

/**
 * Dogfood contract for /rules/[ruleId] explainer pages (Task T7).
 *
 * pseolint audits its own site. Every rule explainer we add must clear
 * pseolint's OWN rules — specifically spam/thin-content, content/unique-value,
 * and aeo/content-modularity (the acceptance set for T7), plus we hold the line
 * on aeo/answer-first and content/meta-uniqueness so new pages don't regress.
 *
 * Rather than mock the engine, this suite runs the REAL rules from
 * @pseolint/core against a faithful reconstruction of each page's main content
 * (the same fields the rules/[ruleId]/page.tsx template renders, parsed through
 * the same parseHtmlPage extractor a live audit uses). The corpus also includes
 * the symptom and tool pages so the cross-page rules (unique-value, citable
 * facts, meta-uniqueness) see the realistic shared-vocabulary baseline they
 * would on pseolint.dev — making this test at least as strict as production.
 */

const SITE = "https://pseolint.dev";
const NO_ENTITY_PATTERNS: EntityMaskPattern[] = [];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Render a long-form field the way the <Prose> helper does: one <p> per \n\n block. */
function prose(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

/** Render the Sources section the way SourcesSection does: real <a href> links
 *  (so resolvedHrefs picks up the authoritative citations) plus the note text. */
function sourcesBlock(refs: readonly MarketingSourceRef[]): string {
  if (!refs || refs.length === 0) return "";
  const items = resolveSources(refs)
    .map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a> — ${esc(s.note)}</li>`)
    .join("");
  return `<h2>Sources</h2><ul>${items}</ul>`;
}

/** Render the optional "in practice" worked-example paragraphs, mirroring
 *  WorkedExampleSection (page's own voice — counts toward unique-value). */
function extraBlock(paragraphs: readonly string[] | undefined): string {
  if (!paragraphs || paragraphs.length === 0) return "";
  return `<h2>In practice</h2>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}`;
}

/** Reconstruct the rule page's <main> content, mirroring rules/[ruleId]/page.tsx. */
function buildRuleHtml(rule: MarketingRule): string {
  return [
    "<!doctype html><html><head>",
    `<title>${esc(rule.title)} · pseolint</title>`,
    `<meta name="description" content="${esc(rule.metaDescription)}">`,
    "</head><body><main>",
    `<div>Rule reference / ${esc(rule.ruleId)}</div>`,
    `<h1>${esc(rule.title)}</h1>`,
    `<p>${esc(rule.oneLiner)}</p>`,
    `<h2>What it detects</h2>${prose(rule.whatItDetects)}`,
    `<h2>Why it matters</h2>${prose(rule.whyItMatters)}`,
    // [data-example]: mirrors rules/[ruleId]/page.tsx — quoted illustrations the
    // engine's content-quality rules exclude (so an explainer that quotes a bad
    // pattern isn't flagged for teaching it).
    `<h2>A page that fails</h2><div data-example><p>${esc(rule.failingExample)}</p></div>`,
    `<h2>A page that passes</h2><div data-example><p>${esc(rule.passingExample)}</p></div>`,
    `<h2>How to fix it</h2><ol>${rule.howToFix.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`,
    `<h2>SpamBrain context</h2>${prose(rule.spamBrainContext)}`,
    `<h2>Frequently asked questions</h2><dl>${rule.faqs
      .map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
      .join("")}</dl>`,
    extraBlock(rule.extra),
    sourcesBlock(rule.sources),
    "</main></body></html>",
  ].join("");
}

function buildTextHtml(
  title: string,
  metaDescription: string,
  parts: string[],
  sources: readonly MarketingSourceRef[] = [],
  extra: readonly string[] = [],
): string {
  return [
    "<!doctype html><html><head>",
    `<title>${esc(title)} · pseolint</title>`,
    `<meta name="description" content="${esc(metaDescription)}">`,
    "</head><body><main>",
    `<h1>${esc(title)}</h1>`,
    parts.map((p) => `<p>${esc(p)}</p>`).join(""),
    extraBlock(extra),
    sourcesBlock(sources),
    "</main></body></html>",
  ].join("");
}

const rulePages: ParsedPage[] = MARKETING_RULES.map((r) =>
  parseHtmlPage(buildRuleHtml(r), `${SITE}/rules/${r.slug}`),
);

const symptomPages: ParsedPage[] = MARKETING_SYMPTOMS.map((s) =>
  parseHtmlPage(
    buildTextHtml(s.title, s.metaDescription, [
      s.oneLiner,
      s.whatYouSee,
      ...s.likelyCauses.map((c) => `${c.cause} ${c.explanation}`),
      ...s.diagnosticSteps,
      s.caseStudy,
      ...s.faqs.map((f) => `${f.q} ${f.a}`),
      s.recoveryTimeline,
    ], s.sources, s.extra),
    `${SITE}/symptoms/${s.slug}`,
  ),
);

const toolPages: ParsedPage[] = MARKETING_TOOLS.map((t) =>
  parseHtmlPage(
    buildTextHtml(t.title, t.metaDescription, [
      t.shortPitch,
      t.what,
      t.why,
      ...t.howItWorks,
      ...t.whatYouGet,
      ...t.faqs.map((f) => `${f.q} ${f.a}`),
    ], t.sources, t.extra),
    `${SITE}/tools/${t.slug}`,
  ),
);

const corpus: ParsedPage[] = [...rulePages, ...symptomPages, ...toolPages];
const ruleUrls = new Set(rulePages.map((p) => p.url));
const ruleSlugs = new Set(MARKETING_RULES.map((r) => r.slug));
const toolSlugs = new Set(MARKETING_TOOLS.map((t) => t.slug));

function onRulePages(findings: RuleResult[]): RuleResult[] {
  return findings.filter(
    (f) =>
      (f.pageUrl && ruleUrls.has(f.pageUrl)) ||
      (f.relatedUrls ?? []).some((u) => ruleUrls.has(u)),
  );
}

function describeFindings(findings: RuleResult[]): string {
  return findings.map((f) => `  - ${f.message}`).join("\n");
}

describe("MARKETING_RULES dogfood — must clear pseolint's own rules", () => {
  it("has at least the 6 launch entries plus batch-1 additions (>= 11)", () => {
    expect(MARKETING_RULES.length).toBeGreaterThanOrEqual(11);
  });

  it("no /rules page trips spam/thin-content (300-word floor)", () => {
    const { findings } = thinContentRule(corpus, 300);
    const hits = onRulePages(findings);
    expect(hits, `thin-content fired on rule pages:\n${describeFindings(hits)}`).toEqual([]);
  });

  // content/unique-value is corpus-relative: it counts words that appear on NO
  // other audited page. We hold every reference page to the engine's PRODUCTION
  // floor (100 page-unique words) across the full rules+symptoms+tools corpus —
  // the same bar a live audit applies. The per-page Sources notes (annotated
  // bibliography, page-specific) are the main lever that carries each tightly
  // adjacent glossary page over the line without boilerplate. A genuinely
  // near-duplicate / entity-swapped page falls far below 100 and would fail here.
  it("no reference page is thin on unique value (>= 100 page-unique words, full corpus)", () => {
    const findings = uniqueValueRule(corpus, 100);
    expect(
      findings,
      `unique-value (<100) fired on reference pages:\n${describeFindings(findings)}`,
    ).toEqual([]);
  });

  it("no reference page trips content/citation-coverage (claims are grounded in authoritative sources)", () => {
    const findings = citationCoverageRule(corpus, NO_ENTITY_PATTERNS);
    expect(
      findings,
      `citation-coverage fired on reference pages:\n${describeFindings(findings)}`,
    ).toEqual([]);
  });

  it("no reference page trips content/common-phrase-reuse (incl. source notes)", () => {
    // The /rules/common-phrase-reuse explainer is the one legitimate exception:
    // its entire subject is cataloguing pSEO clichés, so it must quote them in
    // prose (they are also the page's target keywords). The fail/pass example
    // boxes are already [data-example]-excluded; the remaining matches live in
    // the teaching prose by necessity. Every OTHER page must stay clean — this
    // proves the engine's example-exclusion works and that the source notes
    // introduce no clichés.
    const CLICHE_CATALOG = `${SITE}/rules/common-phrase-reuse`;
    const findings = commonPhraseReuseRule(corpus).filter((f) => f.pageUrl !== CLICHE_CATALOG);
    expect(
      findings,
      `common-phrase-reuse fired on reference pages:\n${describeFindings(findings)}`,
    ).toEqual([]);
  });

  it("no /rules page trips aeo/content-modularity", () => {
    const findings = contentModularityRule(rulePages);
    const hits = onRulePages(findings);
    expect(hits, `content-modularity fired on rule pages:\n${describeFindings(hits)}`).toEqual([]);
  });

  it("no /rules page trips aeo/answer-first (oneLiner is the extractable opener)", () => {
    const findings = answerFirstRule(rulePages, NO_ENTITY_PATTERNS);
    const hits = onRulePages(findings);
    expect(hits, `answer-first fired on rule pages:\n${describeFindings(hits)}`).toEqual([]);
  });

  it("no /rules page trips content/meta-uniqueness", () => {
    const findings = metaUniquenessRule(corpus, NO_ENTITY_PATTERNS, 0);
    const hits = onRulePages(findings);
    expect(hits, `meta-uniqueness fired involving rule pages:\n${describeFindings(hits)}`).toEqual(
      [],
    );
  });

  it("no /rules page errors on aeo/citable-facts (>= 3 unique citable facts each)", () => {
    const findings = citableFactsRule(corpus, NO_ENTITY_PATTERNS);
    const errors = onRulePages(findings.filter((f) => f.severity === "error"));
    expect(errors, `citable-facts errored on rule pages:\n${describeFindings(errors)}`).toEqual([]);
  });
});

describe("MARKETING_RULES integrity contract", () => {
  it("slugs are unique", () => {
    const slugs = MARKETING_RULES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("ruleIds are unique", () => {
    const ids = MARKETING_RULES.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MARKETING_RULES.map((r) => [r.slug, r] as const))(
    "%s has well-formed identifiers and metadata",
    (_slug, rule: MarketingRule) => {
      expect(rule.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(rule.ruleId).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
      expect(rule.metaDescription.length).toBeGreaterThanOrEqual(50);
      expect(rule.metaDescription.length).toBeLessThanOrEqual(180);
      expect(rule.oneLiner.length).toBeGreaterThanOrEqual(80);
      expect(rule.failingExample.length).toBeGreaterThanOrEqual(80);
      expect(rule.passingExample.length).toBeGreaterThanOrEqual(80);
      expect(rule.howToFix.length).toBeGreaterThanOrEqual(4);
      for (const step of rule.howToFix) expect(step.length).toBeGreaterThanOrEqual(30);
      expect(rule.faqs.length).toBeGreaterThanOrEqual(4);
      for (const f of rule.faqs) {
        expect(f.q.length).toBeGreaterThanOrEqual(10);
        expect(f.a.length).toBeGreaterThanOrEqual(80);
      }
    },
  );

  it("every relatedRules slug resolves to a real marketing rule", () => {
    for (const rule of MARKETING_RULES) {
      for (const rel of rule.relatedRules) {
        expect(ruleSlugs, `rule ${rule.slug} → relatedRule ${rel}`).toContain(rel);
      }
    }
  });

  it("every relatedTool resolves to a real marketing tool", () => {
    for (const rule of MARKETING_RULES) {
      expect(toolSlugs, `rule ${rule.slug} → relatedTool ${rule.relatedTool}`).toContain(
        rule.relatedTool,
      );
    }
  });

  it("long-form paragraphs stay under the content-modularity ceiling (<= 180 words)", () => {
    const longFields: Array<keyof MarketingRule> = [
      "whatItDetects",
      "whyItMatters",
      "spamBrainContext",
    ];
    for (const rule of MARKETING_RULES) {
      for (const field of longFields) {
        const value = rule[field] as string;
        for (const para of value.split(/\n\n+/)) {
          const words = para.trim().split(/\s+/).filter(Boolean).length;
          expect(
            words,
            `rule ${rule.slug} field ${String(field)} has a ${words}-word paragraph`,
          ).toBeLessThanOrEqual(180);
        }
      }
    }
  });
});

describe("MARKETING source citations integrity", () => {
  const collections: Array<{ kind: string; entries: ReadonlyArray<{ slug: string; sources: MarketingSourceRef[] }> }> = [
    { kind: "rule", entries: MARKETING_RULES },
    { kind: "symptom", entries: MARKETING_SYMPTOMS },
    { kind: "tool", entries: MARKETING_TOOLS },
  ];

  for (const { kind, entries } of collections) {
    it(`every ${kind} page has >= 2 authoritative sources with non-trivial, page-specific notes`, () => {
      for (const entry of entries) {
        expect(entry.sources, `${kind} ${entry.slug} has no sources`).toBeDefined();
        expect(
          entry.sources.length,
          `${kind} ${entry.slug} has ${entry.sources.length} sources (need >= 2)`,
        ).toBeGreaterThanOrEqual(2);
        for (const ref of entry.sources) {
          expect(
            SOURCE_LIBRARY[ref.source],
            `${kind} ${entry.slug} references unknown source key "${ref.source}"`,
          ).toBeDefined();
          const noteWords = ref.note.trim().split(/\s+/).filter(Boolean).length;
          expect(
            noteWords,
            `${kind} ${entry.slug} note for "${ref.source}" is only ${noteWords} words`,
          ).toBeGreaterThanOrEqual(10);
        }
      }
    });
  }

  it("source notes do not duplicate verbatim across pages (each is page-specific)", () => {
    const seen = new Map<string, string>();
    for (const { kind, entries } of collections) {
      for (const entry of entries) {
        for (const ref of entry.sources) {
          const key = ref.note.trim().toLowerCase();
          const prior = seen.get(key);
          expect(prior, `${kind} ${entry.slug} reuses a note verbatim from ${prior}`).toBeUndefined();
          seen.set(key, `${kind}/${entry.slug}`);
        }
      }
    }
  });
});

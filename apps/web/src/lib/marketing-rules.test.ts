import { describe, it, expect } from "vitest";
import {
  parseHtmlPage,
  thinContentRule,
  uniqueValueRule,
  contentModularityRule,
  metaUniquenessRule,
  citableFactsRule,
  answerFirstRule,
  type ParsedPage,
  type EntityMaskPattern,
  type RuleResult,
} from "@pseolint/core";
import { MARKETING_RULES, type MarketingRule } from "@/lib/marketing-rules";
import { MARKETING_SYMPTOMS } from "@/lib/marketing-symptoms";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";

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
    `<h2>A page that fails</h2><p>${esc(rule.failingExample)}</p>`,
    `<h2>A page that passes</h2><p>${esc(rule.passingExample)}</p>`,
    `<h2>How to fix it</h2><ol>${rule.howToFix.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`,
    `<h2>SpamBrain context</h2>${prose(rule.spamBrainContext)}`,
    `<h2>Frequently asked questions</h2><dl>${rule.faqs
      .map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
      .join("")}</dl>`,
    "</main></body></html>",
  ].join("");
}

function buildTextHtml(title: string, metaDescription: string, parts: string[]): string {
  return [
    "<!doctype html><html><head>",
    `<title>${esc(title)} · pseolint</title>`,
    `<meta name="description" content="${esc(metaDescription)}">`,
    "</head><body><main>",
    `<h1>${esc(title)}</h1>`,
    parts.map((p) => `<p>${esc(p)}</p>`).join(""),
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
    ]),
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
    ]),
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

  it("no /rules page trips content/unique-value (100 page-unique words)", () => {
    const findings = uniqueValueRule(corpus, 100);
    const hits = onRulePages(findings);
    expect(hits, `unique-value fired on rule pages:\n${describeFindings(hits)}`).toEqual([]);
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

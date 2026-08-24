import { describe, it, expect } from "vitest";
import {
  MARKETING_SYMPTOMS,
  symptomBodyWordCount,
  type MarketingSymptom,
} from "@/lib/marketing-symptoms";
import { MARKETING_RULES } from "@/lib/marketing-rules";

/**
 * The dogfood contract: every indexable /symptoms page must clear a minimum
 * depth so pseolint's own site passes pseolint's own thin-content bar. These
 * minimums are deliberately below the current hand-authored entries: they are
 * a floor that prevents regressions and forces new entries to real depth, not
 * a target.
 */
describe("MARKETING_SYMPTOMS depth contract", () => {
  it("has at least the 5 launch entries", () => {
    expect(MARKETING_SYMPTOMS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(MARKETING_SYMPTOMS.map((s) => [s.slug, s] as const))(
    "%s meets the per-entry depth floor",
    (_slug, entry: MarketingSymptom) => {
      expect(entry.oneLiner.length).toBeGreaterThanOrEqual(80);
      expect(entry.metaDescription.length).toBeGreaterThanOrEqual(50);
      // 160 is the SEO ideal; 180 is the hard regression ceiling. One launch
      // entry already ships at 177 chars, so the floor-test tolerates up to 180.
      // New entries (Tasks 3-5) are authored at <=160.
      expect(entry.metaDescription.length).toBeLessThanOrEqual(180);
      expect(entry.whatYouSee.length).toBeGreaterThanOrEqual(150);
      expect(entry.likelyCauses.length).toBeGreaterThanOrEqual(3);
      for (const c of entry.likelyCauses) {
        expect(c.cause.length).toBeGreaterThanOrEqual(10);
        expect(c.explanation.length).toBeGreaterThanOrEqual(120);
      }
      expect(entry.diagnosticSteps.length).toBeGreaterThanOrEqual(5);
      for (const step of entry.diagnosticSteps) {
        expect(step.length).toBeGreaterThanOrEqual(40);
      }
      expect(entry.faqs.length).toBeGreaterThanOrEqual(4);
      for (const f of entry.faqs) {
        expect(f.q.length).toBeGreaterThanOrEqual(10);
        expect(f.a.length).toBeGreaterThanOrEqual(120);
      }
      expect(entry.caseStudy.length).toBeGreaterThanOrEqual(200);
      expect(entry.recoveryTimeline.length).toBeGreaterThanOrEqual(200);
      expect(symptomBodyWordCount(entry)).toBeGreaterThanOrEqual(500);
    },
  );
});

describe("MARKETING_SYMPTOMS integrity contract", () => {
  const ruleSlugs = new Set(MARKETING_RULES.map((r) => r.slug));

  it("has unique slugs", () => {
    const slugs = MARKETING_SYMPTOMS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(MARKETING_SYMPTOMS.map((s) => [s.slug] as const))(
    "%s is kebab-case",
    (slug) => {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    },
  );

  it("every relatedRules entry resolves to a real marketing rule", () => {
    for (const s of MARKETING_SYMPTOMS) {
      for (const r of s.relatedRules) {
        expect(ruleSlugs, `symptom ${s.slug} → rule ${r}`).toContain(r);
      }
    }
  });
});

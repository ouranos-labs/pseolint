import { describe, expect, test, vi, beforeEach } from "vitest";
import { wikipediaParaphraseRule } from "../../../src/rules/content/wikipedia-paraphrase.js";
import type { ParsedPage } from "../../../src/types.js";

// Stub out the heavy bloom filter load so rule tests run without the binary
vi.mock("../../../src/algorithms/wikipedia-paraphrase.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/algorithms/wikipedia-paraphrase.js")>();
  return {
    ...actual,
    wikipediaParaphraseRate: vi.fn(),
  };
});

import { wikipediaParaphraseRate } from "../../../src/algorithms/wikipedia-paraphrase.js";
const mockRate = vi.mocked(wikipediaParaphraseRate);

// Generates content long enough to pass the minimum-length guard (~200 trigrams).
const LONG_TEXT = "word ".repeat(210).trim();

function page(url: string, contentText: string, extra: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText,
    html: "",
    ...extra,
  };
}

describe("wikipediaParaphraseRule", () => {
  beforeEach(() => {
    mockRate.mockReset();
  });

  test("page with high trigram overlap (rate >= 0.55) fires one warning", () => {
    mockRate.mockReturnValue(0.72);
    const findings = wikipediaParaphraseRule([page("https://example.com/history", LONG_TEXT)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
    expect(findings[0].ruleId).toBe("content/wikipedia-paraphrase");
    expect(findings[0].pageUrl).toBe("https://example.com/history");
    expect(findings[0].message).toContain("72.0%");
  });

  test("page with low overlap (rate < 0.55) does not fire", () => {
    mockRate.mockReturnValue(0.15);
    const findings = wikipediaParaphraseRule([page("https://example.com/rates", LONG_TEXT)]);
    expect(findings).toHaveLength(0);
  });

  test("threshold boundary: rate=0.54 does not fire", () => {
    mockRate.mockReturnValue(0.54);
    const findings = wikipediaParaphraseRule([page("https://example.com/page", LONG_TEXT)]);
    expect(findings).toHaveLength(0);
  });

  test("threshold boundary: rate=0.56 fires", () => {
    mockRate.mockReturnValue(0.56);
    const findings = wikipediaParaphraseRule([page("https://example.com/page", LONG_TEXT)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("empty contentText: no error, no finding", () => {
    const findings = wikipediaParaphraseRule([page("https://example.com/empty", "")]);
    expect(findings).toHaveLength(0);
    expect(mockRate).not.toHaveBeenCalled();
  });

  test("whitespace-only contentText: no finding", () => {
    const findings = wikipediaParaphraseRule([page("https://example.com/blank", "   \n\t  ")]);
    expect(findings).toHaveLength(0);
  });

  test("multiple pages: only qualifying ones fire", () => {
    mockRate
      .mockReturnValueOnce(0.65) // page 1 fires
      .mockReturnValueOnce(0.20); // page 2 doesn't fire
    const findings = wikipediaParaphraseRule([
      page("https://example.com/a", LONG_TEXT),
      page("https://example.com/b", LONG_TEXT),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].pageUrl).toBe("https://example.com/a");
  });

  test("fix message mentions helpful-content and SpamBrain", () => {
    mockRate.mockReturnValue(0.6);
    const findings = wikipediaParaphraseRule([page("https://example.com/p", LONG_TEXT)]);
    expect(findings[0].fix).toContain("SpamBrain");
    expect(findings[0].fix).toContain("helpful-content");
  });

  // --- FP-reduction tests (new behaviour) ---

  test("(a) short page (~40 words) does NOT fire even when bloom rate exceeds old threshold", () => {
    // ~40 words → ~38 trigrams: below the minimum-length guard; bloom is never
    // consulted for such pages (mockRate should not be called).
    const shortText = "word ".repeat(40).trim();
    const findings = wikipediaParaphraseRule([page("https://example.com/short", shortText)]);
    expect(findings).toHaveLength(0);
    expect(mockRate).not.toHaveBeenCalled();
  });

  test("(b) long page with >=55% overlap still fires at warning/low confidence", () => {
    mockRate.mockReturnValue(0.58);
    const findings = wikipediaParaphraseRule([page("https://example.com/long-overlap", LONG_TEXT)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
  });

  test("(c) message uses corpus-overlap language, not plagiarism assertion", () => {
    mockRate.mockReturnValue(0.60);
    const findings = wikipediaParaphraseRule([page("https://example.com/overlap", LONG_TEXT)]);
    expect(findings).toHaveLength(1);
    // Must NOT assert plagiarism
    expect(findings[0].message.toLowerCase()).not.toContain("plagiar");
    // Must describe trigram overlap with a bundled corpus
    expect(findings[0].message.toLowerCase()).toMatch(/trigram overlap/);
    expect(findings[0].message.toLowerCase()).toMatch(/corpus/);
  });
});

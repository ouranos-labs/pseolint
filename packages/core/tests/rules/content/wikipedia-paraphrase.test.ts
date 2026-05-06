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

  test("page with verbatim Wikipedia content (rate >= 0.4) fires one warning", () => {
    mockRate.mockReturnValue(0.72);
    const findings = wikipediaParaphraseRule([page("https://example.com/history", "some content")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
    expect(findings[0].ruleId).toBe("content/wikipedia-paraphrase");
    expect(findings[0].pageUrl).toBe("https://example.com/history");
    expect(findings[0].message).toContain("72.0%");
  });

  test("page with original content (rate < 0.4) does not fire", () => {
    mockRate.mockReturnValue(0.15);
    const findings = wikipediaParaphraseRule([page("https://example.com/rates", "original content")]);
    expect(findings).toHaveLength(0);
  });

  test("threshold boundary: rate=0.39 does not fire", () => {
    mockRate.mockReturnValue(0.39);
    const findings = wikipediaParaphraseRule([page("https://example.com/page", "some text")]);
    expect(findings).toHaveLength(0);
  });

  test("threshold boundary: rate=0.41 fires", () => {
    mockRate.mockReturnValue(0.41);
    const findings = wikipediaParaphraseRule([page("https://example.com/page", "some text")]);
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
      page("https://example.com/a", "content a"),
      page("https://example.com/b", "content b"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].pageUrl).toBe("https://example.com/a");
  });

  test("fix message mentions helpful-content and SpamBrain", () => {
    mockRate.mockReturnValue(0.5);
    const findings = wikipediaParaphraseRule([page("https://example.com/p", "text")]);
    expect(findings[0].fix).toContain("SpamBrain");
    expect(findings[0].fix).toContain("helpful-content");
  });
});

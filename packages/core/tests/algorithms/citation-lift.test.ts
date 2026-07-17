import { describe, it, expect } from "vitest";
import {
  generateCitationBlock,
  faqToHtml,
  faqToJsonLd,
  draftToPageChanges,
  type CitationDraft,
} from "../../src/algorithms/citation-lift/index.js";

const draft = (score: number, q = "What is X?"): CitationDraft => ({
  answerFirst: "X is a thing.",
  faq: [{ question: q, answer: "Because <reasons> & \"stuff\"." }],
  score,
  rationale: "direct answer",
});

describe("generateCitationBlock", () => {
  it("keeps the highest-scoring draft across attempts", async () => {
    const scores = [40, 82, 55];
    let i = 0;
    const best = await generateCitationBlock(
      { query: "q", contentText: "text", attempts: 3 },
      { generate: async () => draft(scores[i++]) },
    );
    expect(best.score).toBe(82);
  });

  it("calls generate exactly once by default", async () => {
    let calls = 0;
    await generateCitationBlock(
      { query: "q", contentText: "text" },
      { generate: async () => { calls++; return draft(50); } },
    );
    expect(calls).toBe(1);
  });
});

describe("faqToHtml", () => {
  it("escapes HTML in questions and answers", () => {
    const html = faqToHtml(draft(50, "A > B?"));
    expect(html).toContain("A &gt; B?");
    expect(html).toContain("&lt;reasons&gt; &amp; &quot;stuff&quot;");
    expect(html).not.toMatch(/<reasons>/); // raw angle brackets must not survive
  });
});

describe("faqToJsonLd", () => {
  it("produces a valid FAQPage shape", () => {
    const ld = faqToJsonLd(draft(50)) as any;
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]["@type"]).toBe("Question");
    expect(ld.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });
});

describe("draftToPageChanges", () => {
  it("emits an additive faq block + jsonld, both carrying the score in the reason", () => {
    const changes = draftToPageChanges(draft(77));
    expect(changes.map((c) => c.type).sort()).toEqual(["add_faq_block", "add_jsonld"]);
    expect(changes.every((c) => c.reason.includes("77"))).toBe(true);
  });
});

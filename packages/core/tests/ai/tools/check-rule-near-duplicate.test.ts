import { describe, it, expect } from "vitest";
import { checkRuleNearDuplicateTool } from "../../../src/ai/tools/check-rule-near-duplicate.js";
import { withCachedPages } from "../../helpers/page-cache-test.js";

const sharedBody = `<p>${"meaningful word ".repeat(120)}</p>`;
const distinctBody = (i: number) =>
  `<p>${`unique${i} `.repeat(60)}${"common phrase ".repeat(20)}</p>`;

describe("check_rule_near_duplicate tool", () => {
  it("flags pairs above the similarity threshold", async () => {
    await withCachedPages(
      [
        { url: "https://example.com/a", html: `<html><body>${sharedBody}</body></html>` },
        { url: "https://example.com/b", html: `<html><body>${sharedBody}</body></html>` },
        { url: "https://example.com/c", html: `<html><body>${sharedBody}</body></html>` },
      ],
      async (pageIds) => {
        const r = await checkRuleNearDuplicateTool.run({ pageIds });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.pairCount).toBe(3);
        expect(r.data.findings).toHaveLength(3);
        expect(r.data.findings[0].severity).toBe("critical");
      },
    );
  });

  it("returns no pairs when pages are sufficiently distinct", async () => {
    await withCachedPages(
      [
        { url: "https://example.com/a", html: `<html><body>${distinctBody(1)}</body></html>` },
        { url: "https://example.com/b", html: `<html><body>${distinctBody(2)}</body></html>` },
      ],
      async (pageIds) => {
        const r = await checkRuleNearDuplicateTool.run({ pageIds, threshold: 0.95 });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.pairCount).toBe(0);
        expect(r.data.findings).toHaveLength(0);
      },
    );
  });

  it("rejects fewer than 2 pageIds via Zod", async () => {
    await withCachedPages(
      [{ url: "https://example.com/a", html: "<html></html>" }],
      async (pageIds) => {
        const r = await checkRuleNearDuplicateTool.run({ pageIds });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
      },
    );
  });

  it("rejects more than 50 pageIds via Zod", async () => {
    const pages = Array.from({ length: 51 }, (_, i) => ({
      url: `https://example.com/${i}`,
      html: "<html></html>",
    }));
    await withCachedPages(pages, async (pageIds) => {
      const r = await checkRuleNearDuplicateTool.run({ pageIds });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
    });
  });
});

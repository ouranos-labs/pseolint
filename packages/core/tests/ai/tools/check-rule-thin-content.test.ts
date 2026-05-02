import { describe, it, expect } from "vitest";
import { checkRuleThinContentTool } from "../../../src/ai/tools/check-rule-thin-content.js";
import { withCachedPage } from "../../helpers/page-cache-test.js";

const fatHtml = `
<html><head><title>x</title></head><body>
  <h1>Sourdough basics</h1>
  <p>${"meaningful word ".repeat(200)}</p>
</body></html>
`;

const thinHtml = `
<html><head><title>x</title></head><body>
  <h1>Stub</h1>
  <p>tiny content</p>
</body></html>
`;

describe("check_rule_thin_content tool", () => {
  it("returns isThin=false on a content-rich page", async () => {
    await withCachedPage("https://example.com/post", fatHtml, async (pageId) => {
      const r = await checkRuleThinContentTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.isThin).toBe(false);
      expect(r.data.finding).toBeNull();
      expect(r.data.wordCount).toBeGreaterThan(100);
    });
  });

  it("returns isThin=true with a finding on a stub page", async () => {
    await withCachedPage("https://example.com/stub", thinHtml, async (pageId) => {
      const r = await checkRuleThinContentTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.isThin).toBe(true);
      expect(r.data.finding).not.toBeNull();
      expect(r.data.finding?.ruleId).toBe("spam/thin-content");
      expect(r.data.finding?.severity).toBe("error");
      expect(r.data.finding?.confidence).toBe("high");
    });
  });

  it("respects custom minWords threshold", async () => {
    await withCachedPage("https://example.com/post", fatHtml, async (pageId) => {
      const r = await checkRuleThinContentTool.run({ pageId, minWords: 5000 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.isThin).toBe(true);
      expect(r.data.threshold).toBe(5000);
    });
  });

  it("rejects out-of-range minWords", async () => {
    await withCachedPage("https://example.com/stub", thinHtml, async (pageId) => {
      const r = await checkRuleThinContentTool.run({ pageId, minWords: 999_999 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
    });
  });
});

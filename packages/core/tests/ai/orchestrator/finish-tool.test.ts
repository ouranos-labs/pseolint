import { describe, it, expect } from "vitest";
import { finishAuditTool } from "../../../src/ai/orchestrator/finish-tool.js";

const validManifest = {
  domain: "example.com",
  verdict: "ready" as const,
  categories: { integrity: "A" as const, discoverability: "B" as const, citation: "A" as const, data: "A" as const },
  templates: [],
  pages: [],
  domainLevel: [],
};

describe("finish_audit tool", () => {
  it("accepts a minimal valid manifest", async () => {
    const r = await finishAuditTool.run({ manifest: validManifest });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.accepted).toBe(true);
  });

  it("accepts a manifest with realistic page patches", async () => {
    const r = await finishAuditTool.run({
      manifest: {
        ...validManifest,
        verdict: "caution",
        categories: { ...validManifest.categories, citation: "C" },
        pages: [
          {
            url: "https://example.com/page",
            changes: [
              { type: "replace_h1", before: "Old H1", after: "New H1", reason: "AEO opener" },
              {
                type: "add_jsonld",
                block: { "@context": "https://schema.org", "@type": "Article" },
                reason: "missing required schema",
              },
            ],
          },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown verdict", async () => {
    const r = await finishAuditTool.run({
      // @ts-expect-error testing runtime guard against bad model output
      manifest: { ...validManifest, verdict: "fine" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects a manifest missing required categories", async () => {
    const r = await finishAuditTool.run({
      // @ts-expect-error testing runtime guard
      manifest: { ...validManifest, categories: { integrity: "A" } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects a page change with an unknown patch type", async () => {
    const r = await finishAuditTool.run({
      manifest: {
        ...validManifest,
        pages: [
          {
            url: "https://example.com/page",
            // @ts-expect-error testing runtime guard against bad patch type
            changes: [{ type: "invent_a_patch", reason: "lol" }],
          },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });

  it("rejects a non-URL `from` in add_internal_link", async () => {
    const r = await finishAuditTool.run({
      manifest: {
        ...validManifest,
        pages: [
          {
            url: "https://example.com/a",
            changes: [
              {
                type: "add_internal_link",
                from: "not a url",
                to: "https://example.com/b",
                anchor: "x",
                reason: "y",
              },
            ],
          },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });
});

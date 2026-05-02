import { describe, it, expect } from "vitest";
import { validateManifest } from "../../../src/ai/manifest/validate-manifest.js";
import type { FixManifest } from "../../../src/ai/orchestrator/finish-tool.js";

const baseManifest: FixManifest = {
  domain: "example.com",
  verdict: "ready",
  categories: { integrity: "A", discoverability: "B", citation: "A", data: "A" },
  templates: [],
  pages: [],
  domainLevel: [],
};

describe("validateManifest", () => {
  it("reports zero failures on an empty manifest", () => {
    const r = validateManifest(baseManifest);
    expect(r.totalPatches).toBe(0);
    expect(r.validPatches).toBe(0);
    expect(r.failures).toEqual([]);
  });

  it("walks page patches and surfaces failures with location", () => {
    const r = validateManifest({
      ...baseManifest,
      pages: [
        {
          url: "https://example.com/a",
          changes: [
            { type: "replace_h1", before: "x", after: "Better H1", reason: "y" },
            { type: "replace_h1", before: "x", after: "x", reason: "noop" }, // fails
          ],
        },
      ],
    });
    expect(r.totalPatches).toBe(2);
    expect(r.validPatches).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].location).toMatchObject({
      kind: "page_patch",
      pageIndex: 0,
      changeIndex: 1,
      pageUrl: "https://example.com/a",
      patchType: "replace_h1",
    });
  });

  it("walks template-patch examples", () => {
    const r = validateManifest({
      ...baseManifest,
      templates: [
        {
          templateId: "/city/:slug",
          affectedUrlCount: 50,
          recommendation: "Rewrite stub template",
          rationale: "Most pages share boilerplate openers",
          examples: [
            {
              url: "https://example.com/city/a",
              changes: [
                { type: "rewrite_meta", field: "title", before: "x", after: "Plumbers", reason: "x" }, // too short
              ],
            },
          ],
        },
      ],
    });
    expect(r.totalPatches).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].location).toMatchObject({
      kind: "template_patch",
      templateIndex: 0,
      exampleIndex: 0,
      changeIndex: 0,
      templateId: "/city/:slug",
    });
  });

  it("walks domain patches and reports their failures", () => {
    const r = validateManifest({
      ...baseManifest,
      domainLevel: [
        { type: "robots_txt", before: null, after: "Sitemap: https://example.com/sitemap.xml", reason: "x" }, // no User-agent
      ],
    });
    expect(r.totalPatches).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].location).toMatchObject({
      kind: "domain_patch",
      index: 0,
      patchType: "robots_txt",
    });
  });

  it("aggregates totals across all patch buckets", () => {
    const r = validateManifest({
      ...baseManifest,
      pages: [
        {
          url: "https://example.com/a",
          changes: [
            { type: "replace_h1", before: "x", after: "OK H1", reason: "y" },
          ],
        },
      ],
      templates: [
        {
          templateId: "/x",
          affectedUrlCount: 1,
          recommendation: "x",
          rationale: "y",
          examples: [],
        },
      ],
      domainLevel: [
        {
          type: "canonical_strategy",
          before: null,
          after: "Always self-canonical except paginated views.",
          reason: "x",
        },
      ],
    });
    expect(r.totalPatches).toBe(2); // 1 page + 0 template + 1 domain (template has no examples)
    expect(r.validPatches).toBe(2);
    expect(r.failures).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  renderManifest,
  applyEditToContent,
  type TemplateMapping,
} from "../../../src/ai/apply/render-manifest.js";
import type { FixManifest } from "../../../src/ai/orchestrator/finish-tool.js";

const baseManifest: FixManifest = {
  domain: "example.com",
  verdict: "caution",
  categories: { integrity: "C", discoverability: "B", citation: "D", data: "C" },
  templates: [],
  pages: [],
  domainLevel: [],
};

const mapping: TemplateMapping = {
  "/listing/:slug": "app/listing/[slug]/page.tsx",
  "robots.txt": "public/robots.txt",
};

describe("renderManifest", () => {
  it("turns a mapped meta rewrite into an applicable FileEdit", () => {
    const m: FixManifest = {
      ...baseManifest,
      pages: [
        {
          url: "https://example.com/listing/acme-plumbing",
          changes: [
            { type: "rewrite_meta", field: "title", before: "Old title", after: "New title", reason: "thin" },
          ],
        },
      ],
    };
    const { edits, checklist } = renderManifest(m, mapping);
    expect(checklist).toHaveLength(0);
    expect(edits).toEqual([
      {
        path: "app/listing/[slug]/page.tsx",
        find: "Old title",
        replace: "New title",
        field: "title",
        reason: "thin",
        url: "https://example.com/listing/acme-plumbing",
      },
    ]);
  });

  it("routes JSON-LD inserts and prose rewrites to the checklist, not auto-edits", () => {
    const m: FixManifest = {
      ...baseManifest,
      pages: [
        {
          url: "https://example.com/listing/x",
          changes: [
            { type: "add_jsonld", block: { "@type": "Product" }, reason: "no schema" },
            { type: "rewrite_intro", before: "a", after: "b", reason: "boilerplate" },
          ],
        },
      ],
    };
    const { edits, checklist } = renderManifest(m, mapping);
    expect(edits).toHaveLength(0);
    expect(checklist.map((c) => c.kind).sort()).toEqual(["generative", "insertion"]);
  });

  it("flags an unmapped URL instead of dropping the fix", () => {
    const m: FixManifest = {
      ...baseManifest,
      pages: [
        {
          url: "https://example.com/unknown/route",
          changes: [{ type: "replace_h1", before: "H", after: "H2", reason: "dup" }],
        },
      ],
    };
    const { edits, checklist } = renderManifest(m, mapping);
    expect(edits).toHaveLength(0);
    expect(checklist[0].kind).toBe("unmapped");
  });

  it("maps robots.txt file_replace to its mapped source path", () => {
    const m: FixManifest = {
      ...baseManifest,
      domainLevel: [
        { type: "robots_txt", before: "User-agent: *\nDisallow: /", after: "User-agent: *\nAllow: /", reason: "blocks crawlers" },
      ],
    };
    const { edits } = renderManifest(m, mapping);
    expect(edits[0]).toMatchObject({ path: "public/robots.txt", field: "robots.txt", find: "User-agent: *\nDisallow: /" });
  });

  it("keeps template fixes as guided checklist items (never auto-edits rendered instances)", () => {
    const m: FixManifest = {
      ...baseManifest,
      templates: [
        {
          templateId: "/listing/:slug",
          affectedUrlCount: 4200,
          recommendation: "Add a unique-value section per listing",
          examples: [],
          rationale: "near-duplicate across the cluster",
        },
      ],
    };
    const { edits, checklist } = renderManifest(m, mapping);
    expect(edits).toHaveLength(0);
    expect(checklist[0]).toMatchObject({ kind: "template", path: "app/listing/[slug]/page.tsx" });
  });
});

describe("applyEditToContent", () => {
  it("replaces the literal when present", () => {
    const r = applyEditToContent("const title = 'Old title'", {
      path: "x", find: "Old title", replace: "New title", field: "title", reason: "",
    });
    expect(r).toEqual({ applied: true, content: "const title = 'New title'" });
  });

  it("reports a miss so the caller can demote to checklist", () => {
    const r = applyEditToContent("const title = `Best in ${city}`", {
      path: "x", find: "Best in Austin", replace: "New", field: "title", reason: "",
    });
    expect(r.applied).toBe(false);
  });

  it("overwrites the whole file when find is null", () => {
    const r = applyEditToContent("old", {
      path: "public/robots.txt", find: null, replace: "new", field: "robots.txt", reason: "",
    });
    expect(r).toEqual({ applied: true, content: "new" });
  });
});

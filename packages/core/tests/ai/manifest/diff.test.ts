import { describe, it, expect } from "vitest";
import {
  diffPageChange,
  diffDomainPatch,
  diffManifest,
} from "../../../src/ai/manifest/diff.js";
import type { FixManifest } from "../../../src/ai/orchestrator/finish-tool.js";

describe("diffPageChange", () => {
  it("converts replace_h1 to text_replace[h1]", () => {
    const d = diffPageChange({
      type: "replace_h1",
      before: "Old",
      after: "New H1",
      reason: "AEO opener",
    });
    expect(d.kind).toBe("text_replace");
    if (d.kind === "text_replace") {
      expect(d.field).toBe("h1");
      expect(d.before).toBe("Old");
      expect(d.after).toBe("New H1");
    }
  });

  it("maps rewrite_meta[title] to text_replace[title]", () => {
    const d = diffPageChange({
      type: "rewrite_meta",
      field: "title",
      before: "Old",
      after: "Better Title Here",
      reason: "x",
    });
    expect(d.kind).toBe("text_replace");
    if (d.kind === "text_replace") expect(d.field).toBe("title");
  });

  it("maps rewrite_meta[description] to text_replace[meta_description]", () => {
    const d = diffPageChange({
      type: "rewrite_meta",
      field: "description",
      before: "Old",
      after: "New description text content",
      reason: "x",
    });
    expect(d.kind).toBe("text_replace");
    if (d.kind === "text_replace") expect(d.field).toBe("meta_description");
  });

  it("converts add_jsonld to html_insert[head] with serialized script tag", () => {
    const d = diffPageChange({
      type: "add_jsonld",
      block: { "@context": "https://schema.org", "@type": "Article", headline: "x" },
      reason: "x",
    });
    expect(d.kind).toBe("html_insert");
    if (d.kind === "html_insert") {
      expect(d.target).toBe("head");
      expect(d.description).toContain("Article");
      expect(d.html).toMatch(/<script type="application\/ld\+json">/);
      expect(d.html).toContain("\"@type\": \"Article\"");
    }
  });

  it("handles add_jsonld with array @type", () => {
    const d = diffPageChange({
      type: "add_jsonld",
      block: { "@context": "https://schema.org", "@type": ["Place", "Service"] },
      reason: "x",
    });
    if (d.kind === "html_insert") expect(d.description).toMatch(/Place.*Service/);
  });

  it("converts add_faq_block to html_insert[body]", () => {
    const d = diffPageChange({
      type: "add_faq_block",
      html: "<div><h3>Q?</h3><p>A.</p></div>",
      reason: "x",
    });
    expect(d.kind).toBe("html_insert");
    if (d.kind === "html_insert") {
      expect(d.target).toBe("body");
      expect(d.html).toContain("<h3>Q?</h3>");
    }
  });

  it("converts rewrite_intro to text_replace[intro]", () => {
    const d = diffPageChange({
      type: "rewrite_intro",
      before: "Old intro paragraph text.",
      after: "New intro paragraph with concrete facts and named entities.",
      reason: "x",
    });
    expect(d.kind).toBe("text_replace");
    if (d.kind === "text_replace") expect(d.field).toBe("intro");
  });

  it("converts add_internal_link with HTML-escaped attributes", () => {
    const d = diffPageChange({
      type: "add_internal_link",
      from: "https://example.com/blog/post",
      to: "https://example.com/topic-hub?q=plumbers&loc=austin",
      anchor: 'topic <hub> "guide"',
      reason: "x",
    });
    expect(d.kind).toBe("html_insert");
    if (d.kind === "html_insert") {
      expect(d.target).toBe("after_h1");
      // Both & and < and " in the anchor must be escaped
      expect(d.html).toContain("&amp;");
      expect(d.html).toContain("&lt;hub&gt;");
      expect(d.html).toContain("&quot;guide&quot;");
      // Raw attack chars must NOT appear in the rendered HTML
      expect(d.html).not.toMatch(/anchor=".*<hub>/);
    }
  });

  it("converts remove_thin_block to html_remove with selector", () => {
    const d = diffPageChange({
      type: "remove_thin_block",
      selector: ".sidebar .promo",
      reason: "x",
    });
    expect(d.kind).toBe("html_remove");
    if (d.kind === "html_remove") expect(d.selector).toBe(".sidebar .promo");
  });
});

describe("diffDomainPatch", () => {
  it("converts robots_txt to file_replace[/robots.txt]", () => {
    const d = diffDomainPatch({
      type: "robots_txt",
      before: "User-agent: *\nAllow: /",
      after: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
      reason: "add sitemap",
    });
    expect(d.kind).toBe("file_replace");
    if (d.kind === "file_replace") {
      expect(d.path).toBe("/robots.txt");
      expect(d.after).toContain("Sitemap:");
    }
  });

  it("converts sitemap_xml to file_replace[/sitemap.xml]", () => {
    const d = diffDomainPatch({
      type: "sitemap_xml",
      before: null,
      after: "<urlset><url><loc>x</loc></url></urlset>",
      reason: "create sitemap",
    });
    expect(d.kind).toBe("file_replace");
    if (d.kind === "file_replace") {
      expect(d.path).toBe("/sitemap.xml");
      expect(d.before).toBeNull();
    }
  });

  it("converts canonical_strategy to guidance", () => {
    const d = diffDomainPatch({
      type: "canonical_strategy",
      before: null,
      after: "Always self-canonical except paginated views which canonicalize to page 1.",
      reason: "x",
    });
    expect(d.kind).toBe("guidance");
    if (d.kind === "guidance") {
      expect(d.topic).toBe("canonical_strategy");
      expect(d.text).toContain("self-canonical");
    }
  });
});

describe("diffManifest", () => {
  it("walks pages, templates, and domainLevel preserving structure", () => {
    const manifest: FixManifest = {
      domain: "example.com",
      verdict: "caution",
      categories: { integrity: "B", discoverability: "B", citation: "C", data: "A" },
      pages: [
        {
          url: "https://example.com/a",
          changes: [
            { type: "replace_h1", before: "x", after: "Better H1", reason: "y" },
            { type: "rewrite_meta", field: "title", before: "x", after: "Better Title 12345", reason: "y" },
          ],
        },
      ],
      templates: [
        {
          templateId: "/city/:slug",
          affectedUrlCount: 50,
          recommendation: "Rewrite stub",
          rationale: "Most pages share boilerplate openers",
          examples: [
            {
              url: "https://example.com/city/a",
              changes: [{ type: "remove_thin_block", selector: ".promo", reason: "y" }],
            },
          ],
        },
      ],
      domainLevel: [
        {
          type: "canonical_strategy",
          before: null,
          after: "Always self-canonical except paginated views.",
          reason: "y",
        },
      ],
    };

    const md = diffManifest(manifest);
    expect(md.pages).toHaveLength(1);
    expect(md.pages[0].url).toBe("https://example.com/a");
    expect(md.pages[0].diffs).toHaveLength(2);

    expect(md.templates).toHaveLength(1);
    expect(md.templates[0].templateId).toBe("/city/:slug");
    expect(md.templates[0].examples[0].diffs[0].kind).toBe("html_remove");

    expect(md.domainLevel).toHaveLength(1);
    expect(md.domainLevel[0].kind).toBe("guidance");
  });

  it("handles an empty manifest", () => {
    const md = diffManifest({
      domain: "example.com",
      verdict: "ready",
      categories: { integrity: "A", discoverability: "A", citation: "A", data: "A" },
      pages: [],
      templates: [],
      domainLevel: [],
    });
    expect(md.pages).toEqual([]);
    expect(md.templates).toEqual([]);
    expect(md.domainLevel).toEqual([]);
  });
});

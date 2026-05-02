import { describe, it, expect } from "vitest";
import {
  validateAddJsonLd,
  validateReplaceH1,
  validateRewriteMeta,
  validateAddFaqBlock,
  validateRewriteIntro,
  validateAddInternalLink,
  validateRemoveThinBlock,
  validatePageChange,
} from "../../../src/ai/manifest/validators/page-changes.js";

describe("validateAddJsonLd", () => {
  it("accepts a fully-populated Article block", () => {
    const r = validateAddJsonLd({
      type: "add_jsonld",
      block: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Hello",
        datePublished: "2026-04-29",
        author: { "@type": "Person", name: "Jane" },
      },
      reason: "missing schema",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects missing @context", () => {
    const r = validateAddJsonLd({
      type: "add_jsonld",
      block: { "@type": "Article", headline: "x", datePublished: "2026-04-29", author: "Jane" },
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("@context");
  });

  it("rejects missing required Article properties", () => {
    const r = validateAddJsonLd({
      type: "add_jsonld",
      block: { "@context": "https://schema.org", "@type": "Article" },
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/headline|datePublished|author/);
  });

  it("accepts an FAQPage with mainEntity", () => {
    const r = validateAddJsonLd({
      type: "add_jsonld",
      block: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A" } }],
      },
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });
});

describe("validateReplaceH1", () => {
  it("accepts a normal H1 rewrite", () => {
    const r = validateReplaceH1({
      type: "replace_h1",
      before: "Old generic H1",
      after: "Licensed Emergency Plumbers in Austin, TX (24/7)",
      reason: "AEO opener",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects empty after-text", () => {
    const r = validateReplaceH1({ type: "replace_h1", before: "x", after: "  ", reason: "x" });
    expect(r.valid).toBe(false);
  });

  it("rejects H1 longer than 200 chars", () => {
    const r = validateReplaceH1({
      type: "replace_h1",
      before: "x",
      after: "y".repeat(250),
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects markdown leakage", () => {
    const r = validateReplaceH1({
      type: "replace_h1",
      before: "x",
      after: "**bold heading**",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects no-op (after == before)", () => {
    const r = validateReplaceH1({ type: "replace_h1", before: "same", after: "same", reason: "x" });
    expect(r.valid).toBe(false);
  });
});

describe("validateRewriteMeta", () => {
  it("accepts a 50-char title", () => {
    const r = validateRewriteMeta({
      type: "rewrite_meta",
      field: "title",
      before: "old",
      after: "Licensed Plumbers in Austin, TX | 24/7 Service",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects an 8-char title (too short)", () => {
    const r = validateRewriteMeta({
      type: "rewrite_meta",
      field: "title",
      before: "old",
      after: "Plumbers",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects a 100-char title (too long)", () => {
    const r = validateRewriteMeta({
      type: "rewrite_meta",
      field: "title",
      before: "old",
      after: "x".repeat(100),
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("description bounds: 50-160 chars", () => {
    const ok = validateRewriteMeta({
      type: "rewrite_meta",
      field: "description",
      before: "old",
      after: "Find licensed emergency plumbers in Austin, TX. Fast 24/7 service for residential and commercial.",
      reason: "x",
    });
    expect(ok.valid).toBe(true);

    const tooShort = validateRewriteMeta({
      type: "rewrite_meta",
      field: "description",
      before: "old",
      after: "too short",
      reason: "x",
    });
    expect(tooShort.valid).toBe(false);
  });
});

describe("validateAddFaqBlock", () => {
  it("accepts a clean FAQ HTML block", () => {
    const r = validateAddFaqBlock({
      type: "add_faq_block",
      html: `<div><h3>What is X?</h3><p>X is Y.</p><a href="/about">About</a></div>`,
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects <script> tags", () => {
    const r = validateAddFaqBlock({
      type: "add_faq_block",
      html: `<div><h3>Q</h3><p>A</p><script>alert(1)</script></div>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("script");
  });

  it("rejects javascript: URLs", () => {
    const r = validateAddFaqBlock({
      type: "add_faq_block",
      html: `<a href="javascript:alert(1)">click</a>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("scheme");
  });

  it("rejects <iframe>", () => {
    const r = validateAddFaqBlock({
      type: "add_faq_block",
      html: `<iframe src="https://evil.com"></iframe>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects <form>", () => {
    const r = validateAddFaqBlock({
      type: "add_faq_block",
      html: `<form action="/x"><input type="text"/></form>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects empty html", () => {
    const r = validateAddFaqBlock({ type: "add_faq_block", html: "  ", reason: "x" });
    expect(r.valid).toBe(false);
  });
});

describe("validateRewriteIntro", () => {
  it("accepts a 200-char informative intro", () => {
    const r = validateRewriteIntro({
      type: "rewrite_intro",
      before: "x",
      after:
        "Austin requires plumbers to hold an active TPLB license; this guide lists 12 vetted firms covering 78704, 78745, and 78759 with 24/7 emergency dispatch and average response times under 45 minutes.",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects too short", () => {
    const r = validateRewriteIntro({
      type: "rewrite_intro",
      before: "x",
      after: "short intro",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects promo CTA language", () => {
    const r = validateRewriteIntro({
      type: "rewrite_intro",
      before: "x",
      after: "We are the best service in town. Buy now and click here for a limited time offer that expires tonight.",
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("promotional");
  });
});

describe("validateAddInternalLink", () => {
  it("accepts a same-host link", () => {
    const r = validateAddInternalLink({
      type: "add_internal_link",
      from: "https://example.com/blog/post",
      to: "https://example.com/topic-hub",
      anchor: "topic hub",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects cross-domain link", () => {
    const r = validateAddInternalLink({
      type: "add_internal_link",
      from: "https://example.com/a",
      to: "https://other.com/b",
      anchor: "x",
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("cross-domain");
  });

  it("rejects self-link", () => {
    const r = validateAddInternalLink({
      type: "add_internal_link",
      from: "https://example.com/a",
      to: "https://example.com/a",
      anchor: "x",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects empty anchor", () => {
    const r = validateAddInternalLink({
      type: "add_internal_link",
      from: "https://example.com/a",
      to: "https://example.com/b",
      anchor: "  ",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });
});

describe("validateRemoveThinBlock", () => {
  it("accepts a valid CSS selector", () => {
    const r = validateRemoveThinBlock({
      type: "remove_thin_block",
      selector: ".sidebar .widget",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects empty selector", () => {
    const r = validateRemoveThinBlock({
      type: "remove_thin_block",
      selector: "  ",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });
});

describe("validatePageChange dispatcher", () => {
  it("routes by patch type", () => {
    const r = validatePageChange({
      type: "replace_h1",
      before: "x",
      after: "Better H1",
      reason: "y",
    });
    expect(r.valid).toBe(true);
  });
});

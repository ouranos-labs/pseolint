import { describe, expect, test } from "vitest";
import { nonReplicableValueRule } from "../../../src/rules/aeo/non-replicable-value.js";
import { page } from "./page-fixture.js";

describe("aeo/non-replicable-value", () => {
  test("warns on pure-text pages with no interactive/download/gated element", () => {
    const p = page("https://example.dev/a", {
      html: "<html><body><h1>Intro</h1><p>Informational prose.</p></body></html>",
      contentText: "Informational prose.",
    });
    const findings = nonReplicableValueRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("passes when a form is present", () => {
    const p = page("https://example.dev/a", {
      html: "<html><body><form><input name='q'/></form></body></html>",
    });
    expect(nonReplicableValueRule([p])).toHaveLength(0);
  });

  test("passes when a calculator-class element is present", () => {
    const p = page("https://example.dev/a", {
      html: '<html><body><div class="calculator">...</div></body></html>',
    });
    expect(nonReplicableValueRule([p])).toHaveLength(0);
  });

  test("passes when a downloadable PDF link is present", () => {
    const p = page("https://example.dev/a", {
      html: '<html><body><a href="/doc.pdf">Download</a></body></html>',
    });
    expect(nonReplicableValueRule([p])).toHaveLength(0);
  });

  test("passes when a download attribute is present", () => {
    const p = page("https://example.dev/a", {
      html: '<html><body><a href="/file" download>Get it</a></body></html>',
    });
    expect(nonReplicableValueRule([p])).toHaveLength(0);
  });

  test("passes when gated content language is detected", () => {
    const p = page("https://example.dev/a", {
      html: "<html><body><p>Sign up to access the full report.</p></body></html>",
      contentText: "Sign up to access the full report.",
    });
    expect(nonReplicableValueRule([p])).toHaveLength(0);
  });

  test("respects custom interactive selectors", () => {
    const p = page("https://example.dev/a", {
      html: '<html><body><div class="my-custom-tool">...</div></body></html>',
    });
    // Without the custom selector, would warn...
    expect(nonReplicableValueRule([p])).toHaveLength(1);
    // ...with it, it passes.
    expect(
      nonReplicableValueRule([p], { interactiveSelectors: [".my-custom-tool"] }),
    ).toHaveLength(0);
  });
});

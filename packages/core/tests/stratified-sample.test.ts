import { describe, it, expect } from "vitest";
import { inferUrlTemplate } from "../src/stratified-sample.js";

describe("inferUrlTemplate", () => {
  it("generalizes multi-hyphen slugs", () => {
    expect(inferUrlTemplate("https://example.com/templates/lawyer-nda-ca"))
      .toBe("/templates/:slug");
  });

  it("keeps short static segments literal", () => {
    expect(inferUrlTemplate("https://example.com/blog/about"))
      .toBe("/blog/about");
  });

  it("generalizes all-digits", () => {
    expect(inferUrlTemplate("https://example.com/items/12345"))
      .toBe("/items/:num");
  });

  it("generalizes UUIDs", () => {
    expect(inferUrlTemplate("https://example.com/u/550e8400-e29b-41d4-a716-446655440000"))
      .toBe("/u/:id");
  });

  it("generalizes date-shaped segments", () => {
    expect(inferUrlTemplate("https://example.com/archive/2026-04-17/post"))
      .toBe("/archive/:date/post");
  });

  it("handles root URL", () => {
    expect(inferUrlTemplate("https://example.com/")).toBe("/");
    expect(inferUrlTemplate("https://example.com")).toBe("/");
  });

  it("single-hyphen segments stay literal", () => {
    expect(inferUrlTemplate("https://example.com/page-2")).toBe("/page-2");
  });
});

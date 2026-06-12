import { describe, test, expect } from "vitest";
import { CommonCrawlProvider } from "../../../src/algorithms/authority/commoncrawl.js";

describe("CommonCrawlProvider", () => {
  test("returns the normalized score for a known domain", async () => {
    const p = new CommonCrawlProvider(new Map([["x.com", 71]]));
    expect(await p.authorityFor("x.com")).toBe(71);
  });
  test("returns null for an unknown domain (and empty table)", async () => {
    const p = new CommonCrawlProvider(new Map());
    expect(await p.authorityFor("x.com")).toBeNull();
  });
});

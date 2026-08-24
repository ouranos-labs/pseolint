import { describe, expect, it } from "vitest";
import { parseScanOptions, scanOptionsSchema } from "@/lib/scan-options";

describe("parseScanOptions (allowlist)", () => {
  it("parses a valid scan-options object", () => {
    const raw = {
      crawlDiscovery: true,
      fillBudgetViaLinkDiscovery: false,
      samplingStrategy: "random",
      maxPerTemplate: 5,
      strict: true,
      pageGroups: {
        landing: { match: "/lp/*", rules: ["meta/title-too-long"] },
        templates: {
          match: ["/p/*", "/q/*"],
          overrides: { "spam/thin-content": { thinContentMinWords: 150 } },
        },
      },
      entityPatterns: [{ placeholder: "CITY", pattern: "[A-Z][a-z]+", flags: "g" }],
    };
    const out = parseScanOptions(raw);
    expect(out).not.toBeNull();
    expect(out!.crawlDiscovery).toBe(true);
    expect(out!.samplingStrategy).toBe("random");
    expect(out!.maxPerTemplate).toBe(5);
    expect(out!.pageGroups!.templates.match).toEqual(["/p/*", "/q/*"]);
    expect(out!.entityPatterns![0].placeholder).toBe("CITY");
  });

  it("rejects an unknown / unsafe key (strict allowlist)", () => {
    // safeMode is exactly the kind of safety lever a Pro user must NOT be able
    // to set via this surface: the strict schema must reject it.
    const out = parseScanOptions({ crawlDiscovery: true, safeMode: "cli" });
    expect(out).toBeNull();
    expect(scanOptionsSchema.safeParse({ crawlDiscovery: true, safeMode: "cli" }).success).toBe(false);
  });

  it("returns null on a bad type", () => {
    expect(parseScanOptions({ maxPerTemplate: "lots" })).toBeNull();
    expect(parseScanOptions({ samplingStrategy: "fibonacci" })).toBeNull();
    expect(parseScanOptions({ crawlDiscovery: "yes" })).toBeNull();
    expect(parseScanOptions({ maxPerTemplate: 0 })).toBeNull();
  });

  it("returns null on empty / non-object input", () => {
    expect(parseScanOptions({})).toBeNull();
    expect(parseScanOptions(null)).toBeNull();
    expect(parseScanOptions("string")).toBeNull();
    expect(parseScanOptions([])).toBeNull();
  });
});

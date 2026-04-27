import { describe, it, expect } from "vitest";
import { summaryKey } from "@/lib/r2";

describe("summaryKey", () => {
  it("prefixes with reports/ and appends .json", () => {
    expect(summaryKey("abc-123")).toBe("reports/abc-123.json");
  });
});

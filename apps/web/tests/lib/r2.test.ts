import { describe, it, expect } from "vitest";
import { reportKey } from "@/lib/r2";

describe("reportKey", () => {
  it("prefixes with reports/ and appends .html", () => {
    expect(reportKey("abc-123")).toBe("reports/abc-123.html");
  });
});

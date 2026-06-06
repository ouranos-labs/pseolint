import { describe, it, expect } from "vitest";
import { emailInAllowlist } from "@/lib/owner";

describe("emailInAllowlist", () => {
  it("returns false when the allowlist is unset", () => {
    expect(emailInAllowlist("a@b.com", undefined)).toBe(false);
  });

  it("returns false when the email is null/empty", () => {
    expect(emailInAllowlist(null, "a@b.com")).toBe(false);
    expect(emailInAllowlist("", "a@b.com")).toBe(false);
  });

  it("matches a single allowed email case-insensitively", () => {
    expect(emailInAllowlist("Owner@Pseolint.dev", "owner@pseolint.dev")).toBe(true);
  });

  it("matches within a comma-separated list and ignores whitespace", () => {
    expect(emailInAllowlist("b@x.com", "a@x.com, b@x.com , c@x.com")).toBe(true);
  });

  it("returns false for an email not in the list", () => {
    expect(emailInAllowlist("z@x.com", "a@x.com,b@x.com")).toBe(false);
  });
});

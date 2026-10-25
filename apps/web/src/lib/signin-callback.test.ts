import { describe, expect, it } from "vitest";
import {
  callbackContext,
  classifySigninError,
  DEFAULT_CALLBACK,
  resolveCallbackUrl,
  sanitizeCallbackUrl,
  signinErrorUrl,
} from "./signin-callback";

describe("sanitizeCallbackUrl", () => {
  it.each([
    "//evil.com",
    "//evil.com/r/abc",
    "/\\evil.com",
    "https://evil.com",
    "http://evil.com/dashboard",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "evil.com",
    "dashboard",
    "/\tjavascript:alert(1)",
    "/foo\nbar",
    "",
  ])("rejects %j", (raw) => {
    expect(sanitizeCallbackUrl(raw)).toBe(DEFAULT_CALLBACK);
  });

  it.each(["/r/abc?x=1", "/dashboard", "/dashboard/settings", "/pricing?plan=pro", "/?prefill=https%3A%2F%2Fa.com&force=1"])(
    "accepts %j",
    (raw) => {
      expect(sanitizeCallbackUrl(raw)).toBe(raw);
    },
  );

  it("defaults when missing", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe(DEFAULT_CALLBACK);
    expect(sanitizeCallbackUrl(null)).toBe(DEFAULT_CALLBACK);
  });
});

describe("resolveCallbackUrl", () => {
  it("prefers callbackUrl, falls back to legacy next", () => {
    expect(resolveCallbackUrl({ callbackUrl: "/r/a", next: "/r/b" })).toBe("/r/a");
    expect(resolveCallbackUrl({ next: "/dashboard/settings" })).toBe("/dashboard/settings");
    expect(resolveCallbackUrl({ next: "//evil.com" })).toBe(DEFAULT_CALLBACK);
    expect(resolveCallbackUrl({})).toBe(DEFAULT_CALLBACK);
  });
});

describe("callbackContext", () => {
  it("maps known destinations and stays quiet otherwise", () => {
    expect(callbackContext("/r/abc?x=1")).toMatch(/keep this report/);
    expect(callbackContext("/pricing?plan=pro")).toMatch(/checkout/);
    expect(callbackContext("/dashboard/settings")).toMatch(/dashboard/);
    expect(callbackContext("/?prefill=x")).toBeNull();
  });
});

describe("classifySigninError", () => {
  it("classifies magic-link and OAuth failures", () => {
    expect(classifySigninError(null, "email")).toBeNull();
    expect(classifySigninError("INVALID_TOKEN", "email")).toBe("link");
    expect(classifySigninError("access_denied", "google")).toBe("oauth");
    expect(classifySigninError("state_mismatch", "google")).toBe("oauth");
    expect(classifySigninError("failed_to_create_user", "email")).toBe("unknown");
    expect(classifySigninError("whatever", undefined)).toBe("unknown");
  });

  it("builds an errorCallbackURL that round-trips the destination", () => {
    const u = new URL(signinErrorUrl("google", "/r/abc?x=1"), "https://x.test");
    expect(u.pathname).toBe("/signin");
    expect(u.searchParams.get("method")).toBe("google");
    expect(u.searchParams.get("callbackUrl")).toBe("/r/abc?x=1");
  });
});

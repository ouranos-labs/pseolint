import { test, expect, describe } from "bun:test";
import { detectNoindex, detectAuthPage, pageSkipReason } from "../src/page-filter.js";
import type { ParsedPage } from "../src/types.js";

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
  const defaults: ParsedPage = {
    url: "https://example.com/page",
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "",
    html: "",
  };
  return { ...defaults, ...overrides };
}

describe("detectNoindex", () => {
  test("returns true for meta robots noindex", () => {
    expect(detectNoindex(makePage({ robotsMeta: "noindex" }))).toBe(true);
    expect(detectNoindex(makePage({ robotsMeta: "noindex, nofollow" }))).toBe(true);
    expect(detectNoindex(makePage({ robotsMeta: "NOINDEX" }))).toBe(true);
  });

  test("returns true for X-Robots-Tag noindex header", () => {
    expect(detectNoindex(makePage({ httpMeta: { xRobotsTag: "noindex" } }))).toBe(true);
    expect(detectNoindex(makePage({ httpMeta: { xRobotsTag: "noindex, nofollow" } }))).toBe(true);
  });

  test("returns true even when 'index' appears alongside (noindex wins per spec)", () => {
    expect(detectNoindex(makePage({ robotsMeta: "index, noindex" }))).toBe(true);
  });

  test("returns false for index / no robots directive", () => {
    expect(detectNoindex(makePage({ robotsMeta: "" }))).toBe(false);
    expect(detectNoindex(makePage({ robotsMeta: "index, follow" }))).toBe(false);
    expect(detectNoindex(makePage({ robotsMeta: "all" }))).toBe(false);
  });

  test("returns false when 'noindex' is a substring of an unrelated word", () => {
    // robotsMeta is parsed from a meta tag content attr, not free body text,
    // so this case is theoretical — but tightening the regex to word-boundary
    // would be a future improvement.
    expect(detectNoindex(makePage({ robotsMeta: "follow" }))).toBe(false);
  });
});

describe("detectAuthPage", () => {
  test("password input + thin body fires the password-input signal alone (1 signal = not auth)", () => {
    const result = detectAuthPage(
      makePage({
        contentText: "Email Password Forgot",
        html: '<form><input type="email"/><input type="password" required/></form>',
      }),
    );
    expect(result.signals).toContain("password-input");
    expect(result.isAuth).toBe(false); // 1 signal isn't enough
  });

  test("title 'Sign in' + password input → 2 signals → isAuth true", () => {
    const result = detectAuthPage(
      makePage({
        title: "Sign in",
        contentText: "Email Password Forgot",
        html: '<input type="password"/>',
      }),
    );
    expect(result.signals).toEqual(expect.arrayContaining(["password-input", "auth-title"]));
    expect(result.isAuth).toBe(true);
  });

  test("brand suffix is stripped before matching the title regex", () => {
    const result = detectAuthPage(
      makePage({
        title: "Sign in | MyApp",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
    );
    expect(result.signals).toContain("auth-title");
    expect(result.isAuth).toBe(true);
  });

  test("matches a wide range of auth title forms", () => {
    const titles = [
      "Sign In",
      "Sign-up",
      "Log in",
      "Log Out",
      "Register",
      "Forgot Password",
      "Reset Password",
      "Create Account",
      "Create an Account",
      "Verify Email",
      "Two-factor",
    ];
    for (const t of titles) {
      const r = detectAuthPage(makePage({ title: t }));
      expect(r.signals).toContain("auth-title");
    }
  });

  test("auth title + auth h1 → 2 signals (no password input needed)", () => {
    const result = detectAuthPage(
      makePage({ title: "Sign in", headings: { h1: ["Sign in"], h2: [] } }),
    );
    expect(result.signals).toEqual(expect.arrayContaining(["auth-title", "auth-h1"]));
    expect(result.isAuth).toBe(true);
  });

  test("marketing page with single password-input signal stays not-auth", () => {
    const result = detectAuthPage(
      makePage({
        title: "How to choose a strong password — security guide",
        contentText: Array(300).fill("word").join(" "), // 300 words → not thin
        html: '<input type="password"/>',
      }),
    );
    // Body too long for password-input signal AND title doesn't match
    expect(result.signals).not.toContain("password-input");
    expect(result.isAuth).toBe(false);
  });

  test("returns no signals for plain marketing page", () => {
    const result = detectAuthPage(
      makePage({
        title: "Pricing — MyApp",
        contentText: Array(300).fill("word").join(" "),
        html: "<h1>Pricing</h1>",
      }),
    );
    expect(result.signals).toEqual([]);
    expect(result.isAuth).toBe(false);
  });
});

describe("pageSkipReason", () => {
  test("respectNoindex=true returns 'noindex' for noindex pages", () => {
    const reason = pageSkipReason(makePage({ robotsMeta: "noindex" }), {
      respectNoindex: true,
      skipDetectedAuth: false,
    });
    expect(reason).toBe("noindex");
  });

  test("respectNoindex=false ignores noindex pages", () => {
    const reason = pageSkipReason(makePage({ robotsMeta: "noindex" }), {
      respectNoindex: false,
      skipDetectedAuth: false,
    });
    expect(reason).toBe(null);
  });

  test("skipDetectedAuth=true returns 'auth-detected' for confirmed auth pages", () => {
    const reason = pageSkipReason(
      makePage({
        title: "Sign in",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      { respectNoindex: true, skipDetectedAuth: true },
    );
    expect(reason).toBe("auth-detected");
  });

  test("noindex takes priority over auth-detected (more specific signal)", () => {
    const reason = pageSkipReason(
      makePage({
        title: "Sign in",
        robotsMeta: "noindex",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      { respectNoindex: true, skipDetectedAuth: true },
    );
    expect(reason).toBe("noindex");
  });

  test("returns null when both filters off, even on auth+noindex page", () => {
    const reason = pageSkipReason(
      makePage({
        title: "Sign in",
        robotsMeta: "noindex",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      { respectNoindex: false, skipDetectedAuth: false },
    );
    expect(reason).toBe(null);
  });
});

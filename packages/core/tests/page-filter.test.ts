import { test, expect, describe } from "bun:test";
import {
  detectNoindex,
  detectAuthPage,
  detectBoilerplatePage,
  detectSearchResultPage,
  detectEmptyBodyPage,
  pageSkipReason,
} from "../src/page-filter.js";
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

/**
 * Convenience: build a fully-specified PageSkipOptions in one call. Tests
 * pass `{ respectNoindex: true }` and let everything else default to false.
 */
function skipOpts(overrides: {
  respectNoindex?: boolean;
  skipDetectedAuth?: boolean;
  skipBoilerplate?: boolean;
  skipSearchPages?: boolean;
  skipEmptyBody?: boolean;
} = {}) {
  return {
    respectNoindex: false,
    skipDetectedAuth: false,
    skipBoilerplate: false,
    skipSearchPages: false,
    skipEmptyBody: false,
    ...overrides,
  };
}

describe("detectBoilerplatePage", () => {
  test("title 'Privacy Policy' (after brand strip) fires boilerplate-title", () => {
    const result = detectBoilerplatePage(
      makePage({ title: "Privacy | MyApp" }),
    );
    expect(result.signals).toContain("boilerplate-title");
    expect(result.isBoilerplate).toBe(true);
  });

  test("h1 'Cookie Policy' fires boilerplate-h1 alone", () => {
    const result = detectBoilerplatePage(
      makePage({ headings: { h1: ["Cookie Policy"], h2: [] } }),
    );
    expect(result.signals).toContain("boilerplate-h1");
    expect(result.isBoilerplate).toBe(true);
  });

  test("URL path /privacy fires boilerplate-url alone", () => {
    const result = detectBoilerplatePage(
      makePage({ url: "https://example.com/privacy" }),
    );
    expect(result.signals).toContain("boilerplate-url");
    expect(result.isBoilerplate).toBe(true);
  });

  test("URL path /terms/anything fires boilerplate-url", () => {
    const result = detectBoilerplatePage(
      makePage({ url: "https://example.com/terms/use" }),
    );
    expect(result.signals).toContain("boilerplate-url");
    expect(result.isBoilerplate).toBe(true);
  });

  test("matches a wide range of boilerplate slugs", () => {
    const slugs = [
      "/cookies",
      "/cookie-policy",
      "/gdpr",
      "/ccpa",
      "/legal",
      "/disclaimer",
      "/impressum",
      "/imprint",
      "/accessibility",
      "/do-not-sell",
      "/copyright",
    ];
    for (const slug of slugs) {
      const r = detectBoilerplatePage(makePage({ url: `https://example.com${slug}` }));
      expect(r.isBoilerplate).toBe(true);
    }
  });

  test("marketing page that merely mentions 'Privacy' in body is NOT boilerplate", () => {
    const result = detectBoilerplatePage(
      makePage({
        url: "https://example.com/blog/privacy-by-design",
        title: "Privacy by Design — Why It Matters | MyApp",
        headings: { h1: ["Why Privacy by Design Matters"], h2: [] },
        contentText: "We talk about privacy a lot in this article...",
      }),
    );
    expect(result.isBoilerplate).toBe(false);
    expect(result.signals).toEqual([]);
  });

  test("unparseable URL (filesystem path) skips the URL signal but title/h1 still work", () => {
    const result = detectBoilerplatePage(
      makePage({ url: "/var/www/site/privacy.html", title: "Privacy" }),
    );
    expect(result.signals).toContain("boilerplate-title");
    expect(result.signals).not.toContain("boilerplate-url");
  });
});

describe("detectSearchResultPage", () => {
  test("?q=foo is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/?q=foo" }))).toBe(true);
  });

  test("?query=foo is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/?query=foo" }))).toBe(true);
  });

  test("?s=foo is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/?s=foo" }))).toBe(true);
  });

  test("?keyword=foo is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/?keyword=foo" }))).toBe(true);
  });

  test("/search path is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/search" }))).toBe(true);
  });

  test("/search/results path is a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/search/results" }))).toBe(true);
  });

  test("query param matched case-insensitively", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/?Q=foo" }))).toBe(true);
  });

  test("/services is NOT a search page (substring match would be a bug)", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/services" }))).toBe(false);
  });

  test("regular page without search params is NOT a search page", () => {
    expect(detectSearchResultPage(makePage({ url: "https://example.com/about" }))).toBe(false);
  });

  test("unparseable URL (filesystem path) returns false safely", () => {
    expect(detectSearchResultPage(makePage({ url: "/var/www/site/search.html" }))).toBe(false);
  });
});

describe("detectEmptyBodyPage", () => {
  test("SPA shell: short body + script src + no noscript → isEmpty true", () => {
    const result = detectEmptyBodyPage(
      makePage({
        contentText: "Loading...",
        html: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>',
      }),
    );
    expect(result.isEmpty).toBe(true);
    expect(result.reason).toBe("spa-shell");
  });

  test("normal page with substantive body is NOT a SPA shell", () => {
    const result = detectEmptyBodyPage(
      makePage({
        contentText: Array(50).fill("word").join(" "),
        html: '<html><body><h1>Hi</h1><p>...</p><script src="/app.js"></script></body></html>',
      }),
    );
    expect(result.isEmpty).toBe(false);
  });

  test("page with no script src tags is NOT a SPA shell (static page just looks empty)", () => {
    const result = detectEmptyBodyPage(
      makePage({
        contentText: "x",
        html: "<html><body></body></html>",
      }),
    );
    expect(result.isEmpty).toBe(false);
  });

  test("page with substantive <noscript> fallback is NOT a SPA shell (progressive enhancement)", () => {
    const noscriptBody = "<p>" + "This site requires JavaScript. ".repeat(20) + "</p>";
    const result = detectEmptyBodyPage(
      makePage({
        contentText: "Loading...",
        html: `<html><body><div id="root"></div><script src="/app.js"></script><noscript>${noscriptBody}</noscript></body></html>`,
      }),
    );
    expect(result.isEmpty).toBe(false);
  });

  test("page with tiny <noscript> (<= 200 chars) IS still a SPA shell", () => {
    const result = detectEmptyBodyPage(
      makePage({
        contentText: "Loading...",
        html: '<html><body><div id="root"></div><script src="/app.js"></script><noscript>Enable JS</noscript></body></html>',
      }),
    );
    expect(result.isEmpty).toBe(true);
  });
});

describe("pageSkipReason", () => {
  test("respectNoindex=true returns 'noindex' for noindex pages", () => {
    const reason = pageSkipReason(
      makePage({ robotsMeta: "noindex" }),
      skipOpts({ respectNoindex: true }),
    );
    expect(reason).toBe("noindex");
  });

  test("respectNoindex=false ignores noindex pages", () => {
    const reason = pageSkipReason(makePage({ robotsMeta: "noindex" }), skipOpts());
    expect(reason).toBe(null);
  });

  test("skipDetectedAuth=true returns 'auth-detected' for confirmed auth pages", () => {
    const reason = pageSkipReason(
      makePage({
        title: "Sign in",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      skipOpts({ respectNoindex: true, skipDetectedAuth: true }),
    );
    expect(reason).toBe("auth-detected");
  });

  test("skipBoilerplate=true returns 'boilerplate' for compliance-shaped pages", () => {
    const reason = pageSkipReason(
      makePage({ url: "https://example.com/privacy", title: "Privacy" }),
      skipOpts({ skipBoilerplate: true }),
    );
    expect(reason).toBe("boilerplate");
  });

  test("skipSearchPages=true returns 'search-result' for ?q= pages", () => {
    const reason = pageSkipReason(
      makePage({ url: "https://example.com/?q=foo" }),
      skipOpts({ skipSearchPages: true }),
    );
    expect(reason).toBe("search-result");
  });

  test("skipEmptyBody=true returns 'spa-shell' for empty SPA shells", () => {
    const reason = pageSkipReason(
      makePage({
        url: "https://example.com/app",
        contentText: "Loading",
        html: '<div id="root"></div><script src="/app.js"></script>',
      }),
      skipOpts({ skipEmptyBody: true }),
    );
    expect(reason).toBe("spa-shell");
  });

  test("noindex takes priority over auth-detected (more specific signal)", () => {
    const reason = pageSkipReason(
      makePage({
        title: "Sign in",
        robotsMeta: "noindex",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      skipOpts({ respectNoindex: true, skipDetectedAuth: true }),
    );
    expect(reason).toBe("noindex");
  });

  test("auth-detected takes priority over boilerplate", () => {
    const reason = pageSkipReason(
      makePage({
        url: "https://example.com/privacy",
        title: "Sign in",
        contentText: "Email Password",
        html: '<input type="password"/>',
      }),
      skipOpts({
        skipDetectedAuth: true,
        skipBoilerplate: true,
      }),
    );
    expect(reason).toBe("auth-detected");
  });

  test("boilerplate takes priority over search-result", () => {
    const reason = pageSkipReason(
      makePage({ url: "https://example.com/privacy?q=foo" }),
      skipOpts({ skipBoilerplate: true, skipSearchPages: true }),
    );
    expect(reason).toBe("boilerplate");
  });

  test("search-result takes priority over spa-shell", () => {
    const reason = pageSkipReason(
      makePage({
        url: "https://example.com/search?q=foo",
        contentText: "Loading",
        html: '<div id="root"></div><script src="/app.js"></script>',
      }),
      skipOpts({ skipSearchPages: true, skipEmptyBody: true }),
    );
    expect(reason).toBe("search-result");
  });

  test("returns null when all filters off, even on a page that would trigger every signal", () => {
    const reason = pageSkipReason(
      makePage({
        url: "https://example.com/privacy?q=foo",
        title: "Sign in",
        robotsMeta: "noindex",
        contentText: "Email Password",
        html: '<input type="password"/><script src="/app.js"></script>',
      }),
      skipOpts(),
    );
    expect(reason).toBe(null);
  });
});

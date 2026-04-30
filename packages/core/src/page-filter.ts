/**
 * Page-skip detection helpers used by the auditor pipeline (v0.4.1+).
 *
 * Five policy filters live here, each gated by an AuditOption:
 *   - `detectNoindex(page)` honours `<meta name="robots" content="noindex">`
 *     and `X-Robots-Tag: noindex` HTTP headers. The site owner already told
 *     Google not to index these pages — auditing them produces noise the
 *     reader can't act on.
 *   - `detectAuthPage(page)` heuristically classifies pages as
 *     login / signup / password-reset based on three signals (password input
 *     in a thin body, title matches the auth regex, H1 matches the auth
 *     regex). Two signals are required for a positive verdict, which keeps
 *     the false-positive rate low: a marketing landing page with a single
 *     password input or a single auth-shaped heading won't trip it.
 *   - `detectBoilerplatePage(page)` (v0.4.2) flags cookie / legal / consent /
 *     imprint pages. A single signal is enough because the patterns are
 *     anchored + specific (the title or H1 matches the whole-string compliance
 *     regex, or the URL path is one of the well-known compliance slugs).
 *   - `detectSearchResultPage(page)` (v0.4.2) flags pages that look like
 *     internal search-result URLs (query parameter `q` / `query` / `search` /
 *     `s` / `keyword`, or path under `/search`). Per Google's own guidance
 *     these should be noindex'd — auditing them generates noise.
 *   - `detectEmptyBodyPage(page)` (v0.4.2) flags un-hydrated SPA shells:
 *     body text < 100 chars, script tags present, and no substantive
 *     `<noscript>` fallback. These fail every content rule but the underlying
 *     fix is server-side rendering, not content quality.
 *
 * All functions are pure and synchronous so they can be called inside the
 * `parsedPages` map step without disrupting the existing pipeline shape.
 */

import type { ParsedPage } from "./types.js";

/**
 * Returns true when the page is explicitly noindex'd via either the parsed
 * `<meta name="robots">` content or the `X-Robots-Tag` HTTP response header.
 * Match is case-insensitive and substring-based to tolerate combined
 * directives like `"noindex, nofollow"` or `"index, noindex"` (the latter is
 * a common bug — `noindex` wins per spec).
 */
export function detectNoindex(page: ParsedPage): boolean {
  const metaRobots = (page.robotsMeta ?? "").toLowerCase();
  const xRobots = (page.httpMeta?.xRobotsTag ?? "").toLowerCase();
  return metaRobots.includes("noindex") || xRobots.includes("noindex");
}

/**
 * Auth-shaped page title pattern, applied AFTER stripping the brand suffix.
 * Matches "Sign in", "Sign-In", "Log in", "Log-Out", "Register", "Sign up",
 * "Forgot password", "Reset password", "Create account", "Verify email" and
 * common variants. Case-insensitive; whole-string match (anchored).
 */
const AUTH_TITLE_REGEX =
  /^(sign[-\s]?in|sign[-\s]?up|sign[-\s]?out|log[-\s]?in|log[-\s]?out|register|forgot[-\s]password|reset[-\s]password|create[-\s](?:an[-\s])?account|verify[-\s](?:your[-\s])?email|two[-\s]?factor|account[-\s]recovery)$/i;

/**
 * Common brand-suffix separators. We split on the FIRST occurrence and keep
 * everything before it — typical pattern is `Sign in | MyApp` or
 * `Sign in - MyApp` or `Sign in · MyApp`. Without this strip, the regex
 * would never match because the title would be `Sign in | MyApp`, not just
 * `Sign in`.
 */
const BRAND_SEPARATORS = [" | ", " - ", " — ", " · ", " : ", " :: "];

function stripBrandSuffix(title: string): string {
  let cut = title.length;
  for (const sep of BRAND_SEPARATORS) {
    const idx = title.indexOf(sep);
    if (idx >= 0 && idx < cut) cut = idx;
  }
  return title.slice(0, cut).trim();
}

export interface AuthDetectionResult {
  isAuth: boolean;
  signals: Array<"password-input" | "auth-title" | "auth-h1">;
}

/**
 * Heuristic auth-page detection. Returns `isAuth: true` when 2+ signals
 * fire (high confidence). Single-signal pages return `isAuth: false` but
 * still expose the signal list for diagnostics — useful for tracking
 * borderline cases that might warrant a manual config exclude.
 */
export function detectAuthPage(page: ParsedPage): AuthDetectionResult {
  const signals: AuthDetectionResult["signals"] = [];

  const wordCount = (page.contentText ?? "").split(/\s+/).filter(Boolean).length;
  const h2Count = (page.headings?.h2 ?? []).length;
  const hasPasswordInput = /<input\b[^>]*\btype\s*=\s*["']?password["']?/i.test(page.html ?? "");
  if (hasPasswordInput && wordCount < 200 && h2Count < 3) {
    signals.push("password-input");
  }

  const cleanedTitle = stripBrandSuffix(page.title ?? "");
  if (cleanedTitle && AUTH_TITLE_REGEX.test(cleanedTitle)) {
    signals.push("auth-title");
  }

  const firstH1 = (page.headings?.h1 ?? [])[0]?.trim() ?? "";
  if (firstH1 && AUTH_TITLE_REGEX.test(firstH1)) {
    signals.push("auth-h1");
  }

  return { isAuth: signals.length >= 2, signals };
}

/**
 * Boilerplate (cookie / legal / consent / imprint) title and H1 pattern.
 * Whole-string match (anchored), case-insensitive. Applied to the title
 * AFTER stripping the brand suffix (`Privacy Policy | MyApp` → `Privacy`).
 */
const BOILERPLATE_TITLE_REGEX =
  /^(cookie|cookies|cookie[-\s]?policy|gdpr|ccpa|privacy|terms|terms[-\s](?:of[-\s])?(?:use|service|sale)|legal|disclaimer|impressum|imprint|do[-\s]not[-\s]sell|accessibility(?:[-\s]statement)?|copyright[-\s]notice)$/i;

/**
 * Boilerplate URL pathname pattern. Matches `/cookies`, `/cookie-policy`,
 * `/privacy`, `/terms/anything`, `/impressum`, etc. Anchored at path start
 * so a marketing URL like `/blog/privacy-by-design` is NOT matched.
 */
const BOILERPLATE_URL_REGEX =
  /^\/(?:cookies?|cookie-policy|gdpr|ccpa|privacy|terms|legal|disclaimer|impressum|imprint|accessibility|do-not-sell|copyright)(?:\/.*)?$/i;

export interface BoilerplateDetectionResult {
  isBoilerplate: boolean;
  signals: Array<"boilerplate-title" | "boilerplate-h1" | "boilerplate-url">;
}

/**
 * Heuristic boilerplate-page detection. Single-signal trigger (1+ = positive)
 * because the patterns are anchored and specific — a marketing page that
 * merely mentions "privacy" in its body won't fire any signal. Cookie / legal
 * / consent / imprint pages exist for compliance, never as SEO targets, so
 * auditing them produces routine findings the user already knows about.
 */
export function detectBoilerplatePage(page: ParsedPage): BoilerplateDetectionResult {
  const signals: BoilerplateDetectionResult["signals"] = [];

  const cleanedTitle = stripBrandSuffix(page.title ?? "");
  if (cleanedTitle && BOILERPLATE_TITLE_REGEX.test(cleanedTitle)) {
    signals.push("boilerplate-title");
  }

  const firstH1 = (page.headings?.h1 ?? [])[0]?.trim() ?? "";
  if (firstH1 && BOILERPLATE_TITLE_REGEX.test(firstH1)) {
    signals.push("boilerplate-h1");
  }

  // URL pathname check. `page.url` may be a filesystem path on local audits,
  // so wrap the URL parse in try/catch and skip the signal on failure.
  try {
    const pathname = new URL(page.url).pathname;
    if (BOILERPLATE_URL_REGEX.test(pathname)) {
      signals.push("boilerplate-url");
    }
  } catch {
    // unparseable URL (filesystem path); skip the URL signal
  }

  return { isBoilerplate: signals.length >= 1, signals };
}

/**
 * Search-result query parameter names we treat as evidence of an internal
 * search-result page. Compared case-insensitively against the URL's
 * searchParams keys.
 */
const SEARCH_QUERY_PARAMS = new Set(["q", "query", "search", "s", "keyword"]);

/**
 * Returns true when the URL has search-result hallmarks: a recognised search
 * query parameter (`?q=`, `?query=`, `?search=`, `?s=`, `?keyword=`) or a
 * pathname of `/search` or starting with `/search/`. Returns false for
 * unparseable URLs (e.g. filesystem paths from local directory audits).
 */
export function detectSearchResultPage(page: ParsedPage): boolean {
  let parsed: URL;
  try {
    parsed = new URL(page.url);
  } catch {
    return false;
  }

  for (const key of parsed.searchParams.keys()) {
    if (SEARCH_QUERY_PARAMS.has(key.toLowerCase())) return true;
  }

  const pathname = parsed.pathname;
  if (pathname === "/search" || pathname.startsWith("/search/")) return true;

  return false;
}

export interface EmptyBodyDetectionResult {
  isEmpty: boolean;
  reason?: string;
}

/**
 * Heuristic detection of un-hydrated SPA shells. Three conditions must hold:
 *   1. `contentText` (post-render-or-parse body text) trimmed < 100 chars
 *   2. The HTML contains at least one `<script src=...>` tag (script-driven)
 *   3. No substantive `<noscript>` fallback (combined noscript content
 *      <= 200 chars). A page with a long noscript block is doing
 *      progressive enhancement, not failing — don't flag it.
 *
 * Returns `{ isEmpty: true, reason: "spa-shell" }` when all three hold.
 */
export function detectEmptyBodyPage(page: ParsedPage): EmptyBodyDetectionResult {
  const bodyLen = (page.contentText ?? "").trim().length;
  if (bodyLen >= 100) return { isEmpty: false };

  const html = page.html ?? "";
  if (!/<script\s[^>]*src\s*=/i.test(html)) return { isEmpty: false };

  // Sum the visible content length of every <noscript>...</noscript> block.
  // If the site provides a substantive noscript fallback, it's a
  // progressive-enhancement page, not a broken SPA shell.
  let noscriptTextLen = 0;
  const noscriptRe = /<noscript[^>]*>([\s\S]*?)<\/noscript>/gi;
  let match: RegExpExecArray | null;
  while ((match = noscriptRe.exec(html)) !== null) {
    noscriptTextLen += match[1]!.replace(/<[^>]+>/g, "").trim().length;
    if (noscriptTextLen > 200) break;
  }
  if (noscriptTextLen > 200) return { isEmpty: false };

  return { isEmpty: true, reason: "spa-shell" };
}

/**
 * Combined skip decision for the auditor pipeline. Returns the reason string
 * to surface in `summary.skippedUrls` diagnostics, or `null` when the page
 * should be audited normally. Order matters — the priority is:
 *   `noindex` > `auth-detected` > `boilerplate` > `search-result` > `spa-shell`.
 *
 *   - `noindex` first: the site-owner-declared signal beats every heuristic.
 *   - `auth-detected` next: a confirmed auth surface wins over generic
 *     boilerplate / search / shell heuristics.
 *   - `boilerplate` next: a clearly compliance-page-shaped URL beats the
 *     generic search/shell signals.
 *   - `search-result` next: explicit search hallmarks beat the empty-body
 *     fallback (a search page MAY be a SPA but the better label is "search").
 *   - `spa-shell` last: the most generic "we couldn't audit this" reason.
 */
export interface PageSkipOptions {
  respectNoindex: boolean;
  skipDetectedAuth: boolean;
  skipBoilerplate: boolean;
  skipSearchPages: boolean;
  skipEmptyBody: boolean;
}

export function pageSkipReason(
  page: ParsedPage,
  options: PageSkipOptions,
): "noindex" | "auth-detected" | "boilerplate" | "search-result" | "spa-shell" | null {
  if (options.respectNoindex && detectNoindex(page)) return "noindex";
  if (options.skipDetectedAuth && detectAuthPage(page).isAuth) return "auth-detected";
  if (options.skipBoilerplate && detectBoilerplatePage(page).isBoilerplate) return "boilerplate";
  if (options.skipSearchPages && detectSearchResultPage(page)) return "search-result";
  if (options.skipEmptyBody && detectEmptyBodyPage(page).isEmpty) return "spa-shell";
  return null;
}

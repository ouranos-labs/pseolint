/**
 * Page-skip detection helpers used by the auditor pipeline (v0.4.1).
 *
 * Two policy filters live here, each gated by an AuditOption:
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
 *
 * Both functions are pure and synchronous so they can be called inside the
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
 * Combined skip decision for the auditor pipeline. Returns the reason string
 * to surface in `summary.skippedUrls` diagnostics, or `null` when the page
 * should be audited normally. Order matters: `noindex` takes priority over
 * `auth-detected` because it's the more specific (site-owner-declared) signal.
 */
export interface PageSkipOptions {
  respectNoindex: boolean;
  skipDetectedAuth: boolean;
}

export function pageSkipReason(
  page: ParsedPage,
  options: PageSkipOptions,
): "noindex" | "auth-detected" | null {
  if (options.respectNoindex && detectNoindex(page)) return "noindex";
  if (options.skipDetectedAuth && detectAuthPage(page).isAuth) return "auth-detected";
  return null;
}

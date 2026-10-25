/**
 * Post-sign-in destination handling. Shared by the /signin server page and the
 * client form so both sign-in methods and the already-signed-in redirect agree.
 *
 * `callbackUrl` is the one canonical query param; `next` is accepted as a
 * legacy alias so old links keep working.
 */

export const DEFAULT_CALLBACK = "/dashboard";

/**
 * Restrict a post-sign-in destination to a same-origin relative path, which
 * prevents open-redirect abuse. Rejects protocol-relative ("//evil.com"),
 * backslash variants ("/\\evil.com", which browsers normalize to "//"),
 * absolute URLs and any scheme ("javascript:"), and control characters.
 */
export function sanitizeCallbackUrl(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return DEFAULT_CALLBACK;
  if (!raw.startsWith("/")) return DEFAULT_CALLBACK;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_CALLBACK;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_CALLBACK;
  // Final check: resolving against a dummy origin must stay on that origin.
  try {
    const base = "https://callback.invalid";
    if (new URL(raw, base).origin !== base) return DEFAULT_CALLBACK;
  } catch {
    return DEFAULT_CALLBACK;
  }
  return raw;
}

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** Pick `callbackUrl`, falling back to the legacy `next`, then sanitize. */
export function resolveCallbackUrl(params: { callbackUrl?: Param; next?: Param }): string {
  return sanitizeCallbackUrl(first(params.callbackUrl) ?? first(params.next));
}

/** True when the request named a destination (so the context line applies). */
export function hasExplicitCallback(params: { callbackUrl?: Param; next?: Param }): boolean {
  return Boolean(first(params.callbackUrl) ?? first(params.next));
}

/** One honest line explaining why the visitor is being asked to sign in. */
export function callbackContext(callbackUrl: string): string | null {
  const path = callbackUrl.split(/[?#]/, 1)[0];
  if (path.startsWith("/r/")) return "Sign in to keep this report (kept 30 days on a free account).";
  if (path === "/pricing" || path.startsWith("/pricing/")) return "Sign in to continue to checkout.";
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return "Sign in to open your dashboard.";
  return null;
}

export type SigninErrorKind = "link" | "oauth" | "unknown";
export type SigninMethod = "email" | "google";

/**
 * Build the errorCallbackURL handed to better-auth. better-auth sets its own
 * `error` code on it (magic link: INVALID_TOKEN for expired or already-used
 * tokens; OAuth: the provider's error such as access_denied, or state_mismatch
 * and friends), so the failing method travels in `method`, not in `error`.
 */
export function signinErrorUrl(method: SigninMethod, callbackUrl: string): string {
  return `/signin?${new URLSearchParams({ method, callbackUrl }).toString()}`;
}

/** Map an `?error=` code (plus the failing method) to a message kind. */
export function classifySigninError(
  code: string | null | undefined,
  method: string | null | undefined,
): SigninErrorKind | null {
  if (!code) return null;
  if (method === "google") return "oauth";
  const c = code.toUpperCase();
  if (c === "INVALID_TOKEN" || c === "EXPIRED_TOKEN" || c === "ATTEMPTS_EXCEEDED") return "link";
  return "unknown";
}

/** Must match `expiresIn` of the magicLink plugin in lib/auth.ts (60 * 15 s). */
export const MAGIC_LINK_TTL_MINUTES = 15;

export const SIGNIN_ERROR_COPY: Record<SigninErrorKind, string> = {
  link: `That sign-in link expired or was already used. Links last ${MAGIC_LINK_TTL_MINUTES} minutes. Send a new one below.`,
  oauth: "Google sign-in didn't complete. Try again, or use email instead.",
  unknown: "Something went wrong signing you in. Try again below.",
};

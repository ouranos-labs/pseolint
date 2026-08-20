/**
 * Normalize a user-typed site URL: trim whitespace, prepend `https://` when no
 * scheme is present, and validate it parses as an HTTP(S) URL with a real host.
 *
 * Returns the canonical URL string, or null when the input is empty or
 * structurally invalid (no host, unsupported scheme, garbage characters).
 *
 * Single source of truth: call from server actions, API handlers, and client
 * forms (on blur/submit) so users never have to type the scheme themselves.
 *
 * Safe for both client and server: only depends on the global `URL` constructor.
 */
export function normalizeUserUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Reject hostless inputs ("https://", "https:///"), and require at least
    // one dot so we don't accept random tokens like "localhost" or "example".
    // Locally-hosted dev URLs are blocked by SSRF guard separately.
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Locale-pinned formatters.
 *
 * `toLocaleDateString()` / `toLocaleString()` with no locale argument resolve
 * against the *runtime's* default: Node's ICU on the server, the visitor's
 * browser setting on the client. Server-rendered markup therefore says
 * "Jul 30" while the client re-renders "30 juil." for a French visitor, and
 * React throws a hydration mismatch and regenerates the whole tree. The same
 * trap applies to numbers ("1,000" vs "1 000").
 *
 * Pinning the locale is the fix, not `suppressHydrationWarning`: the warning is
 * reporting a real divergence, and suppressing it keeps the client re-render.
 * en-US because the UI copy is English throughout; if the product is ever
 * localised, this constant becomes a request-scoped value and every call site
 * already routes through here.
 */
const LOCALE = "en-US";

/** "Jul 30, 2026" */
export function formatDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(LOCALE);
}

/** "Jul 30" — axis labels and dense strips. */
export function formatShortDate(value: Date | string | number): string {
  return new Date(value).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

/** "7/30/2026, 3:01:15 PM" */
export function formatDateTime(value: Date | string | number): string {
  return new Date(value).toLocaleString(LOCALE);
}

/** "1,234" */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}

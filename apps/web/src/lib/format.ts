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

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" (past only). */
export function formatRelative(value: Date | string | number, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Display label for a stored lowercase run status ("queued" → "Queued"). */
export function formatStatus(status: string): string {
  const known: Record<string, string> = {
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    expired: "Expired",
    aborted: "Stopped",
    pending: "Pending",
  };
  return known[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

/** "1,234" */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}

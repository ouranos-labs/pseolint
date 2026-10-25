/**
 * The one result shape every dashboard server action returns instead of
 * throwing. A thrown Error from a server action escapes to the nearest route
 * error boundary, which replaces the whole page and discards whatever the user
 * typed. Returning the failure keeps them on the form, with the message next to
 * the field that caused it.
 *
 * `message` on success is optional copy for the transient toast; `field` on
 * failure names the form control the error belongs to (its `name`).
 */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; field?: string };

/** Appended to every validation failure so the user knows nothing half-applied. */
export const NOTHING_SAVED = "Nothing was saved.";

/**
 * Turn a JSON.parse failure into a sentence that points at the line, e.g.
 * "Page groups isn't valid JSON (line 3). Nothing was saved."
 *
 * V8 reports either "(line N column M)" or "at position N" depending on the
 * error, so both are handled; the position is converted to a line number
 * against the raw input.
 */
export function jsonErrorMessage(label: string, raw: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  let line: number | null = null;
  const byLine = /line (\d+)/i.exec(msg);
  if (byLine) {
    line = Number(byLine[1]);
  } else {
    const byPos = /position (\d+)/i.exec(msg);
    if (byPos) line = raw.slice(0, Number(byPos[1])).split("\n").length;
  }
  return `${label} isn't valid JSON${line ? ` (line ${line})` : ""}. ${NOTHING_SAVED}`;
}

/**
 * Map the terse machine errors some actions return ("not found", "not signed
 * in") to sentences that say what happened and what to do next. Anything else
 * is already user-facing copy and passes through unchanged.
 */
export function friendlyActionError(error: string): string {
  const e = error.trim().toLowerCase();
  if (e === "not signed in" || e === "unauthorized") {
    return "Your session expired. Sign in again, then retry.";
  }
  if (e === "not found") {
    return "We couldn't find this in your workspace. It may have been removed in another tab; reload the page.";
  }
  return error;
}

/** Loose shape check for one email address (the mail provider is the real validator). */
export function isPlausibleEmail(s: string): boolean {
  return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(s);
}

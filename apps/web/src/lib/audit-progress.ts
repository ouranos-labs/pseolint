/**
 * Pure state rules for the /a/[id] progress page (unit-tested).
 *
 * The page used to treat any non-OK poll as "Audit failed", so one network
 * blip, or a malformed id answering 500, painted a permanent failure next to
 * a still-animating progress grid. These rules keep the three situations
 * apart: the audit is gone (stop, not-found), the connection hiccuped (retry
 * quietly with backoff), or the audit itself reported failure.
 */

export const POLL_INTERVAL_MS = 2000;
export const MAX_BACKOFF_MS = 30_000;
/** Past this the page says it's taking longer than usual (but the link stays valid). */
export const SLOW_AFTER_SEC = 120;
/** Past this the page says the audit seems stuck and offers to start over. */
export const STUCK_AFTER_SEC = 600;

export type PollOutcome = "ok" | "gone" | "transient";

/** 404/403 mean the audit doesn't exist for this viewer; everything else non-OK is worth retrying. */
export function classifyPollStatus(status: number): PollOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 403 || status === 410) return "gone";
  return "transient";
}

/** Exponential backoff after `consecutiveFailures` failed polls: 2s, 4s, 8s ... capped at 30s. */
export function nextPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** consecutiveFailures);
}

export type ProgressPhase = "normal" | "slow" | "stuck";

export function progressPhase(elapsedSec: number): ProgressPhase {
  if (elapsedSec >= STUCK_AFTER_SEC) return "stuck";
  if (elapsedSec >= SLOW_AFTER_SEC) return "slow";
  return "normal";
}

/** Whole seconds since `createdAtIso` (the audit's own clock, not page mount). */
export function elapsedSince(createdAtIso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!createdAtIso) return null;
  const t = Date.parse(createdAtIso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

/** "45s" / "3m 05s": the elapsed clock label. */
export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${String(sec % 60).padStart(2, "0")}s`;
}

/**
 * Explicit dev bypasses. Each flag is opt-in via env var, with a NODE_ENV fallback
 * so local `bun run dev` Just Works without editing .env.local.
 *
 * In production (NODE_ENV === "production"), the NODE_ENV fallback never engages,
 * so bypasses require the explicit env var — preventing a misconfigured preview
 * deployment from silently disabling safeguards.
 */

const isLocalDev = process.env.NODE_ENV !== "production";

function flag(envVar: string, fallbackOn = isLocalDev): boolean {
  const v = process.env[envVar];
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallbackOn;
}

export const devFlags = {
  /** Skip Turnstile bot check. */
  get botCheckDisabled(): boolean {
    return flag("DISABLE_BOT_CHECK");
  },
  /** Skip per-user and per-host rate limits. */
  get rateLimitDisabled(): boolean {
    return flag("DISABLE_RATE_LIMIT");
  },
  /** Use in-memory Map instead of R2 for reports/summaries. */
  get r2Disabled(): boolean {
    return flag("DEV_SKIP_R2");
  },
  /** Route Inngest events to localhost:8288 instead of the cloud. */
  get inngestLocal(): boolean {
    return flag("DEV_INNGEST_LOCAL");
  },
};

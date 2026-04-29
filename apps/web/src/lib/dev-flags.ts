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
  /** Skip per-user and per-host rate limits. */
  get rateLimitDisabled(): boolean {
    return flag("DISABLE_RATE_LIMIT");
  },
  /** Route Inngest events to localhost:8288 instead of the cloud. */
  get inngestLocal(): boolean {
    return flag("DEV_INNGEST_LOCAL");
  },
  /**
   * Treat every sessioned user as Pro — bypasses paywalls in the request path
   * (visibility toggle, AI triage, audit retention, page caps).
   * Does NOT affect server-side jobs (weekly digest, monitoring cron) which
   * still read `userProfiles.plan` directly so dev never accidentally schedules
   * monitoring/digest work for unverified accounts.
   */
  get proBypass(): boolean {
    return flag("DEV_PRO_BYPASS");
  },
  /**
   * Auto-mark monitored domains as verified at insert/reactivate time so the
   * cron will pick them up locally without a real DNS TXT record. Only the
   * write side is affected — the cron's `isNotNull(verifiedAt)` filter is
   * left intact so prod behavior is unchanged.
   */
  get domainVerifySkipped(): boolean {
    return flag("DEV_SKIP_DOMAIN_VERIFY");
  },
};

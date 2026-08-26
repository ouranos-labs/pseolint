/**
 * The single source of truth for pseolint.dev analytics events.
 *
 * Adding a tracking call site without adding to this union is a compile error;
 * every event's payload is typed here in exactly one place. Plain pageviews are
 * NOT in this union: they are emitted automatically by `trackScreenViews` on
 * the client provider.
 */
/** Mirrors `AuditTrigger` in lib/inngest.ts. Duplicated rather than imported
 *  so this catalog stays free of server-only imports (it is used on both
 *  sides of the client boundary). */
export type AuditTrigger = "user" | "monitor" | "dashboard";

export type AuditBlockReason =
  | "session_limit" | "domain_limit" | "daily_limit"
  | "invalid_url" | "private_url" | "bot_check"
  | "paused" | "origin_unreachable" | "origin_degraded";

/** Every place in the product that sends someone to /pricing. Keep this list
 *  exhaustive: an upgrade CTA that isn't here is a conversion path we cannot
 *  see. */
export type UpgradeSource =
  | "nav" | "landing" | "dashboard" | "sidebar" | "account_menu"
  | "billing" | "integrations" | "history" | "limit_block"
  | "report_export" | "report_visibility";

export type AnalyticsEvent =
  // ── Audit funnel ─────────────────────────────
  | { name: "audit_form_engaged"; props?: undefined }
  | { name: "audit_submitted"; props: { host: string; force: boolean; source: "landing" | "cta" } }
  | { name: "audit_submit_failed"; props: { status: number; code?: string } }
  | { name: "audit_created"; props: { host: string; cached: boolean; authed: boolean } }
  | { name: "audit_blocked"; props: { reason: AuditBlockReason; status: number } }
  | { name: "audit_completed"; props: { host: string; score: number; pageCount: number; findingCount: number; durationMs: number; classification: string | null; truncated: boolean; authed: boolean; trigger: AuditTrigger } }
  | { name: "audit_failed"; props: { host: string; reason: string; trigger: AuditTrigger } }
  | { name: "report_viewed"; props: { slug: string; cached: boolean; owned: boolean } }
  | { name: "report_exported"; props: { format: string } }
  // ── Accounts ─────────────────────────────────
  | { name: "signin_started"; props: { method: "magic_link" | "google" } }
  // anonId is the cross-day attribution join key. `deviceId` cannot serve:
  // it is a daily-rotating IP+UA hash, so it never spans two calendar days
  // (verified: 165/165 device ids appear on exactly one day). The anon cookie
  // lasts 30 days, and it is already this visitor's analytics profile id, so
  // recording it here links the account to the anonymous profile that holds
  // their pre-signup audit and its acquisition session. Null when they signed
  // up without ever running an anonymous audit.
  | { name: "signed_in"; props: { isNewUser: boolean; anonId: string | null } }
  // ── Monetization ─────────────────────────────
  | { name: "upgrade_clicked"; props: { source: UpgradeSource } }
  | { name: "checkout_started"; props: { interval: "monthly" | "yearly" } }
  | { name: "checkout_redirected"; props: { interval: "monthly" | "yearly" } }
  | { name: "subscription_started"; props: { interval: "monthly" | "yearly" | "unknown"; intent: string | null } }
  | { name: "subscription_canceled"; props: { immediate: boolean } }
  // ── Engagement ───────────────────────────────
  | { name: "monitoring_domain_added"; props: { host: string } }
  | { name: "manifest_created"; props?: undefined }
  | { name: "integration_connect_clicked"; props: { provider: "gsc" | "webflow" | "wordpress" } }
  | { name: "gsc_connected"; props?: undefined }
  | { name: "mcp_key_created"; props?: undefined }
  | { name: "triage_action"; props: { action: string } }
  // ── Top-of-funnel content ────────────────────
  | { name: "tool_viewed"; props: { tool: string } }
  | { name: "tool_run"; props: { tool: string } }
  | { name: "rule_viewed"; props: { ruleId: string } }
  | { name: "symptom_viewed"; props: { symptom: string } }
  | { name: "leaderboard_entry_clicked"; props: { host: string } }
  | { name: "cta_clicked"; props: { location: string } };

/** Normalize an event into the (name, properties) pair both SDKs accept. */
export function toTrackArgs(event: AnalyticsEvent): [string, Record<string, unknown>] {
  return [event.name, (("props" in event && event.props) ? event.props : {}) as Record<string, unknown>];
}

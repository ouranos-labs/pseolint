/**
 * The single source of truth for pseolint.dev analytics events.
 *
 * Adding a tracking call site without adding to this union is a compile error;
 * every event's payload is typed here in exactly one place. Plain pageviews are
 * NOT in this union: they are emitted automatically by `trackScreenViews` on
 * the client provider.
 */
export type AuditBlockReason =
  | "session_limit" | "domain_limit" | "daily_limit"
  | "invalid_url" | "private_url" | "bot_check"
  | "paused" | "origin_unreachable" | "origin_degraded";

export type AnalyticsEvent =
  // ── Audit funnel ─────────────────────────────
  | { name: "audit_form_engaged"; props?: undefined }
  | { name: "audit_submitted"; props: { host: string; force: boolean; source: "landing" | "cta" } }
  | { name: "audit_submit_failed"; props: { status: number; code?: string } }
  | { name: "audit_created"; props: { host: string; cached: boolean; authed: boolean } }
  | { name: "audit_blocked"; props: { reason: AuditBlockReason; status: number } }
  | { name: "audit_completed"; props: { host: string; score: number; pageCount: number; findingCount: number; durationMs: number; classification: string | null; truncated: boolean; authed: boolean } }
  | { name: "audit_failed"; props: { host: string; reason: string } }
  | { name: "report_viewed"; props: { slug: string; cached: boolean } }
  | { name: "report_exported"; props: { format: string } }
  // ── Accounts ─────────────────────────────────
  | { name: "signin_started"; props: { method: "magic_link" | "google" } }
  | { name: "signed_in"; props: { isNewUser: boolean } }
  // ── Monetization ─────────────────────────────
  | { name: "upgrade_clicked"; props: { source: "nav" | "pricing" | "limit_block" | "report" } }
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

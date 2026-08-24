/**
 * Structured, greppable audit logs.
 * One JSON line per event → ingestable by Vercel logs, Logtail, Axiom, etc.
 *
 * Convention: event names are `audit.<noun>.<verb>` or `monitor.<noun>.<verb>`.
 * Keep payload keys stable across events for easier querying.
 */

export type AuditLogEvent =
  | "audit.request.received"
  | "audit.request.rejected"
  | "audit.request.cooldown"
  | "audit.request.deduped"
  | "audit.request.rate_limited"
  | "audit.request.in_flight_limited"
  | "audit.request.preflight_blocked"
  | "audit.request.preflight_degraded"
  | "audit.enqueue.failed"
  | "audit.preflight.gentle_forced"
  | "audit.created"
  | "audit.dispatched"
  | "audit.started"
  | "audit.completed"
  | "audit.failed"
  | "audit.budget_hit"
  | "audit.claimed"
  | "audit.claim_failed"
  | "monitor.cron.start"
  | "monitor.domain.picked"
  | "monitor.domain.dispatch"
  | "monitor.domain.skipped"
  | "monitor.domain.quota_exhausted"
  | "monitor.domain.visibility"
  | "monitor.alert_gate.email_failed"
  | "monitor.alert_gate.slack_failed"
  | "monitor.auto_verify.success"
  | "monitor.verified.via_gsc"
  | "monitor.add.awaiting_verification"
  | "monitor.state.download_failed"
  | "monitor.state.upload_failed"
  | "settings.slack.updated"
  | "settings.slack.test_sent"
  | "settings.slack.test_failed"
  | "settings.indexnow.updated"
  | "settings.scan_options.updated"
  | "gsc.oauth.user_denied"
  | "gsc.oauth.state_invalid"
  | "gsc.oauth.state_mismatch"
  | "gsc.oauth.connected"
  | "gsc.oauth.exchange_failed"
  | "gsc.sync.start"
  | "gsc.sync.empty"
  | "gsc.sync.ok"
  | "gsc.sync.failed"
  | "growth.sync.skip"
  | "growth.sync.empty"
  | "growth.sync.ok"
  | "growth.sync.failed"
  | "gsc.oauth.disconnected"
  | "gsc.autobind"
  | "gsc.autobind.on_add"
  | "gsc.autobind.on_add.no_match"
  | "gsc.autobind.on_add.failed"
  | "gsc.rebind.bound"
  | "gsc.rebind.no_match"
  | "gsc.rebind.no_grant"
  | "gsc.rebind.failed"
  | "orchestrator.started"
  | "orchestrator.completed"
  | "orchestrator.failed"
  | "watched_page.added"
  | "watched_page.removed"
  | "watched_page.cap_reached"
  | "settings.domain.updated"
  | "audit.gentle_mode_applied"
  | "audit.degraded.retrying"
  | "audit.degraded.retry_succeeded"
  /** v0.5.10: per-template-degraded alert gate event. Firing logic ships in v0.5.11+. */
  | "template_degraded"
  | "seed.stats.recomputed";

type Payload = Record<string, unknown>;

export function auditLog(evt: AuditLogEvent, data: Payload = {}): void {
  const line = { ts: new Date().toISOString(), evt, ...data };
  // Single JSON line = easiest for log processors and also fine for local tailing.
  try {
    console.log(JSON.stringify(line));
  } catch {
    // Ignore if payload contains unserializable values; we don't want logging to crash a request.
  }
}

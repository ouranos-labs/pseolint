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
  | "monitor.alert_gate.email_failed"
  | "monitor.alert_gate.slack_failed"
  | "monitor.auto_verify.success"
  | "settings.slack.updated"
  | "settings.slack.test_sent"
  | "settings.slack.test_failed"
  | "gsc.oauth.user_denied"
  | "gsc.oauth.state_invalid"
  | "gsc.oauth.state_mismatch"
  | "gsc.oauth.connected"
  | "gsc.oauth.exchange_failed"
  | "gsc.sync.start"
  | "gsc.sync.empty"
  | "gsc.sync.ok"
  | "gsc.sync.failed"
  | "gsc.oauth.disconnected"
  | "gsc.autobind";

type Payload = Record<string, unknown>;

export function auditLog(evt: AuditLogEvent, data: Payload = {}): void {
  const line = { ts: new Date().toISOString(), evt, ...data };
  // Single JSON line = easiest for log processors and also fine for local tailing.
  try {
    console.log(JSON.stringify(line));
  } catch {
    // Ignore if payload contains unserializable values — we don't want logging to crash a request.
  }
}

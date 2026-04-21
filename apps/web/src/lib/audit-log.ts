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
  | "audit.created"
  | "audit.dispatched"
  | "audit.started"
  | "audit.completed"
  | "audit.failed"
  | "audit.budget_hit"
  | "monitor.cron.start"
  | "monitor.domain.picked"
  | "monitor.domain.dispatch"
  | "monitor.domain.skipped"
  | "monitor.domain.quota_exhausted";

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

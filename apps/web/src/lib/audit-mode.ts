export type AuditMode = "normal" | "readonly" | "disabled";

/**
 * Three-state operational switch, controlled via AUDITS_MODE env var:
 *  - normal   (default): everything works
 *  - readonly: POST /api/audits rejected; scheduled monitoring skipped; reads still work
 *  - disabled: reads also rejected (incident response)
 *
 * Legacy: AUDITS_DISABLED=1 still works and maps to "disabled".
 */
export function auditMode(): AuditMode {
  const raw = (process.env.AUDITS_MODE ?? "").toLowerCase().trim();
  if (raw === "readonly") return "readonly";
  if (raw === "disabled" || process.env.AUDITS_DISABLED === "1") return "disabled";
  return "normal";
}

export function readOnlyMessage(): string {
  return "New audits are temporarily paused. Existing reports and dashboards remain available.";
}

export function disabledMessage(): string {
  return "pseolint is temporarily unavailable. Please check back shortly.";
}

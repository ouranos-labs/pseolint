import type { AuditSummary } from "../types.js";

export function formatJson(summary: AuditSummary): string {
  return JSON.stringify(summary, null, 2);
}

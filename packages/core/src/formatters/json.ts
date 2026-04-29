import type { AuditSummary } from "../types.js";

export interface JsonFormatOptions {
  /** No-op for JSON; accepted for parity with other formatters' option signatures. */
  verbose?: boolean;
  /** No-op for JSON; accepted for parity with other formatters' option signatures. */
  noColor?: boolean;
}

/**
 * Serialise the full v0.4 AuditSummary verbatim. The CLI / web layer must see
 * every field the engine produced — no field-stripping, no transformation.
 */
export function formatJson(summary: AuditSummary, _options?: JsonFormatOptions): string {
  return JSON.stringify(summary, null, 2);
}

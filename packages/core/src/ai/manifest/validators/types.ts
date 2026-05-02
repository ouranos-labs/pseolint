/**
 * Validator result. Patch validators return one of these for each proposed
 * change; the dispatcher aggregates per-manifest. `reason` is a one-line
 * human-readable explanation suitable for surfacing in the manifest UI
 * ("dropped: H1 too long (250 chars > 200)").
 */
export interface ValidationOk {
  valid: true;
}

export interface ValidationErr {
  valid: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationErr;

export const VALID: ValidationOk = { valid: true };

export function fail(reason: string): ValidationErr {
  return { valid: false, reason };
}

import { inferUrlTemplate } from "@pseolint/core";
import type { RuleResult } from "@pseolint/core";

/** Stable key for domain-scoped suppressions. */
export function templateSignatureFor(finding: RuleResult): string {
  if (!finding.pageUrl) return "__global__";
  try {
    return inferUrlTemplate(finding.pageUrl);
  } catch {
    return finding.pageUrl;
  }
}

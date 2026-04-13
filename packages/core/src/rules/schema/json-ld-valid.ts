import type { ParsedPage, RuleResult } from "../../types.js";

export function jsonLdValidRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    for (const entry of page.jsonLd) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "__parseError" in entry &&
        (entry as Record<string, unknown>).__parseError === true
      ) {
        findings.push({
          ruleId: "schema/json-ld-valid",
          severity: "error",
          message: `${page.url} contains malformed JSON-LD that could not be parsed.`,
          pageUrl: page.url
        });
        continue;
      }

      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const obj = entry as Record<string, unknown>;

      if (!obj["@context"]) {
        findings.push({
          ruleId: "schema/json-ld-valid",
          severity: "error",
          message: `${page.url} has a JSON-LD block missing the required @context property.`,
          pageUrl: page.url
        });
      }

      if (obj["@type"] !== undefined) {
        const typeValue = obj["@type"];
        if (typeof typeValue !== "string" || typeValue.trim() === "") {
          findings.push({
            ruleId: "schema/json-ld-valid",
            severity: "error",
            message: `${page.url} has a JSON-LD block with an invalid @type value.`,
            pageUrl: page.url
          });
        }
      }
    }
  }

  return findings;
}

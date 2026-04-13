import type { ParsedPage, RuleResult } from "../../types.js";

const REQUIRED_FIELDS: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  Product: ["name"],
  FAQPage: ["mainEntity"]
};

function hasPrice(obj: Record<string, unknown>): boolean {
  if (obj.price !== undefined && obj.price !== null && obj.price !== "") {
    return true;
  }
  if (typeof obj.offers === "object" && obj.offers !== null) {
    const offers = obj.offers as Record<string, unknown>;
    if (offers.price !== undefined && offers.price !== null && offers.price !== "") {
      return true;
    }
  }
  return false;
}

export function requiredFieldsRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    for (const entry of page.jsonLd) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const obj = entry as Record<string, unknown>;

      if (
        "__parseError" in obj &&
        (obj as Record<string, unknown>).__parseError === true
      ) {
        continue;
      }

      const schemaType = typeof obj["@type"] === "string" ? obj["@type"] : null;
      if (!schemaType) {
        continue;
      }

      const required = REQUIRED_FIELDS[schemaType];
      if (!required) {
        continue;
      }

      const missing: string[] = [];
      for (const field of required) {
        if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
          missing.push(field);
        }
      }

      if (schemaType === "Product" && !hasPrice(obj)) {
        missing.push("price");
      }

      if (missing.length > 0) {
        findings.push({
          ruleId: "schema/required-fields",
          severity: "warning",
          message: `${page.url} has a ${schemaType} schema missing required fields: ${missing.join(", ")}.`,
          pageUrl: page.url,
          fix: `Add the missing fields to your ${schemaType} schema: ${missing.join(", ")}.`
        });
      }
    }
  }

  return findings;
}

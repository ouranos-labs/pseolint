import type { ParsedPage, RuleResult } from "../../types.js";

const REQUIRED_FIELDS: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  Product: ["name"],
  FAQPage: ["mainEntity"]
};

/**
 * Returns true when a field value should be treated as "missing" (junk/empty).
 * Accepts non-empty strings, non-empty arrays, and non-empty objects as present.
 */
function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  // booleans (false/true) and numbers other than checked above
  if (typeof value === "boolean" || typeof value === "number") return false;
  return true;
}

/**
 * Article `author` is valid when it is:
 *   - a non-empty string, OR
 *   - an object with a non-empty `name` property (Person/Organization), OR
 *   - a non-empty array of the above (co-authored articles: Schema.org allows
 *     `author` to be a list). Present if at least one element is a valid author.
 * Returns true when the author value is missing/junk.
 */
function isAuthorMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isAuthorMissing(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return typeof obj.name !== "string" || obj.name.trim() === "";
  }
  // booleans, numbers: not a valid author shape
  return true;
}

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
        if (field === "author" && schemaType === "Article") {
          if (isAuthorMissing(obj[field])) {
            missing.push(field);
          }
        } else if (isMissing(obj[field])) {
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

import type { ParsedPage, RuleResult, PageDataRecord } from "../../types.js";
import { matchPageToData } from "../../data-source-loader.js";

export function dataBindingRule(
  pages: ParsedPage[],
  records: PageDataRecord[]
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const record = matchPageToData(page.url, records);
    if (!record) continue;

    const missingFields: string[] = [];

    for (const [key, value] of Object.entries(record.data)) {
      if (value === null || value === undefined) continue;

      if (typeof value === "string") {
        // Check if the string value appears in page content (case-insensitive)
        if (value.length > 3 && !page.contentText.toLowerCase().includes(value.toLowerCase())) {
          // Also check HTML (value might be in meta tags, alt text, etc.)
          if (!page.html.toLowerCase().includes(value.toLowerCase())) {
            missingFields.push(key);
          }
        }
      } else if (Array.isArray(value)) {
        // For arrays (e.g., faqs, regulations), check if at least some items appear
        const items = value.filter((item): item is Record<string, unknown> =>
          item !== null && typeof item === "object"
        );
        if (items.length === 0) continue;

        // Extract text values from array items
        const textValues = items.flatMap((item) =>
          Object.values(item).filter((v): v is string => typeof v === "string" && v.length > 10)
        );

        const found = textValues.filter((v) =>
          page.contentText.toLowerCase().includes(v.toLowerCase()) ||
          page.html.toLowerCase().includes(v.toLowerCase())
        );

        if (textValues.length > 0 && found.length === 0) {
          missingFields.push(key);
        } else if (textValues.length > 2 && found.length < textValues.length * 0.3) {
          // Less than 30% of array items found — partial binding
          missingFields.push(`${key} (${found.length}/${textValues.length} items rendered)`);
        }
      }
      // Skip non-string non-array values (numbers, booleans) — too generic to match
    }

    if (missingFields.length > 0) {
      findings.push({
        ruleId: "data/missing-binding",
        severity: missingFields.length > 3 ? "error" : "warning",
        message: `${page.url} is missing ${missingFields.length} data field${missingFields.length !== 1 ? "s" : ""}: ${missingFields.join(", ")}.`,
        pageUrl: page.url,
        fix: `Verify these data fields are rendered on the page: ${missingFields.join(", ")}. Check for broken template bindings or conditional rendering that hides content.`,
      });
    }
  }

  // Also check: pages in data source that have no matching audited page
  const matchedUrls = new Set<string>();
  for (const page of pages) {
    const record = matchPageToData(page.url, records);
    if (record) matchedUrls.add(record.url);
  }
  const unmatchedRecords = records.filter((r) => !matchedUrls.has(r.url));
  if (unmatchedRecords.length > 0) {
    findings.push({
      ruleId: "data/missing-binding",
      severity: "warning",
      message: `${unmatchedRecords.length} data source record${unmatchedRecords.length !== 1 ? "s have" : " has"} no matching page. These pages may not be published.`,
      fix: `Check that these URLs exist: ${unmatchedRecords.slice(0, 5).map((r) => r.url).join(", ")}${unmatchedRecords.length > 5 ? ` and ${unmatchedRecords.length - 5} more` : ""}.`,
    });
  }

  return findings;
}

export function dataIdenticalRule(
  pages: ParsedPage[],
  records: PageDataRecord[]
): RuleResult[] {
  const findings: RuleResult[] = [];

  // Collect field values across all matched pages
  const fieldValues = new Map<string, Map<string, string[]>>(); // field -> value -> urls[]

  for (const page of pages) {
    const record = matchPageToData(page.url, records);
    if (!record) continue;

    for (const [key, value] of Object.entries(record.data)) {
      if (typeof value !== "string" || value.length < 10) continue;

      if (!fieldValues.has(key)) fieldValues.set(key, new Map());
      const valMap = fieldValues.get(key)!;
      if (!valMap.has(value)) valMap.set(value, []);
      valMap.get(value)!.push(page.url);
    }
  }

  // Find fields where the same value appears on many pages
  for (const [field, valMap] of fieldValues) {
    for (const [value, urls] of valMap) {
      if (urls.length > 3) {
        // Skip common fields that are expected to be identical (e.g., site name)
        // Only flag if it looks like page-specific content
        const truncated = value.length > 60 ? value.slice(0, 60) + "..." : value;
        findings.push({
          ruleId: "data/identical-across-pages",
          severity: "warning",
          message: `Data field "${field}" has identical value across ${urls.length} pages: "${truncated}".`,
          pageUrl: urls[0],
          relatedUrls: urls.slice(1),
          fix: `The "${field}" field should vary per page. If this is intentional (site-wide content), ignore this. Otherwise, check your data generation for missing per-page differentiation.`,
        });
      }
    }
  }

  return findings;
}

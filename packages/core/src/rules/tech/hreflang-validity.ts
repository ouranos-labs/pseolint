import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/hreflang-validity validates hreflang CODE VALUES. Google: an hreflang
 * annotation with an invalid language or region code is simply IGNORED
 * (https://developers.google.com/search/docs/specialty/international/localized-versions),
 * so `en_US`, `jp`, or `en-UK` silently disables the alternate it was meant to
 * declare: no error anywhere, the targeting just doesn't work.
 *
 * Scope: code values only. Reciprocity, duplicates, and malformed hrefs are
 * tech/hreflang-consistency's job, never duplicated here.
 *
 * Validation uses Intl.DisplayNames (CLDR ships with Node) instead of bundled
 * ISO tables: an unknown language/region subtag resolves to undefined.
 * Regions are checked uppercase (Intl is case-sensitive there); UN M.49
 * numeric regions (es-419) are accepted; 4-letter script subtags are passed
 * through unvalidated (rare enough that a bundled Intl check isn't worth it).
 */

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** lang-region grammar per BCP-47's common subset used by hreflang. */
const HREFLANG_GRAMMAR = /^[a-zA-Z]{2,3}(-[a-zA-Z]{4})?(-([a-zA-Z]{2}|\d{3}))?$/;

/** Frequent country-code-as-language mistakes, with the intended fix. */
const LANGUAGE_TYPOS: Record<string, string> = {
  jp: "ja",
  cn: "zh",
};

function isKnownLanguage(subtag: string): boolean {
  try {
    return LANGUAGE_NAMES.of(subtag.toLowerCase()) !== undefined;
  } catch {
    return false;
  }
}

function isKnownRegion(subtag: string): boolean {
  try {
    return REGION_NAMES.of(subtag.toUpperCase()) !== undefined;
  } catch {
    return false;
  }
}

export function hreflangValidityRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const seen = new Set<string>();
    for (const entry of page.hreflangs) {
      const raw = entry.lang;
      if (!raw || raw.toLowerCase() === "x-default") continue;
      if (seen.has(raw)) continue;
      seen.add(raw);

      const push = (problem: string, fix: string) => {
        findings.push({
          ruleId: "tech/hreflang-validity",
          severity: "warning",
          confidence: "high",
          message: `${page.url} has hreflang="${raw}": ${problem} Google ignores invalid hreflang annotations, so this alternate is silently dropped.`,
          pageUrl: page.url,
          fix,
        });
      };

      if (raw.includes("_")) {
        push(
          "underscores are not valid separators.",
          `Use a hyphen: hreflang="${raw.replace(/_/g, "-")}".`
        );
        continue;
      }

      if (!HREFLANG_GRAMMAR.test(raw)) {
        push(
          "the value is not a valid language[-script][-region] code.",
          `Use an ISO 639-1 language code, optionally followed by an ISO 3166-1 Alpha-2 region (e.g. "en", "en-GB", "pt-BR").`
        );
        continue;
      }

      // Grammar guarantees: [lang], [lang, script|region], or [lang, script, region]
      // where script is exactly 4 letters.
      const parts = raw.split("-");
      const language = parts[0];
      let region: string | undefined;
      if (parts.length === 2 && parts[1].length !== 4) region = parts[1];
      else if (parts.length === 3) region = parts[2];

      if (language.length === 2 && !isKnownLanguage(language)) {
        const suggestion = LANGUAGE_TYPOS[language.toLowerCase()];
        push(
          `"${language}" is not an ISO 639 language code.`,
          suggestion
            ? `Did you mean "${suggestion}"${parts.length > 1 ? ` (as in "${[suggestion, ...parts.slice(1)].join("-")}")` : ""}? ("${language}" is a country code, not a language.)`
            : `Replace "${language}" with a valid ISO 639-1 language code.`
        );
        continue;
      }

      if (region && /^[a-zA-Z]{2}$/.test(region)) {
        if (region.toUpperCase() === "UK") {
          push(
            `"UK" is not an ISO 3166-1 Alpha-2 region; the United Kingdom's code is "GB".`,
            `Use hreflang="${[...parts.slice(0, -1), "GB"].join("-")}".`
          );
        } else if (!isKnownRegion(region)) {
          push(
            `"${region}" is not an ISO 3166-1 Alpha-2 region code.`,
            `Replace "${region}" with a valid region code, or drop the region to target the language globally.`
          );
        }
      }
    }
  }

  return findings;
}

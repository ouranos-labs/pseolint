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
 * What "valid" means here is exactly what that doc says, verbatim: "Only
 * language codes listed in ISO 639-1 and region codes listed in ISO 3166-1
 * Alpha 2 are supported; other codes that aren't listed in those standards,
 * such as es-419, aren't supported." So:
 *
 *   - The language subtag must be a TWO-LETTER ISO 639-1 code. A three-letter
 *     ISO 639-2/3 code (`eng`, `deu`, `fra`) is well-formed BCP-47 and resolves
 *     fine through CLDR, but it is not ISO 639-1 and Google does not support it.
 *     DELIBERATE CARVE-OUT: a 3-letter code is only flagged when an ISO 639-1
 *     equivalent actually exists to recommend. Languages that were never given
 *     a two-letter code (`fil` Filipino, `haw` Hawaiian, `ceb` Cebuano) have no
 *     correct alternative, so flagging them would be advice the operator cannot
 *     act on. `eng-US` is a mistake with an obvious fix; `fil` is not a mistake.
 *   - The region subtag must be a TWO-LETTER ISO 3166-1 Alpha-2 code. UN M.49
 *     numeric regions are NOT supported, and `es-419` is the example Google
 *     names by name.
 *
 * Validation uses Intl (CLDR ships with Node) rather than bundled ISO tables,
 * but CLDR is DELIBERATELY more permissive than ISO, and the previous claim
 * here that "an unknown subtag resolves to undefined" was simply not how CLDR
 * behaves. Intl.DisplayNames happily resolves withdrawn codes through its alias
 * table (`SU`→Russia, `CS`/`YU`→Serbia, `AN`→Curaçao, `UK`→United Kingdom) and
 * resolves reserved non-country codes (`ZZ`, `EU`) too, so every one of those
 * passed silently. Three checks are therefore stacked:
 *
 *   1. Intl.DisplayNames must know the subtag at all.
 *   2. Intl.getCanonicalLocales must leave it alone. Canonicalization rewrites
 *      every deprecated alias to its modern code (`und-SU` → `und-RU`), so a
 *      changed value IS the withdrawal signal, for the whole alias table rather
 *      than a hand-maintained excerpt of it.
 *   3. It must not be one of the codes CLDR knows that ISO 3166-1 does not
 *      assign to a country (see NON_ISO_3166_1_REGIONS).
 *
 * 4-letter script subtags are passed through unvalidated (rare enough that a
 * bundled Intl check isn't worth it).
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

/**
 * Two-letter regions CLDR resolves that ISO 3166-1 does not assign to a
 * country: exceptionally reserved codes (AC Ascension, CP Clipperton, CQ Sark,
 * DG Diego Garcia, EA Ceuta & Melilla, EU European Union, EZ Eurozone,
 * IC Canary Islands, TA Tristan da Cunha, UN United Nations), user-assigned
 * codes (XA, XB, XK Kosovo) and CLDR's own specials (QO Outlying Oceania,
 * ZZ Unknown Region).
 *
 * Derived, not guessed: of the 280 two-letter regions this Node's CLDR
 * resolves, 16 are deprecated aliases (caught by canonicalization) and
 * removing these 15 leaves exactly the 249 codes ISO 3166-1 assigns.
 */
const NON_ISO_3166_1_REGIONS = new Set([
  "AC", "CP", "CQ", "DG", "EA", "EU", "EZ", "IC", "QO", "TA", "UN", "XA", "XB", "XK", "ZZ",
]);

/** True when canonicalization rewrites the subtag, i.e. it is a withdrawn alias. */
function isDeprecatedRegion(subtag: string): boolean {
  const tag = `und-${subtag.toUpperCase()}`;
  try {
    return Intl.getCanonicalLocales(tag)[0] !== tag;
  } catch {
    return false;
  }
}

/** The modern replacement for a withdrawn region code, or undefined. */
function canonicalRegion(subtag: string): string | undefined {
  try {
    const canonical = Intl.getCanonicalLocales(`und-${subtag.toUpperCase()}`)[0];
    const replacement = canonical.split("-")[1];
    return replacement && replacement.toUpperCase() !== subtag.toUpperCase()
      ? replacement.toUpperCase()
      : undefined;
  } catch {
    return undefined;
  }
}

function isKnownLanguage(subtag: string): boolean {
  try {
    return LANGUAGE_NAMES.of(subtag.toLowerCase()) !== undefined;
  } catch {
    return false;
  }
}

/** ISO 639-1 equivalent of a 3-letter ISO 639-2/3 code, if one exists. */
function iso639_1For(subtag: string): string | undefined {
  try {
    const canonical = Intl.getCanonicalLocales(subtag.toLowerCase())[0];
    return canonical.length === 2 ? canonical : undefined;
  } catch {
    return undefined;
  }
}

/** Currently-assigned ISO 3166-1 Alpha-2, per the three stacked checks above. */
function isAssignedRegion(subtag: string): boolean {
  const upper = subtag.toUpperCase();
  if (NON_ISO_3166_1_REGIONS.has(upper)) return false;
  if (isDeprecatedRegion(upper)) return false;
  try {
    return REGION_NAMES.of(upper) !== undefined;
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

      if (language.length !== 2) {
        // Well-formed BCP-47, but Google supports ISO 639-1 (two letters) only.
        // Only actionable when a two-letter equivalent exists: see the carve-out
        // in the docstring.
        const iso1 = iso639_1For(language);
        if (iso1) {
          push(
            `"${language}" is a three-letter code; Google supports ISO 639-1 (two-letter) language codes only.`,
            `Use the ISO 639-1 code "${iso1}": hreflang="${[iso1, ...parts.slice(1)].join("-")}".`
          );
          continue;
        }
      } else if (!isKnownLanguage(language)) {
        const suggestion = LANGUAGE_TYPOS[language.toLowerCase()];
        push(
          `"${language}" is not an ISO 639 language code.`,
          suggestion
            ? `Did you mean "${suggestion}"${parts.length > 1 ? ` (as in "${[suggestion, ...parts.slice(1)].join("-")}")` : ""}? ("${language}" is a country code, not a language.)`
            : `Replace "${language}" with a valid ISO 639-1 language code.`
        );
        continue;
      }

      if (region === undefined) continue;

      if (/^\d{3}$/.test(region)) {
        // UN M.49 numeric region. Google names this case verbatim.
        push(
          `"${region}" is a UN M.49 numeric region, not an ISO 3166-1 Alpha-2 code. Google: "Only language codes listed in ISO 639-1 and region codes listed in ISO 3166-1 Alpha 2 are supported; other codes that aren't listed in those standards, such as es-419, aren't supported."`,
          `Drop the region to target the language globally (hreflang="${language}"), or name the individual countries with ISO 3166-1 Alpha-2 codes (e.g. "${language}-MX", "${language}-AR", "${language}-CO").`
        );
        continue;
      }

      if (region.toUpperCase() === "UK") {
        push(
          `"UK" is not an ISO 3166-1 Alpha-2 region; the United Kingdom's code is "GB".`,
          `Use hreflang="${[...parts.slice(0, -1), "GB"].join("-")}".`
        );
      } else if (!isAssignedRegion(region)) {
        const replacement = canonicalRegion(region);
        push(
          replacement
            ? `"${region}" is a withdrawn ISO 3166-1 code (now "${replacement}").`
            : `"${region}" is not an ISO 3166-1 Alpha-2 region code.`,
          replacement
            ? `Use hreflang="${[...parts.slice(0, -1), replacement].join("-")}".`
            : `Replace "${region}" with a valid region code, or drop the region to target the language globally.`
        );
      }
    }
  }

  return findings;
}

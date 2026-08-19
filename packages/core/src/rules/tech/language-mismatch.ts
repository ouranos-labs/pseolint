import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/language-mismatch — compares the page's DECLARED language (html lang
 * attribute + the self-referencing hreflang) against the language actually
 * DETECTED from the visible text's Unicode script.
 *
 * Why it matters: Google determines a page's language from its visible
 * content only — "We don't use any code-level language information such as
 * `lang` attributes, or the URL"
 * (https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).
 * So a page declared `ja` but written in Russian Cyrillic is indexed as
 * Russian, and every piece of declared-language targeting (hreflang sets,
 * localized sitemaps) silently fails.
 *
 * Findings:
 *   - error   (high):   ≥70% of the body's script-classified letters belong to
 *                       scripts incompatible with EVERY declared language
 *                       (e.g. Cyrillic body under lang="ja").
 *   - warning (medium): dominant script matches, but a second incompatible
 *                       non-Latin script covers ≥30% of letters (side-by-side
 *                       translations — Google recommends one language per page).
 *   - info    (high):   html lang missing while the page has hreflang
 *                       annotations or a non-Latin body. Deliberately info:
 *                       Google IGNORES the lang attribute for ranking — it's an
 *                       accessibility signal and the prerequisite for this
 *                       rule's mismatch detection, nothing more. Never present
 *                       it as a ranking factor (see docs/folklore.md #7).
 *
 * Latin is tolerated as a minority script for every language (brand names,
 * inline code, URLs), so Latin-heavy chrome never trips the thresholds.
 */

const SCRIPT_MATCHERS: ReadonlyArray<[script: string, re: RegExp]> = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
];

/** ISO 639-1 language → scripts its text is normally written in. Languages
 * absent from this map are never judged (no false positives on languages we
 * don't understand). */
const LANG_SCRIPTS: Record<string, readonly string[]> = {
  en: ["Latin"], fr: ["Latin"], de: ["Latin"], es: ["Latin"], it: ["Latin"],
  pt: ["Latin"], nl: ["Latin"], sv: ["Latin"], da: ["Latin"], no: ["Latin"],
  fi: ["Latin"], pl: ["Latin"], cs: ["Latin"], tr: ["Latin"], vi: ["Latin"],
  id: ["Latin"], ms: ["Latin"], ro: ["Latin"], hu: ["Latin"],
  ru: ["Cyrillic"], uk: ["Cyrillic"], bg: ["Cyrillic"], mk: ["Cyrillic"],
  be: ["Cyrillic"], kk: ["Cyrillic"],
  sr: ["Cyrillic", "Latin"],
  ja: ["Han", "Hiragana", "Katakana"],
  zh: ["Han"],
  ko: ["Hangul", "Han"],
  ar: ["Arabic"], fa: ["Arabic"], ur: ["Arabic"],
  he: ["Hebrew"],
  th: ["Thai"],
  hi: ["Devanagari"], mr: ["Devanagari"], ne: ["Devanagari"],
  el: ["Greek"],
};

const MIN_CLASSIFIED_LETTERS = 200;
const MISMATCH_SHARE = 0.7;
const SECONDARY_SHARE = 0.3;

function countScripts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ch of text) {
    for (const [script, re] of SCRIPT_MATCHERS) {
      if (re.test(ch)) {
        counts.set(script, (counts.get(script) ?? 0) + 1);
        break;
      }
    }
  }
  return counts;
}

function extractHtmlLang(html: string): string | undefined {
  const m = html.match(/<html[^>]*\slang=["']?([a-zA-Z-]+)/i);
  return m ? m[1] : undefined;
}

function stripForCompare(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

/** Only the SELF-referencing hreflang declares THIS page's language — the
 * other entries declare the alternates' languages by design. */
function selfHreflang(page: ParsedPage): string | undefined {
  const self = stripForCompare(page.url);
  for (const entry of page.hreflangs) {
    if (entry.href && stripForCompare(entry.href) === self && entry.lang.toLowerCase() !== "x-default") {
      return entry.lang;
    }
  }
  return undefined;
}

function primarySubtag(lang: string): string {
  return lang.split(/[-_]/)[0].toLowerCase();
}

export function languageMismatchRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.html) continue;

    const htmlLang = extractHtmlLang(page.html);
    const declared = new Set<string>();
    if (htmlLang) declared.add(primarySubtag(htmlLang));
    const self = selfHreflang(page);
    if (self) declared.add(primarySubtag(self));

    const counts = countScripts(page.contentText);
    let total = 0;
    for (const n of counts.values()) total += n;

    const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

    if (!htmlLang && (page.hreflangs.length > 0 || (dominant && dominant[0] !== "Latin"))) {
      findings.push({
        ruleId: "tech/language-mismatch",
        severity: "info",
        confidence: "high",
        message: `${page.url} has no lang attribute on <html>. Google does not use the lang attribute for ranking (it detects language from visible content), but it matters for accessibility and lets tools verify your hreflang targeting.`,
        pageUrl: page.url,
        fix: `Add <html lang="…"> matching the page's actual content language.`,
      });
    }

    if (total < MIN_CLASSIFIED_LETTERS) continue;

    // Union of scripts allowed by every declared+known language, Latin always
    // tolerated as a minority script.
    const knownDeclared = Array.from(declared).filter((l) => LANG_SCRIPTS[l]);
    if (knownDeclared.length === 0) continue;

    const allowed = new Set<string>(["Latin"]);
    for (const lang of knownDeclared) {
      for (const s of LANG_SCRIPTS[lang]) allowed.add(s);
    }

    let incompatible = 0;
    let worstDisallowed: { script: string; count: number } | undefined;
    for (const [script, count] of counts) {
      if (allowed.has(script)) continue;
      incompatible += count;
      if (!worstDisallowed || count > worstDisallowed.count) {
        worstDisallowed = { script, count };
      }
    }

    const declaredLabel = knownDeclared.join(", ");
    if (incompatible / total >= MISMATCH_SHARE && worstDisallowed) {
      const pct = Math.round((incompatible / total) * 100);
      findings.push({
        ruleId: "tech/language-mismatch",
        severity: "error",
        confidence: "high",
        message: `${page.url} declares language "${declaredLabel}" but ${pct}% of its text is in the ${worstDisallowed.script} script — Google indexes by the DETECTED language, so the declared targeting (hreflang, localized sitemaps) silently fails.`,
        pageUrl: page.url,
        fix: `Either fix the declaration (html lang / self-referencing hreflang) to match the actual content language, or replace the content with text in "${declaredLabel}".`,
      });
    } else if (worstDisallowed && worstDisallowed.count / total >= SECONDARY_SHARE) {
      const pct = Math.round((worstDisallowed.count / total) * 100);
      findings.push({
        ruleId: "tech/language-mismatch",
        severity: "warning",
        confidence: "medium",
        message: `${page.url} declares language "${declaredLabel}" but ${pct}% of its text is in the ${worstDisallowed.script} script — mixed-language pages dilute language detection; Google recommends a single language for content and navigation on each page.`,
        pageUrl: page.url,
        fix: `Split the ${worstDisallowed.script}-script content onto its own URL with its own language declaration, and connect the two with hreflang.`,
      });
    }
  }

  return findings;
}

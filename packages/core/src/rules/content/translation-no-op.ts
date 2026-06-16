import { hammingDistance, simHashFromText, similarityFromDistance } from "../../algorithms/simhash.js";
import type { ParsedPage, RuleResult } from "../../types.js";

const LOCALE_PREFIX_RE = /^\/([a-z]{2}(-[a-z]{2})?)(\/|$)/i;
const SIMILARITY_THRESHOLD = 0.95;
/**
 * Minimum body word count before translation-no-op evaluates a page. Below
 * this floor the issue is "no content at all" — better surfaced by
 * `spam/thin-content` — and pairwise simhash similarity collapses to ~1.0
 * for any two empty/near-empty pages, producing a confusingly-redundant
 * "you didn't translate" finding when really there's nothing to translate.
 * v0.5.6 refinement.
 */
const MIN_WORDS_FOR_TRANSLATION_CHECK = 30;

/**
 * Strips a leading locale segment from a URL path.
 * `/en/about` -> `/about`, `/fr-CA/about` -> `/about`, `/about` -> `/about`
 */
function stripLocalePrefix(pathname: string): string {
  const m = LOCALE_PREFIX_RE.exec(pathname);
  if (!m) return pathname;
  // m[3] is "/" or "" (end-of-string)
  return m[3] === "/" ? pathname.slice(m[0].length - 1) : "/";
}

/**
 * Returns the path component of a URL, or "/" on parse failure.
 */
function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

/**
 * content/translation-no-op -- detects locale variants of the same template
 * that were never actually translated (similarity >= 0.95).
 *
 * Groups pages whose URL paths differ only by a leading locale segment
 * (e.g. `/en/`, `/fr/`, `/it/`). Within each group, fires one error per
 * cluster of identical/near-identical variants.
 */
export function translationNoOpRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  // Build map: basePath -> [{ page, locale }]
  const groups = new Map<string, Array<{ page: ParsedPage; locale: string }>>();

  for (const page of pages) {
    const pathname = getPathname(page.url);
    const m = LOCALE_PREFIX_RE.exec(pathname);
    if (!m) continue; // no locale prefix -- skip
    const locale = m[1].toLowerCase();
    const basePath = stripLocalePrefix(pathname);
    const bucket = groups.get(basePath) ?? [];
    bucket.push({ page, locale });
    groups.set(basePath, bucket);
  }

  for (const [basePath, members] of groups) {
    if (members.length < 2) continue;

    // Skip the cluster when every variant is below the min-content floor —
    // the real issue is thin-content, not a translation no-op. (Mixed-case
    // clusters where some variants are full-content still evaluate, since a
    // single thin variant against a full one IS a translation issue.)
    const allBelowMin = members.every(
      (m) => m.page.contentText.split(/\s+/).filter(Boolean).length < MIN_WORDS_FOR_TRANSLATION_CHECK,
    );
    if (allBelowMin) continue;

    const hashes = members.map((m) => simHashFromText(m.page.contentText));
    let minSim = 1;
    let maxSim = 0;
    let anyAbove = false;

    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const sim = similarityFromDistance(hammingDistance(hashes[i], hashes[j]));
        if (sim < minSim) minSim = sim;
        if (sim > maxSim) maxSim = sim;
        if (sim >= SIMILARITY_THRESHOLD) anyAbove = true;
      }
    }

    if (!anyAbove) continue;

    const urls = members.map((m) => m.page.url);
    const simLabel =
      minSim === maxSim
        ? `${(minSim * 100).toFixed(0)}%`
        : `${(minSim * 100).toFixed(0)}%--${(maxSim * 100).toFixed(0)}%`;

    findings.push({
      ruleId: "content/translation-no-op",
      // Warning, not error: an untranslated locale variant is a real duplicate-
      // content gap but a should-fix, not a ship-blocker — and multilingual sites
      // can legitimately share some body text (disclaimers, spec tables).
      severity: "warning",
      confidence: "medium",
      message:
        `${members.length} locale variants of "${basePath}" share identical content ` +
        `(similarity ${simLabel}). Translate the body or consolidate to the canonical version.`,
      pageUrl: urls[0],
      relatedUrls: urls.slice(1, 6),
      fix: "Either provide unique translated body content for each locale variant, or redirect all locale variants to the canonical URL and use hreflang only on the canonical.",
    });
  }

  return findings;
}

import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

export interface FreshnessOptions {
  /** Flag pages with dateModified older than this many days. Default: 180. */
  maxStaleDays?: number;
  /** Clock override for deterministic testing. Default: Date.now(). */
  now?: () => number;
}

const DAY_MS = 86_400_000;

interface DateCandidates {
  modified: string | null;
  published: string | null;
}

/**
 * Find dateModified-specific signals in JSON-LD (recursive). Keeps `dateModified` and
 * `datePublished` separate so callers can require a true modification signal rather than
 * accept "published once in 2020" as evidence of freshness.
 */
function findDatesInJsonLd(entries: unknown[]): DateCandidates {
  let modified: string | null = null;
  let published: string | null = null;
  const stack: unknown[] = [...entries];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const m = obj["dateModified"];
    if (!modified && typeof m === "string" && m.length > 0) modified = m;
    const p = obj["datePublished"] ?? obj["dateCreated"];
    if (!published && typeof p === "string" && p.length > 0) published = p;
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) stack.push(item);
      } else if (value !== null && typeof value === "object") {
        stack.push(value);
      }
    }
  }
  return { modified, published };
}

/**
 * Find modification-specific meta tags and <time> elements. Uses cheerio so attribute
 * order does not matter (<meta content="..." property="...">` and `<meta property="..."
 * content="...">` both work).
 */
function findDateModifiedInHtml(html: string): string | null {
  const $ = load(html);
  const candidates = [
    $('meta[property="article:modified_time"]').attr("content"),
    $('meta[name="last-modified"]').attr("content"),
    $('meta[name="dc.date.modified"]').attr("content"),
    $("time[datetime]").attr("datetime"),
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function hasVisibleUpdateSignal(contentText: string): boolean {
  return /\b(last\s+updated|updated\s+on|revised|last\s+modified)\b/i.test(contentText);
}

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function freshnessSignalsRule(
  pages: ParsedPage[],
  options?: FreshnessOptions,
): RuleResult[] {
  const maxStaleDays = options?.maxStaleDays ?? 180;
  const now = options?.now ? options.now() : Date.now();
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const { modified: jsonLdModified, published: jsonLdPublished } = findDatesInJsonLd(page.jsonLd);
    const htmlModified = findDateModifiedInHtml(page.html);
    const visibleSignal = hasVisibleUpdateSignal(page.contentText);

    // A true modification signal is `dateModified`, a modification meta tag, or visible
    // "Last updated" text. `datePublished` alone (a page born in 2019 and never touched)
    // is NOT a modification signal — fall through to the no-signal warning.
    const hasModificationSignal = Boolean(jsonLdModified || htmlModified || visibleSignal);

    if (!hasModificationSignal) {
      findings.push({
        ruleId: "aeo/freshness-signals",
        severity: "warning",
        // Medium: a missing dateModified is often deliberate on evergreen pages (about,
        // pricing, policy) where re-stamping would mislead readers.
        confidence: "medium",
        message:
          `${page.url} has no dateModified signal (no JSON-LD dateModified, no modification meta tag, no visible "Last updated"). ` +
          `Evergreen pages may legitimately omit this — verify whether freshness signals matter for this page type.`,
        pageUrl: page.url,
        fix:
          `Add a freshness signal so AI engines know the page is current. Three recommended places: ` +
          `(1) dateModified in your JSON-LD schema, ` +
          `(2) a visible "Last updated: YYYY-MM-DD" line in the page content, ` +
          `(3) accurate <lastmod> in your sitemap. ` +
          `For pSEO templates, automate dateModified to update when your underlying data source changes.`,
      });
      continue;
    }

    const best =
      parseDateSafe(jsonLdModified) ??
      parseDateSafe(htmlModified) ??
      parseDateSafe(jsonLdPublished) ??
      parseDateSafe(page.publishedDate);

    if (best) {
      const ageDays = Math.floor((now - best.getTime()) / DAY_MS);
      if (ageDays > maxStaleDays) {
        findings.push({
          ruleId: "aeo/freshness-signals",
          severity: "info",
          // Low: stale-by-clock isn't always stale-by-meaning. Some pages are evergreen by design.
          confidence: "low",
          message:
            `${page.url} was last updated ${ageDays} days ago (threshold: ${maxStaleDays}). ` +
            `Some pages are evergreen by design — only act if this page's information changes over time.`,
          pageUrl: page.url,
          fix:
            `AI engines prioritize fresh content for citation. If the page is still accurate, ` +
            `refresh the visible date and bump dateModified. If information has changed, update the body accordingly.`,
        });
      }
    }
  }

  return findings;
}

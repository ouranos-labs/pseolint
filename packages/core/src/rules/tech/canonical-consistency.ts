import { dirname, resolve } from "node:path";
import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";
import { normalizeAuditUrl } from "../../url-normalize.js";

export function resolveCanonicalUrl(
  canonical: string,
  pageUrl: string,
  normalizeOpts: NormalizeUrlOptions
): string | null {
  const raw = canonical.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return normalizeAuditUrl(raw, normalizeOpts);

  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      return normalizeAuditUrl(new URL(raw, pageUrl).href, normalizeOpts);
    } catch {
      return null;
    }
  }

  return normalizeAuditUrl(resolve(dirname(pageUrl), raw), normalizeOpts);
}

/** Extract the hostname from a URL string, or null if unparseable. */
function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function canonicalConsistencyRule(
  pages: ParsedPage[],
  knownUrls: Set<string>,
  normalizeOpts: NormalizeUrlOptions
): RuleResult[] {
  // ── Pass 1: collect out-of-scope findings per page ──────────────────────────
  // We separate "out-of-scope" (canonical host ≠ page host, and not in knownUrls)
  // from other findings so we can decide whether to collapse them.

  const findings: RuleResult[] = [];

  // Map from canonical-target-host → array of (pageUrl, canonicalUrl) that had that host
  const outOfScopeByTargetHost = new Map<string, Array<{ pageUrl: string; canonicalUrl: string }>>();

  for (const page of pages) {
    if (!page.canonical) {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "error",
        message: `${page.url} is missing a canonical URL.`,
        pageUrl: page.url,
        fix: `Add <link rel="canonical" href="${page.url}" /> to the <head>.`
      });
      continue;
    }

    const canonicalUrl = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
    if (!canonicalUrl) {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "error",
        message: `${page.url} has an invalid canonical URL: ${page.canonical}.`,
        pageUrl: page.url,
        fix: "Fix the canonical URL syntax."
      });
      continue;
    }

    if (canonicalUrl === page.url) {
      // Self-canonical: still check HTTP header conflict
      if (page.httpMeta?.linkHeader) {
        const linkCanonicalMatch = page.httpMeta.linkHeader.match(/<([^>]+)>;\s*rel="canonical"/i);
        if (linkCanonicalMatch) {
          const httpCanonical = normalizeAuditUrl(linkCanonicalMatch[1], normalizeOpts);
          const htmlCanonical = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
          if (httpCanonical && htmlCanonical && httpCanonical !== htmlCanonical) {
            findings.push({
              ruleId: "tech/canonical-consistency",
              severity: "error",
              message: `${page.url} has conflicting canonical URLs: HTML says ${htmlCanonical}, HTTP Link header says ${httpCanonical}.`,
              pageUrl: page.url,
              relatedUrls: [htmlCanonical, httpCanonical],
              fix: "Ensure the HTML <link rel='canonical'> and HTTP Link header agree on the canonical URL."
            });
          }
        }
      }
      continue;
    }

    // canonical differs from page.url
    const pageHost = extractHost(page.url);
    const canonicalHost = extractHost(canonicalUrl);
    const isOutOfScope = !knownUrls.has(canonicalUrl);
    const isCrossHost = pageHost !== null && canonicalHost !== null && canonicalHost !== pageHost;

    if (isOutOfScope && isCrossHost) {
      // Candidate for collapsing: defer into the bucket keyed by target host
      const bucket = outOfScopeByTargetHost.get(canonicalHost!) ?? [];
      bucket.push({ pageUrl: page.url, canonicalUrl });
      outOfScopeByTargetHost.set(canonicalHost!, bucket);
    } else {
      // Either within-scope (warning) or same-host out-of-scope: emit per-page
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: knownUrls.has(canonicalUrl) ? "warning" : "info",
        message: knownUrls.has(canonicalUrl)
          ? `${page.url} canonicalizes to another crawled page (${canonicalUrl}).`
          : `${page.url} canonicalizes outside the crawl scope (${canonicalUrl}).`,
        pageUrl: page.url,
        relatedUrls: [canonicalUrl],
        fix: "Verify this canonical target is intentional."
      });

      // HTTP header conflict check (only when we haven't already decided to collapse)
      if (page.httpMeta?.linkHeader) {
        const linkCanonicalMatch = page.httpMeta.linkHeader.match(/<([^>]+)>;\s*rel="canonical"/i);
        if (linkCanonicalMatch) {
          const httpCanonical = normalizeAuditUrl(linkCanonicalMatch[1], normalizeOpts);
          const htmlCanonical = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
          if (httpCanonical && htmlCanonical && httpCanonical !== htmlCanonical) {
            findings.push({
              ruleId: "tech/canonical-consistency",
              severity: "error",
              message: `${page.url} has conflicting canonical URLs: HTML says ${htmlCanonical}, HTTP Link header says ${httpCanonical}.`,
              pageUrl: page.url,
              relatedUrls: [htmlCanonical, httpCanonical],
              fix: "Ensure the HTML <link rel='canonical'> and HTTP Link header agree on the canonical URL."
            });
          }
        }
      }
    }
  }

  // ── Pass 2: collapse uniform out-of-scope buckets ───────────────────────────
  // Strategy: if ALL pages point to the SAME alternate host (one bucket with all
  // out-of-scope cross-host pages), emit ONE site-level info. If multiple target
  // hosts exist (inconsistent), keep per-page findings.

  const buckets = [...outOfScopeByTargetHost.entries()];

  if (buckets.length === 0) {
    // Nothing to collapse
  } else if (buckets.length === 1) {
    // Every cross-host out-of-scope canonical goes to the same alternate host → collapse
    const [targetHost, entries] = buckets[0];
    const count = entries.length;
    // Infer the crawled host from the first page in the bucket
    const crawledHost = extractHost(entries[0].pageUrl) ?? "the crawled host";

    // If there is only ONE page total pointing to the alternate host,
    // still emit a per-page finding (no "site-level" implication with a single page).
    if (count === 1) {
      const { pageUrl, canonicalUrl } = entries[0];
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "info",
        message: `${pageUrl} canonicalizes outside the crawl scope (${canonicalUrl}).`,
        pageUrl,
        relatedUrls: [canonicalUrl],
        fix: "Verify this canonical target is intentional."
      });
    } else {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "info",
        message: `${count} pages canonicalize to ${targetHost}, outside the crawled host ${crawledHost}, expected if you crawled a staging/preview origin.`,
        relatedUrls: entries.map((e) => e.canonicalUrl).slice(0, 10),
        fix: "If this site is live at the canonical host, the canonicals are correct. If not, verify the canonical URLs."
      });
    }
  } else {
    // Multiple target hosts: inconsistent cross-host canonicals → per-page findings
    for (const [, entries] of buckets) {
      for (const { pageUrl, canonicalUrl } of entries) {
        findings.push({
          ruleId: "tech/canonical-consistency",
          severity: "info",
          message: `${pageUrl} canonicalizes outside the crawl scope (${canonicalUrl}).`,
          pageUrl,
          relatedUrls: [canonicalUrl],
          fix: "Verify this canonical target is intentional."
        });

        // HTTP header conflict check for deferred pages
        const pageDef = pages.find((p) => p.url === pageUrl);
        if (pageDef?.httpMeta?.linkHeader) {
          const linkCanonicalMatch = pageDef.httpMeta.linkHeader.match(/<([^>]+)>;\s*rel="canonical"/i);
          if (linkCanonicalMatch) {
            const httpCanonical = normalizeAuditUrl(linkCanonicalMatch[1], normalizeOpts);
            const htmlCanonical = resolveCanonicalUrl(pageDef.canonical, pageDef.url, normalizeOpts);
            if (httpCanonical && htmlCanonical && httpCanonical !== htmlCanonical) {
              findings.push({
                ruleId: "tech/canonical-consistency",
                severity: "error",
                message: `${pageUrl} has conflicting canonical URLs: HTML says ${htmlCanonical}, HTTP Link header says ${httpCanonical}.`,
                pageUrl,
                relatedUrls: [htmlCanonical, httpCanonical],
                fix: "Ensure the HTML <link rel='canonical'> and HTTP Link header agree on the canonical URL."
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

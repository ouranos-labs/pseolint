/**
 * Curated library of authoritative sources for the marketing reference pages
 * (rules, symptoms, tools).
 *
 * Why a library instead of free-form URLs: every marketing page makes
 * quantified claims about Google's ranking and spam systems. pseolint's own
 * `content/citation-coverage` rule expects those claims to be grounded in
 * authoritative outbound citations (.gov/.edu/.int TLDs plus an allowlist that
 * now includes developers.google.com + web.dev). Defining the canonical URLs
 * ONCE here guarantees they are real and stable — page authors reference a
 * source by key and add a page-specific `note`, so no page can ship a
 * hallucinated or rotted link.
 *
 * Every URL below is an evergreen Google Search Central / web.dev / standards
 * page (or a DOI), all of which resolve as "authoritative" in the engine.
 */

export interface SourceEntry {
  /** Human-readable citation title rendered as the link text. */
  title: string;
  /** Canonical, authoritative URL. */
  url: string;
}

const SC = "https://developers.google.com/search/docs";

export const SOURCE_LIBRARY = {
  spamPolicies: {
    title: "Google Search Central — Spam policies for Google web search",
    url: `${SC}/essentials/spam-policies`,
  },
  scaledContent: {
    title: "Google Search Central — Spam policies: scaled content abuse",
    url: `${SC}/essentials/spam-policies`,
  },
  siteReputationAbuse: {
    title: "Google Search Central — Spam policies: site reputation abuse",
    url: `${SC}/essentials/spam-policies#site-reputation-abuse`,
  },
  doorways: {
    title: "Google Search Central — Spam policies: doorways",
    url: `${SC}/essentials/spam-policies#doorway-pages`,
  },
  helpfulContent: {
    title: "Google Search Central — Creating helpful, reliable, people-first content",
    url: `${SC}/fundamentals/creating-helpful-content`,
  },
  searchEssentials: {
    title: "Google Search Central — Search Essentials",
    url: `${SC}/essentials`,
  },
  canonicalization: {
    title: "Google Search Central — Consolidate duplicate URLs (canonicalization)",
    url: `${SC}/crawling-indexing/consolidate-duplicate-urls`,
  },
  blockIndexing: {
    title: "Google Search Central — Block search indexing with noindex",
    url: `${SC}/crawling-indexing/block-indexing`,
  },
  robotsIntro: {
    title: "Google Search Central — Introduction to robots.txt",
    url: `${SC}/crawling-indexing/robots/intro`,
  },
  sitemaps: {
    title: "Google Search Central — Build and submit a sitemap",
    url: `${SC}/crawling-indexing/sitemaps/overview`,
  },
  redirects: {
    title: "Google Search Central — Redirects and Google Search",
    url: `${SC}/crawling-indexing/301-redirects`,
  },
  hreflang: {
    title: "Google Search Central — Tell Google about localized versions (hreflang)",
    url: `${SC}/specialty/international/localized-versions`,
  },
  structuredData: {
    title: "Google Search Central — Introduction to structured data markup",
    url: `${SC}/appearance/structured-data/intro-structured-data`,
  },
  titleLinks: {
    title: "Google Search Central — Influencing your title links in search results",
    url: `${SC}/appearance/title-link`,
  },
  aiFeatures: {
    title: "Google Search Central — AI features and your website",
    url: `${SC}/appearance/ai-features`,
  },
  httpErrors: {
    title: "Google Search Central — HTTP status codes, network and DNS errors (soft 404s)",
    url: `${SC}/crawling-indexing/http-network-errors`,
  },
  crawlBudget: {
    title: "Google Search Central — Large site owner's guide to managing crawl budget",
    url: `${SC}/crawling-indexing/large-site-managing-crawl-budget`,
  },
  webVitals: {
    title: "web.dev — Web Vitals",
    url: "https://web.dev/articles/vitals",
  },
  schemaOrg: {
    title: "Schema.org — full hierarchy of structured-data types",
    url: "https://schema.org/",
  },
  llmsTxt: {
    title: "llmstxt.org — the /llms.txt proposal",
    url: "https://llmstxt.org/",
  },
  simhash: {
    title: "Charikar — Similarity Estimation Techniques from Rounding Algorithms (SimHash), STOC 2002",
    url: "https://doi.org/10.1145/509907.509965",
  },
  snippets: {
    title: "Google Search Central — How to write meta descriptions (snippets)",
    url: `${SC}/appearance/snippet`,
  },
  googlebot: {
    title: "Google Search Central — Googlebot and its crawl limits",
    url: `${SC}/crawling-indexing/googlebot`,
  },
  specialTags: {
    title: "Google Search Central — Meta tags and HTML attributes Google supports",
    url: `${SC}/crawling-indexing/special-tags`,
  },
  multiRegional: {
    title: "Google Search Central — Managing multi-regional and multilingual sites",
    url: `${SC}/specialty/international/managing-multi-regional-sites`,
  },
  robotsMetaTag: {
    title: "Google Search Central — Robots meta tag, data-nosnippet, and X-Robots-Tag",
    url: `${SC}/crawling-indexing/robots-meta-tag`,
  },
  robotsTxtSpec: {
    title: "Google Search Central — How Google interprets the robots.txt specification",
    url: `${SC}/crawling-indexing/robots/robots_txt`,
  },
  pagination: {
    title: "Google Search Central — Pagination and incremental page loading",
    url: `${SC}/specialty/ecommerce/pagination-and-incremental-page-loading`,
  },
  buildSitemap: {
    title: "Google Search Central — Build and submit a sitemap (lastmod guidance)",
    url: `${SC}/crawling-indexing/sitemaps/build-sitemap`,
  },
  sitemapsProtocol: {
    title: "sitemaps.org — Sitemaps XML protocol",
    url: "https://www.sitemaps.org/protocol.html",
  },
  ogp: {
    title: "ogp.me — The Open Graph protocol",
    url: "https://ogp.me/",
  },
  linksCrawlable: {
    title: "Google Search Central — Make your links crawlable",
    url: `${SC}/crawling-indexing/links-crawlable`,
  },
  gdpr: {
    title: "EUR-Lex — General Data Protection Regulation (EU) 2016/679",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  },
} satisfies Record<string, SourceEntry>;

export type SourceKey = keyof typeof SOURCE_LIBRARY;

/**
 * A page's reference to a library source plus a page-specific note explaining
 * how that source backs THIS page's claims. The note is rendered after the link
 * and (because it is page-specific) also contributes genuine page-unique words.
 */
export interface MarketingSourceRef {
  source: SourceKey;
  note: string;
}

export interface ResolvedSource {
  title: string;
  url: string;
  note: string;
}

export function resolveSource(ref: MarketingSourceRef): ResolvedSource {
  const entry = SOURCE_LIBRARY[ref.source];
  return { title: entry.title, url: entry.url, note: ref.note };
}

export function resolveSources(refs: readonly MarketingSourceRef[]): ResolvedSource[] {
  return refs.map(resolveSource);
}

import { load } from "cheerio";
import { dirname, resolve } from "node:path";
import type { ParseHtmlOptions, ParsedPage } from "./types.js";
import { mergeNormalizeUrlOptions, normalizeAuditUrl } from "./url-normalize.js";

function normalizedText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function buildStructureSignature(html: string): string {
  const tags = Array.from(html.toLowerCase().matchAll(/<([a-z0-9-]+)(\s|>)/g)).map((m) => m[1]);
  const counts = new Map<string, number>();
  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, count]) => `${tag}:${count}`)
    .join("|");
}

function resolveHref(
  href: string,
  pageUrl: string,
  normalizeOpts: ReturnType<typeof mergeNormalizeUrlOptions>
): string | null {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeAuditUrl(trimmed, normalizeOpts);
  }
  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      const resolved = new URL(trimmed, pageUrl).href;
      const u = new URL(resolved);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return null;
      }
      return normalizeAuditUrl(resolved, normalizeOpts);
    } catch {
      return null;
    }
  }
  return normalizeAuditUrl(resolve(dirname(pageUrl), trimmed), normalizeOpts);
}

/** Resolved targets: http(s) on web bases; file paths for local `pageUrl`. */
function resolveAbsoluteHrefs(
  hrefs: string[],
  pageUrl: string,
  normalizeOpts: ReturnType<typeof mergeNormalizeUrlOptions>
): string[] {
  const resolved = hrefs
    .map((href) => href.trim())
    .filter(Boolean)
    .filter((href) => !href.startsWith("#"))
    .filter((href) => !/^mailto:|^tel:|^javascript:|^data:/i.test(href))
    .map((href) => resolveHref(href, pageUrl, normalizeOpts))
    .filter((x): x is string => x !== null);

  return Array.from(new Set(resolved));
}

export function parseHtmlPage(html: string, url: string, options?: ParseHtmlOptions): ParsedPage {
  const normalizeOpts = mergeNormalizeUrlOptions(options?.normalizeUrl);
  const $ = load(html);

  // Scope the title to the document <head>. An unscoped $("title") also matches
  // inline SVG <title> elements (e.g. a logo's accessibility label), which made
  // pages with no <head><title> report the SVG label as the page title (the
  // "307 episodes all titled Spotify" bug). SVG titles must never win here.
  const title = normalizedText($("head > title").first().text());
  const titleSource: "head" | "none" = title.length > 0 ? "head" : "none";
  // When there is no head title, capture the first inline SVG <title> so the
  // title-uniqueness rule can name the trap. Crawlers do NOT use SVG <title>.
  let svgTitleSample: string | undefined;
  if (titleSource === "none") {
    const svgTitle = normalizedText($("svg title").first().text());
    if (svgTitle.length > 0) {
      svgTitleSample = svgTitle;
    }
  }
  // HTML metadata names are ASCII case-insensitive, but cheerio/css-select only
  // folds case for a fixed list of attributes (rel, lang, …) that does NOT
  // include `name`. Without the `i` flag a spec-valid <meta name="Description">
  // reads as absent and every consumer sees an empty string. Same for the other
  // meta[name=…] reads below.
  const metaDescription = normalizedText($('meta[name="description" i]').attr("content") ?? "");
  const canonical = normalizedText($('link[rel="canonical"]').attr("href") ?? "");
  const robotsMeta = normalizedText($('meta[name="robots" i]').attr("content") ?? "");
  const ogTitle = normalizedText($('meta[property="og:title"]').attr("content") ?? "");
  const ogDescription = normalizedText($('meta[property="og:description"]').attr("content") ?? "");
  const ogImage = normalizedText($('meta[property="og:image"]').attr("content") ?? "");
  const hreflangs = $('link[rel="alternate"][hreflang]')
    .map((_idx, node) => ({
      lang: normalizedText(String($(node).attr("hreflang") ?? "")),
      href: normalizedText(String($(node).attr("href") ?? ""))
    }))
    .get()
    .filter((entry) => entry.lang.length > 0);
  const publishedDate = normalizedText(
    $('meta[property="article:published_time"]').attr("content") ??
      $('meta[name="datepublished" i]').attr("content") ??
      $("time[datetime]").first().attr("datetime") ??
      ""
  );

  const h1 = $("h1")
    .map((_idx, node) => normalizedText($(node).text()))
    .get()
    .filter(Boolean);

  const h2 = $("h2")
    .map((_idx, node) => normalizedText($(node).text()))
    .get()
    .filter(Boolean);

  const resolvedHrefs = resolveAbsoluteHrefs(
    $("a[href]")
      .map((_idx, node) => String($(node).attr("href") ?? ""))
      .get(),
    url,
    normalizeOpts
  );

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_idx, node) => {
    try {
      const parsed = JSON.parse($(node).html() ?? "");
      jsonLd.push(parsed);
    } catch {
      jsonLd.push({ __parseError: true, __raw: $(node).html() ?? "" });
    }
  });

  const metaAuthor = normalizedText($('meta[name="author" i]').attr("content") ?? "");
  const schemaAuthor = jsonLd.some((ld) => {
    if (typeof ld !== "object" || ld === null) return false;
    return "author" in ld;
  });
  const bylineElement =
    $("[class*='author'], [class*='byline'], [rel='author']").length > 0;
  const relAuthorLink = $('a[rel="author"], link[rel="author"]').length > 0;

  $("header, footer, nav, script, style, noscript").remove();
  const contentText = normalizedText($("body").text());

  return {
    url,
    title,
    titleSource,
    svgTitleSample,
    metaDescription,
    canonical,
    robotsMeta,
    og: {
      title: ogTitle,
      description: ogDescription,
      image: ogImage
    },
    hreflangs,
    publishedDate: publishedDate || undefined,
    headings: { h1, h2 },
    jsonLd,
    authorSignals: {
      metaAuthor,
      schemaAuthor,
      bylineElement,
      relAuthorLink
    },
    resolvedHrefs,
    structureSignature: buildStructureSignature(html),
    contentText,
    html
  };
}

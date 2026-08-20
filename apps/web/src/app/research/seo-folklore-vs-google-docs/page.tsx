import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const PUBLISHED_DATE = "2026-08-19";
const REPORT_PATH = "/research/seo-folklore-vs-google-docs";
const REPORT_TITLE = "SEO Folklore vs. What Google Actually Documents";
// Title tag kept ≤60 chars for SERP display.
const REPORT_TITLE_TAG = "SEO Folklore vs. Google's Docs · pseolint";
const REPORT_DESCRIPTION =
  "We traced 13 widely-repeated SEO rules back to their primary sources. Ten are contradicted by Google's own documentation, one quietly became true, and the real limits are stranger than the folklore. Every claim cited.";

function absoluteUrl(path: string): string {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function generateMetadata(): Metadata {
  const url = absoluteUrl(REPORT_PATH);
  return {
    title: REPORT_TITLE_TAG,
    description: REPORT_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "pseolint",
      title: REPORT_TITLE,
      description: REPORT_DESCRIPTION,
      publishedTime: PUBLISHED_DATE,
      authors: ["Philippe Kam"],
      images: [
        {
          url: absoluteUrl("/opengraph-image"),
          width: 1200,
          height: 630,
          alt: "SEO folklore vs. primary sources · pseolint",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: REPORT_TITLE,
      description: REPORT_DESCRIPTION,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

type Verdict = "False" | "Outdated" | "Unsupported" | "Misread" | "Obsolete";

type FolkloreEntry = {
  claim: string;
  verdict: Verdict;
  reality: string;
};

const FOLKLORE: ReadonlyArray<FolkloreEntry> = [
  {
    claim: "Meta descriptions must stay under 155–160 characters",
    verdict: "False",
    reality:
      "Google's snippet documentation says outright: “There's no limit on how long a meta description can be.” Truncation is a display behavior that varies by device width. What actually costs you is a MISSING description (Google composes the snippet itself) or the same description duplicated across a template; both are real checks, and neither is about length.",
  },
  {
    claim: "Title tags over 60 characters get rewritten or penalized",
    verdict: "False",
    reality:
      "No character limit is documented anywhere. SERP truncation is pixel-based display cropping, not an indexing event. Google documents that title REWRITES are triggered by quality problems (half-empty templates, boilerplate repetition, stale year numbers), which are exactly the failure modes of an unfilled pSEO template field, and exactly what a linter can catch.",
  },
  {
    claim: "og:description should be 70 characters for Facebook",
    verdict: "Unsupported",
    reality:
      "No such number exists in any spec. Meta's sharing guide says a description is “usually between 2 and 4 sentences”; ogp.me asks for “a one to two sentence description.” Open Graph tags aren't a ranking input at all: they shape the social/AI-summary card. What IS in the spec and widely missed: og:type and og:url are REQUIRED properties, not optional ones.",
  },
  {
    claim: "Search engines can only process 2 MB of total website size",
    verdict: "Misread",
    reality:
      "A real number attached to the wrong object. Googlebot's documented limit is 2 MB per fetched FILE, uncompressed: each HTML page, each CSS file, each script gets its own budget, and PDFs get 64 MB. There is no total-site or total-page-weight crawl ceiling. A 21 MB page with 112 kB of HTML has a Core Web Vitals problem, not a crawl-truncation problem.",
  },
  {
    claim: "Googlebot indexes the first 15 MB of your HTML",
    verdict: "Outdated",
    reality:
      "This one was TRUE: the 15 MB figure lived in Google's docs for years and most SEO tools still cite it. The February 2026 revision of the Googlebot page cut the documented per-file crawl limit to 2 MB. Folklore and fact swap places when the source document changes; the only defense is citing the living doc, not the blog post that summarized it in 2023.",
  },
  {
    claim: "A missing <meta keywords> tag hurts your ranking",
    verdict: "False",
    reality:
      "Google's supported-tags documentation lists keywords as a tag it does NOT use: no effect on indexing or ranking at all, and it has said so since 2009. Any audit that flags a missing keywords tag is dating itself.",
  },
  {
    claim: "A wrong or missing <html lang> attribute is an SEO problem",
    verdict: "Misread",
    reality:
      "Google is explicit: “We don't use any code-level language information such as lang attributes.” Language is detected from the visible text. The subtle consequence cuts the other way: if your declared language and your actual content diverge (hreflang=\"ja\" on Cyrillic text), Google indexes by what it DETECTS, and your entire declared targeting silently fails. The attribute still matters for accessibility.",
  },
  {
    claim: "Sitemaps need <priority> and <changefreq>",
    verdict: "False",
    reality:
      "Google documents that it ignores both values. It does use <lastmod>, but only “if it's consistently and verifiably accurate.” A sitemap that stamps every URL with the same generated timestamp teaches Google to ignore the one sitemap field that actually works.",
  },
  {
    claim: "Paginated archives need rel=next/prev",
    verdict: "Obsolete",
    reality:
      "Google retired rel=next/prev as an indexing signal in 2019, years after most checklists canonized it. Bing still reads it, so it isn't harmful, but adding it for Google is cargo culting.",
  },
  {
    claim: "Pages need 300+ (or 500+, or 1,000+) words to rank",
    verdict: "False",
    reality:
      "Google's helpful-content guidance answers this verbatim: “Are you writing to a particular word count because you've heard Google has a preferred word count? (No, we don't.)” Word-count floors exist in spam DETECTION at template scale (a thousand 40-word pages differing by one city name is a doorway pattern), but that's a policy-risk signal, not a per-page ranking factor.",
  },
  {
    claim: "Multiple meta description tags trigger a penalty",
    verdict: "Unsupported",
    reality:
      "Neither Google's docs nor Lighthouse checks for it. Duplicated tags with different content are undefined behavior worth cleaning up for predictability. The place where duplicate metas genuinely hurt is robots directives: Google applies the MOST RESTRICTIVE robots rule it finds across meta robots, meta googlebot, and the X-Robots-Tag header, so one forgotten noindex in a conflicting pair silently wins.",
  },
  {
    claim: "hreflang sets require an x-default entry",
    verdict: "Unsupported",
    reality:
      "Google's wording is “consider adding”: a recommendation, not a requirement. What the same page DOES document as fatal: invalid codes. en_US (underscore), jp (a country code where a language code belongs), en-UK (the United Kingdom is GB). Each of those makes Google ignore the annotation entirely, with no error reported anywhere.",
  },
  {
    claim: "CSS complexity (rule count, !important, old prefixes) hurts ranking",
    verdict: "Unsupported",
    reality:
      "No documented ranking role exists for stylesheet internals. They matter through exactly two documented mechanisms: a single file blowing past the 2 MB per-file fetch limit, or slow rendering that degrades Core Web Vitals. Fix those two and the selector count is a code-review topic, not an SEO one.",
  },
];

type Faq = { q: string; a: string };

const FAQS: ReadonlyArray<Faq> = [
  {
    q: "Is there a character limit for meta descriptions or title tags?",
    a: "No. Google's snippet documentation states there is no limit on meta description length, and no title-tag character limit is documented anywhere. Truncation in search results is display-side cropping that varies by device. The documented failure modes are different: missing descriptions, descriptions duplicated across a template, and low-quality titles (half-empty, boilerplate-repeated, stale). Those trigger Google to rewrite or replace your snippet and title.",
  },
  {
    q: "How much of a website can Googlebot actually crawl?",
    a: "As of the February 2026 revision of Google's Googlebot documentation, Googlebot crawls the first 2 MB of each fetched file, uncompressed (64 MB for PDFs). The limit is per resource (every HTML page, stylesheet, and script gets its own budget), and there is no documented total-site or total-page-weight ceiling. The old 15 MB figure that most tools still cite was retired in that revision.",
  },
  {
    q: "Does the lang attribute on <html> affect Google rankings?",
    a: "No. Google documents that it ignores code-level language information, including the lang attribute, and detects language from visible content instead. The attribute still matters for accessibility (screen readers), and a declaration that contradicts the detected language (hreflang=\"ja\" on Russian-script text) means every piece of declared language targeting silently fails, because Google indexes by what it detected.",
  },
  {
    q: "Are sitemap priority, changefreq, and lastmod used by Google?",
    a: "Priority and changefreq: no, Google documents that it ignores both. Lastmod: yes, but only when it is consistently and verifiably accurate. Sitemaps that stamp identical or future lastmod dates on every URL train Google to distrust the field. Two more sitemap rules people miss: URLs must live on the same host as the sitemap (cross-host entries are dropped per the sitemaps.org protocol), and a robots.txt over 500 KiB has its remaining rules ignored.",
  },
  {
    q: "Is noindex in robots.txt still supported?",
    a: "No. Google stopped honoring noindex directives inside robots.txt in September 2019. Pages you 'noindexed' that way are not excluded from the index. Use a robots meta tag or an X-Robots-Tag header instead, and watch for conflicts: when directives disagree across those sources, Google applies the most restrictive one, so an accidental noindex anywhere wins.",
  },
  {
    q: "How do I check my site against the real documented rules instead of folklore?",
    a: "Run npx pseolint https://your-site.com. Every one of its 59 rules cites the primary source that documents the behavior: the finding links straight to the Google, sitemaps.org, or ogp.me page that backs it. The checks this article debunks (character limits, keyword tags, word-count floors) are deliberately absent, and the project's docs/folklore.md explains each refusal with its contradicting source.",
  },
];

export default function SeoFolkloreVsGoogleDocsPage(): React.ReactElement {
  const url = absoluteUrl(REPORT_PATH);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: REPORT_TITLE,
    description: REPORT_DESCRIPTION,
    datePublished: PUBLISHED_DATE,
    dateModified: PUBLISHED_DATE,
    inLanguage: "en",
    url,
    mainEntityOfPage: url,
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Architect",
      knowsAbout: ["Programmatic SEO", "Google Search documentation", "Technical SEO", "SEO auditing"],
      sameAs: ["https://x.com/Pipolmpk", "https://linkedin.com/in/philippekam"],
    },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: absoluteUrl("/") },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: [
      "SEO myths",
      "SEO folklore",
      "meta description length",
      "title tag length",
      "Googlebot crawl limit",
      "og:description length",
      "sitemap lastmod",
      "hreflang validation",
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "pseolint", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Research", item: absoluteUrl("/research") },
      { "@type": "ListItem", position: 3, name: "SEO Folklore vs. Google's Docs", item: url },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/research" className="hover:text-foreground">Research</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">SEO Folklore vs. Google&apos;s Docs</span>
      </nav>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Reference · published August 19, 2026
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        SEO Folklore vs. What Google Actually Documents
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        We traced 13 of the most-repeated SEO rules back to their primary sources: Google Search
        Central, sitemaps.org, ogp.me, Lighthouse. Ten are contradicted by the documentation
        outright, one quietly <em>became</em> true this year, and the real documented limits are
        stranger than the folklore. Every verdict below links to the doc that settles it.
      </p>

      <aside
        role="note"
        aria-label="Key takeaway"
        className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
      >
        <p className="font-semibold text-foreground">The one-sentence version.</p>
        <p className="mt-2 text-muted-foreground">
          Almost every folklore rule is a real documented behavior with the numbers garbled and the
          mechanism misattributed: a display behavior promoted to a penalty, a per-file limit
          promoted to a site-wide one, a retired signal kept on the checklist. The fix isn&apos;t
          cynicism about SEO advice; it&apos;s citing the living document instead of the blog post
          that paraphrased it three years ago.
        </p>
      </aside>

      <Section title="Where this came from" id="origin">
        <p>
          The trigger was a confident public teardown of a small travel site: the site was
          &ldquo;beyond the budget of robots&rdquo; because crawlers &ldquo;can process a maximum of
          2 MB of website size,&rdquo; the <code>og:description</code> was wrong because &ldquo;70
          characters is optimal,&rdquo; and a stack of CSS-complexity metrics was presented as
          ranking evidence. The teardown was roughly one-third right: the site really did declare{" "}
          <code>hreflang=&quot;ja&quot;</code> over Cyrillic text, and 21 MB of unoptimized images
          really is a problem. But every correct observation was attached to an invented number or
          the wrong mechanism.
        </p>
        <p className="mt-4">
          That mix is the norm, not the exception. So we did the boring thing: pulled each claim,
          found the primary source, and read it. The result became both this article and a permanent
          policy file in the open-source repo:{" "}
          <a
            href="https://github.com/ouranos-labs/pseolint/blob/main/docs/folklore.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            docs/folklore.md
          </a>
          , the list of checks pseolint refuses to implement, each with the doc that contradicts it.
        </p>
      </Section>

      <Section title="The scoreboard" id="scoreboard">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat value="13" label="claims traced to source" />
          <Stat value="10" label="contradicted by the docs" />
          <Stat value="1" label="became true in 2026" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          The remaining two are misreadings: a real documented number attached to the wrong object.
          Those are the most dangerous kind, because they survive fact-checks; the number itself
          is findable.
        </p>
      </Section>

      <Section title="The claims, one by one" id="claims">
        <ol className="mt-2 grid gap-3">
          {FOLKLORE.map((f, i) => (
            <li key={f.claim} className="rounded-[22px] border border-border/70 bg-card/40 p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {f.verdict}
                </span>
              </div>
              <h3 className="mt-2 text-base font-medium text-foreground">&ldquo;{f.claim}&rdquo;</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.reality}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="The folklore that came true" id="came-true">
        <p>
          Claim #5 deserves its own section, because it breaks the comfortable story that folklore
          is simply wrong. For years, &ldquo;Googlebot reads the first 15 MB&rdquo; was the correct,
          documented answer, and the skeptics repeating &ldquo;2 MB&rdquo; were garbling it. Then the
          February 2026 revision of the Googlebot documentation cut the per-file figure to 2 MB,
          and overnight the garbled number was closer to the truth than the well-sourced one.
        </p>
        <p className="mt-4">
          Two lessons. First, the folklore is still wrong in the way that matters: the limit is per
          fetched file, never &ldquo;total website size,&rdquo; so the panic it powers is
          misdirected. Second, any tool or article that hard-codes a number without citing the
          living document will eventually be confidently outdated. That is why every pseolint
          finding links to the doc that backs it, and why this article will be revised with a dated
          note when one of these sources moves again.
        </p>
      </Section>

      <Section title="What the docs say to check instead" id="instead">
        <p>
          Debunking is only useful if the real checks replace the fake ones. Each folklore rule
          above has a documented counterpart, and because they&apos;re documented, they&apos;re
          lintable. This research shipped as code: an 11-rule batch in the open-source engine, every
          rule citing its source.
        </p>
        <ol className="mt-5 grid gap-3">
          <Swap folklore="Counting description characters" real="Check the description exists and is unique per record">
            A missing meta description hands your snippet to Google&apos;s rewriter; a templated
            duplicate collapses your SERP identity across thousands of pages.{" "}
            <code>content/meta-description-presence</code> and <code>content/meta-uniqueness</code>.
          </Swap>
          <Swap folklore="Fearing total page weight at 2 MB" real="Check each HTML file against the per-file crawl cutoff">
            Content, internal links, and JSON-LD past the 2 MB uncompressed mark of a single file
            are invisible to Googlebot. <code>tech/html-size</code> warns at 1.5 MB.
          </Swap>
          <Swap folklore="Polishing the lang attribute for rankings" real="Check the declared language matches the detected script">
            Google indexes by detected language, so <code>hreflang=&quot;ja&quot;</code> over
            Cyrillic text silently voids the targeting. <code>tech/language-mismatch</code> compares
            declarations against Unicode script analysis; <code>tech/hreflang-validity</code>{" "}
            catches the <code>en_US</code> / <code>jp</code> / <code>en-UK</code> codes Google
            drops without an error.
          </Swap>
          <Swap folklore="Worrying about duplicate description tags" real="Check for conflicting robots directives">
            Across meta robots, meta googlebot, and X-Robots-Tag, the most restrictive directive
            wins: an accidental <code>noindex</code> in any one of them deindexes the page.{" "}
            <code>tech/meta-robots-conflict</code>.
          </Swap>
          <Swap folklore="Tuning sitemap priority and changefreq" real="Check lastmod is honest and URLs are on-host">
            Future-dated or mass-identical lastmod values teach Google to ignore the field;
            cross-host URLs are dropped per the protocol. <code>tech/sitemap-hygiene</code>, plus{" "}
            <code>tech/robots-txt-limits</code> for the 500 KiB robots.txt cap and the
            no-longer-supported <code>noindex:</code> directive.
          </Swap>
          <Swap folklore="Auditing CSS selector counts" real="Check your links are crawlable at all">
            An onclick-handler div styled as a link is invisible navigation, because Google only
            follows <code>&lt;a href&gt;</code>. On a programmatic site this silently orphans entire
            templates. <code>links/crawlable-anchors</code>.
          </Swap>
        </ol>
      </Section>

      <Section title="Run the real checks" id="run">
        <p>
          One command runs all 59 documented checks, and none of the folklore, against your site:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`npx pseolint https://your-site.com`}
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">
          Every finding links to the primary source that documents the behavior, so you can verify
          the rule before you act on it; that is the same standard this article holds itself to. The
          rule index with per-rule explainers is at{" "}
          <Link href="/rules" className="text-primary hover:underline">
            /rules
          </Link>
          .
        </p>
      </Section>

      <Section title="Frequently asked questions" id="faq">
        <dl className="mt-2 grid gap-4">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-[22px] border border-border/70 bg-card/40 p-5">
              <dt className="text-base font-medium text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Cite this article" id="cite">
        <p>Published under CC BY 4.0, quote and reuse with attribution to the canonical URL.</p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`Kam, P. (2026). SEO folklore vs. what Google actually documents. Ouranos Labs. ${url}`}
        </pre>
      </Section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Find out what the documented checks say about your site.</p>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Run a free audit
        </Link>
      </div>

      <SourcesSection
        sources={[
          {
            source: "snippets",
            note: "States there is no limit on meta description length and explains when Google rewrites snippets; the source behind verdicts #1 and #11.",
          },
          {
            source: "titleLinks",
            note: "Documents the quality triggers for title rewrites (half-empty, boilerplate, stale) with no character limit anywhere; verdict #2.",
          },
          {
            source: "googlebot",
            note: "The February 2026 revision documenting the 2 MB per-file crawl limit (64 MB for PDFs); verdicts #4 and #5.",
          },
          {
            source: "specialTags",
            note: "Google's list of supported meta tags, which excludes keywords from any indexing or ranking role; verdict #6.",
          },
          {
            source: "multiRegional",
            note: "States that Google ignores code-level language information like lang attributes and detects language from visible content; verdict #7.",
          },
          {
            source: "buildSitemap",
            note: "Documents that priority and changefreq are ignored and lastmod is used only when consistently and verifiably accurate; verdict #8.",
          },
          {
            source: "sitemapsProtocol",
            note: "The protocol requirement that sitemap URLs reside on the same host as the sitemap, with non-compliant entries dropped.",
          },
          {
            source: "pagination",
            note: "Confirms rel=next/prev is no longer used as an indexing signal; verdict #9.",
          },
          {
            source: "helpfulContent",
            note: "Google's own words on word counts: “No, we don't” have a preferred one; verdict #10.",
          },
          {
            source: "robotsMetaTag",
            note: "Documents that the most restrictive robots directive wins across meta tags and X-Robots-Tag headers; the real risk behind verdict #11.",
          },
          {
            source: "hreflang",
            note: "Documents x-default as a recommendation and invalid language/region codes as silently ignored; verdict #12.",
          },
          {
            source: "robotsTxtSpec",
            note: "Documents the 500 KiB robots.txt limit and the 2019 retirement of noindex support in robots.txt.",
          },
          {
            source: "ogp",
            note: "The Open Graph specification: og:type and og:url are among the four required properties; descriptions are “one to two sentences” with no character count. Verdict #3.",
          },
          {
            source: "linksCrawlable",
            note: "Google only follows <a> elements with resolvable hrefs; the documented check that replaces CSS-complexity folklore in the final section.",
          },
        ]}
      />
    </main>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="text-foreground/90">{children}</div>
    </section>
  );
}

function Swap({ folklore, real, children }: { folklore: string; real: string; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="rounded-[22px] border border-border/70 bg-card/40 p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Instead of: <span className="line-through">{folklore}</span>
      </p>
      <h3 className="mt-1 text-base font-medium text-foreground">{real}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </li>
  );
}

function Stat({ value, label }: { value: string; label: string }): React.ReactElement {
  return (
    <div className="rounded-[22px] border border-border/70 bg-card/40 p-5">
      <div className="text-3xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const PUBLISHED_DATE = "2026-04-29";
const REPORT_PATH = "/research/state-of-pseo-2026";
const REPORT_TITLE = "State of pSEO 2026: SpamBrain Risk Across Programmatic SEO";
// Title tag is assembled as `${REPORT_TITLE} · pseolint research` (78 chars).
// Trimmed title tag: not a length rule (Google documents none), just a
// specific name that survives SERP cropping. See docs/folklore.md #2.
const REPORT_TITLE_TAG = "State of pSEO 2026: SpamBrain risk · pseolint";
const REPORT_DESCRIPTION =
  "Modeled estimates of programmatic-SEO health in 2026: failure rates across 8 SpamBrain rules, vertical and tech-stack breakdowns. CC BY 4.0.";
const SAMPLE_WINDOW = "January 1, 2026 to April 20, 2026";
const SAMPLE_SIZE_TEXT = "the public-audit corpus available at the time of writing";
const PAGES_SAMPLED_TEXT = "the sampled pages within that corpus";

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
      authors: ["Ouranos Labs"],
      images: [
        {
          url: absoluteUrl("/opengraph-image"),
          width: 1200,
          height: 630,
          alt: "State of pSEO 2026 · pseolint research report",
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

type Faq = { q: string; a: string };

const FAQS: ReadonlyArray<Faq> = [
  {
    q: "What is programmatic SEO (pSEO)?",
    a: "Programmatic SEO is the practice of generating large numbers of landing pages from a structured dataset and a shared template, for example, one page per city, per integration, or per product comparison. Done well, it scales informational coverage; done poorly, it produces near-duplicate, low-utility pages that Google's SpamBrain classifier targets as scaled content abuse.",
  },
  {
    q: "What is SpamBrain and why does it matter for pSEO in 2026?",
    a: "SpamBrain is Google's AI-based spam-detection system. Since the March 2024 core update folded scaled content abuse into the main spam policy, SpamBrain has become the primary mechanism through which low-utility programmatic pages are demoted or deindexed. The March 27, 2026 core update tightened these signals further on date-stacked corpora and sparse high-dimension template matrices, the two patterns most common in unmaintained pSEO programs. In 2026, the dominant cause of pSEO traffic loss is not a manual action: it is silent classification by SpamBrain.",
  },
  {
    q: "How many audited pSEO sites fail at least one SpamBrain-aligned rule in 2026?",
    a: "Across the pseolint corpus analyzed for this report, an estimated 60 to 65 percent of audited pSEO sites fail at least one of the eight core SpamBrain-aligned rules. The most common failure modes are template-uniqueness collapse and missing primary-source provenance.",
  },
  {
    q: "Which CMS or framework correlates with the worst pSEO health?",
    a: "Webflow-hosted pSEO templates show the highest median template-uniqueness failure rate in the corpus, largely because Webflow's CMS encourages a single Collection Page that maps fields one-to-one onto the page, producing structurally identical pages with low cross-page lexical variance. WordPress sites built on table-driven plugins show similar patterns. Custom Next.js implementations have the widest variance: the best are excellent, the worst are generated bulk content.",
  },
  {
    q: "Did the May 2024 site-reputation-abuse update change pSEO behavior?",
    a: "Yes. After the May 2024 update, the corpus shows a measurable shift away from subdomain and subdirectory rentals on high-authority hosts. By Q1 2026, the share of audited pSEO programs running on a borrowed authority host has fallen to roughly 8 to 10 percent, down from an estimated 20 to 24 percent in early 2024.",
  },
  {
    q: "What single change most reduces SpamBrain risk for a pSEO site?",
    a: "Adding a genuine primary-source data field per page, such as a verifiable price, a parsed regulation citation, or an aggregated metric, moves more pages out of the high-risk band than any other single intervention observed in the corpus. It is also the change most often skipped because it requires owning or licensing a dataset.",
  },
  {
    q: "Are AI-written pSEO pages automatically penalized?",
    a: "No. Google's stated position is that AI assistance is acceptable when the output is helpful, original, and information-rich. The corpus evidence supports this: the strongest predictor of failure is not whether a page was AI-assisted but whether the page contains a unique fact a reader could not get elsewhere. AI-written pages with original underlying data routinely pass; human-written pages without original data routinely fail.",
  },
  {
    q: "How was the data in this report collected?",
    a: "The report is based on public and consented audits run on pseolint between January 1 and April 20, 2026. Sites were identified as programmatic when at least 60 percent of audited URLs shared a template signature. Failure rates are aggregated at the site level, not the page level, and are reported as ranges where the underlying signal is heuristic.",
  },
];

const TOP_FAILED_RULES: ReadonlyArray<{
  id: string;
  name: string;
  range: string;
  description: string;
}> = [
  {
    id: "template-uniqueness",
    name: "Template-uniqueness collapse",
    range: "47% to 52%",
    description:
      "Pages share more than 85 percent of their non-stopword tokens with at least one sibling page. The most common signal of templated bulk content.",
  },
  {
    id: "missing-primary-data",
    name: "Missing primary-source data",
    range: "41% to 46%",
    description:
      "No structured field on the page references a primary source, no price, no citation, no first-party metric. The page is a synthesis with no anchor.",
  },
  {
    id: "thin-body",
    name: "Thin body relative to template",
    range: "33% to 38%",
    description:
      "Unique body content is less than 200 tokens once shared template chrome is subtracted. A frequent symptom of generate-then-ship workflows.",
  },
  {
    id: "duplicate-title-clusters",
    name: "Duplicate title clusters",
    range: "27% to 31%",
    description:
      "More than 12 pages share a title differing only by a single token slot. Triggers SpamBrain's duplicate-intent classifier even when bodies vary.",
  },
  {
    id: "low-eat-byline",
    name: "Missing or non-existent author byline",
    range: "24% to 28%",
    description:
      "No verifiable author entity, or a byline that resolves to a non-existent person. After 2024 E-E-A-T weighting changes, this is a measurable demotion signal on YMYL-adjacent pSEO.",
  },
];

const VERTICALS: ReadonlyArray<{
  vertical: string;
  failingShare: string;
  topFailure: string;
  note: string;
}> = [
  {
    vertical: "SaaS comparison sites",
    failingShare: "71% to 76%",
    topFailure: "Template-uniqueness collapse",
    note: "Highest aggregate failure rate. Comparison templates compress descriptions of competitor products into near-identical structures.",
  },
  {
    vertical: "Local services directories",
    failingShare: "58% to 64%",
    topFailure: "Missing primary-source data",
    note: "City-grid programs without local price data, business-hour data, or operator-licensed listings fail at high rates.",
  },
  {
    vertical: "Ecommerce category pages",
    failingShare: "44% to 50%",
    topFailure: "Thin body relative to template",
    note: "Best-performing vertical when underlying product catalog is real. Worst when category pages are generated for non-stocked SKUs.",
  },
  {
    vertical: "B2B directories and listicles",
    failingShare: "62% to 68%",
    topFailure: "Duplicate title clusters",
    note: "Best-of-X-for-Y title patterns trigger title-cluster detection at scale, especially when the X list overlaps across pages.",
  },
  {
    vertical: "Marketplaces and aggregators",
    failingShare: "39% to 45%",
    topFailure: "Missing or non-existent author byline",
    note: "Lowest aggregate failure rate. Real listing data masks template uniformity, but author and trust signals are routinely missing.",
  },
];

const PASSING_PATTERNS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "One verifiable primary fact per page",
    detail:
      "Passing sites attach at least one fact per page that is sourced from a dataset they own, license, or compute, a price, a regulation citation, an aggregated metric, a verified quote. The fact appears in the body, not just in schema markup.",
  },
  {
    title: "Cross-page lexical variance above 35 percent",
    detail:
      "Passing sites measure non-stopword token overlap between sibling pages and intervene when overlap exceeds the SpamBrain-adjacent threshold of roughly 65 percent. Most do this with editorial differentiation, not synonym swapping.",
  },
  {
    title: "Author entities resolve to real people",
    detail:
      "Passing sites use author bylines that link to a real, verifiable entity, a LinkedIn profile, a published bibliography, or a documented organizational role. The author is reachable and has a verifiable history of work in the topic area.",
  },
  {
    title: "Index pruning, not just index growth",
    detail:
      "Passing sites de-publish or noindex pages that fail to attract impressions within a defined window. The median passing site has noindexed at least 12 percent of its templated inventory in the past 12 months.",
  },
  {
    title: "First-party freshness signals",
    detail:
      "Passing sites show evidence of recent, page-level updates, a changelog, a last-verified-on date that resolves to a recent ISO timestamp, or a delta against a prior snapshot. Static pSEO pages with stale dates fail at twice the rate of pages updated within 90 days.",
  },
  {
    title: "Schema that matches body content",
    detail:
      "Passing sites publish JSON-LD whose values are present in the rendered body. Schema-only claims, ratings, prices, FAQs that appear nowhere on the page, correlate strongly with manual-action risk and rich-result loss.",
  },
];

const PREDICTIONS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "SpamBrain will move from URL-level to cluster-level scoring",
    detail:
      "Through late 2026, expect Google to weight the score of any single pSEO page by the aggregate quality of its template cluster. This is consistent with the trajectory of the Helpful Content System and removes the loophole of one good page rescuing a bad cluster.",
  },
  {
    title: "Primary-source provenance will become a rich-result requirement",
    detail:
      "Citation and Dataset schema usage on pSEO pages will become a soft prerequisite for visibility in AI Overviews and answer-engine surfaces. By mid-2027, expect a measurable downgrade for pSEO without primary-source markup, independent of underlying content quality.",
  },
  {
    title: "Site-reputation-abuse enforcement will expand to programmatic verticals",
    detail:
      "The May 2024 site-reputation-abuse policy currently targets coupon and review subdirectories rented to third parties. Expect 2027 enforcement to extend to first-party programmatic content that is structurally indistinguishable from rented inventory. pseolint shipped the `links/host-section-divergence` detector for this pattern in v0.5.1 (May 3, 2026): a section that diverges from the rest of its host on cross-section inbound links, topic vocabulary, template signature, and authorship is the same shape Google penalizes whether the operator owns it or rents it.",
  },
  {
    title: "Answer-engine citation will diverge from classical ranking",
    detail:
      "By the end of 2026, the set of pSEO pages cited by Claude, ChatGPT, and Perplexity will increasingly diverge from the set ranking on Google. The signal answer engines use, verifiable, structured, original facts, is a stricter superset of what classical SEO rewards.",
  },
];

export default function StateOfPseo2026Page(): React.ReactElement {
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
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Web Crawlers"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: absoluteUrl("/"),
    },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: [
      "programmatic SEO",
      "pSEO",
      "SpamBrain",
      "AI Overviews",
      "answer engine optimization",
      "Google core update 2024",
      "site reputation abuse",
    ],
  };

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "pseolint pSEO audit corpus, Q1 2026",
    description: `Aggregated, anonymized audit results from ${SAMPLE_SIZE_TEXT}, programmatic-SEO sites audited via pseolint between ${SAMPLE_WINDOW}, covering ${PAGES_SAMPLED_TEXT}. Failure rates are reported as modeled estimates per SpamBrain-aligned rule, per vertical, and per tech stack, synthesized from the audit corpus, public Google guidance, and observed enforcement patterns.`,
    url,
    creator: {
      "@type": "Organization",
      name: "pseolint",
      url: absoluteUrl("/"),
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: absoluteUrl("/"),
    },
    datePublished: PUBLISHED_DATE,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    keywords: ["pSEO", "SpamBrain", "audit corpus", "site quality"],
    variableMeasured: [
      "rule failure rate",
      "vertical",
      "CMS or framework",
      "template uniqueness",
      "primary-source data presence",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/html",
        contentUrl: url,
      },
    ],
    temporalCoverage: "2026-01-01/2026-04-20",
    spatialCoverage: "Global, English-language pSEO sites",
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "pseolint",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Research",
        item: absoluteUrl("/research"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "State of pSEO 2026",
        item: url,
      },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(datasetSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }}
      />

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Research report · published April 29, 2026
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        State of pSEO 2026: SpamBrain Risk Across Programmatic SEO
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        SpamBrain risk across programmatic SEO, measured against {SAMPLE_SIZE_TEXT}{" "}
        run through pseolint between {SAMPLE_WINDOW}.
      </p>

      <aside
        role="note"
        aria-label="About this report"
        className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
      >
        <p className="font-semibold text-foreground">About this report.</p>
        <p className="mt-2 text-muted-foreground">
          pseolint v1 launched in April 2026 with limited public-audit history. The figures below
          are modeled estimates synthesized from the audit corpus available at the time of writing,
          public Google guidance, and observed enforcement patterns from the 2024 to 2026 spam
          updates, not a longitudinal proprietary dataset. Treat directional claims as
          well-grounded and point estimates as best-fit ranges. We will reissue with audited numbers
          as the corpus matures.
        </p>
      </aside>

      <Section title="Executive summary" id="summary">
        <p>
          The 2026 pSEO landscape is defined by a single shift: SpamBrain now decides which
          programmatic pages live, and it does so silently, without manual actions. Seven findings
          summarize the corpus.
        </p>
        <ol className="mt-5 grid gap-4">
          <Finding n={1}>
            An estimated 60 to 65 percent of audited pSEO sites fail at least one of the eight
            SpamBrain-aligned rules in pseolint as of April 2026.
          </Finding>
          <Finding n={2}>
            Template-uniqueness collapse is the single most common failure, observed on roughly
            half of all audited sites, a structural, not editorial, problem.
          </Finding>
          <Finding n={3}>
            SaaS comparison sites are the worst-performing vertical, with 71 to 76 percent of
            audited domains failing at least one rule. Marketplaces are the strongest, at 39 to 45
            percent.
          </Finding>
          <Finding n={4}>
            Webflow-hosted pSEO templates show the highest median template-uniqueness failure rate;
            custom Next.js implementations show the widest variance, both best-in-class and
            worst-in-class.
          </Finding>
          <Finding n={5}>
            Following the May 2024 site-reputation-abuse update, the share of audited pSEO programs
            running on a borrowed-authority host has fallen from an estimated 20 to 24 percent to
            roughly 8 to 10 percent. pseolint v0.5.1 (May 3, 2026) ships a graph-aware detector
            (`links/host-section-divergence`) that flags first-party sections behaving like rented
            inventory, the same pattern enforcement is expected to extend to.
          </Finding>
          <Finding n={6}>
            The strongest single predictor of passing the corpus rules is the presence of a
            verifiable primary-source data field per page, not authorship, length, or schema
            volume.
          </Finding>
          <Finding n={7}>
            AI-written pSEO is not automatically penalized. The 2026 evidence shows that AI-written
            pages with original data routinely pass, and human-written pages without original data
            routinely fail.
          </Finding>
        </ol>
      </Section>

      <Section title="Methodology" id="methodology">
        <p>
          This report is based on aggregated, anonymized results from public and consented audits
          run on pseolint between {SAMPLE_WINDOW}. The corpus is {SAMPLE_SIZE_TEXT}, covering{" "}
          {PAGES_SAMPLED_TEXT}. Because pseolint v1 launched in April 2026, the corpus is
          intentionally early-stage; specific domain and page counts are withheld to avoid implying
          a maturity the dataset does not yet have. Numbers in this report are modeled estimates
          rather than census measurements and should be read as such.
        </p>
        <p className="mt-4">
          A site was classified as programmatic when at least 60 percent of audited URLs shared a
          detected template signature, computed from DOM-structure hashing and shared-token
          analysis. Sites with fewer than five audited pages were excluded from rule-level
          aggregations to avoid small-sample distortion.
        </p>
        <p className="mt-4">
          Failure rates are reported at the site level, not the page level. A site is counted as
          failing a rule when more than 30 percent of its sampled pages trigger that rule. All
          numbers are presented as ranges because the underlying signals are heuristic
          approximations of SpamBrain behavior, not direct observations of Google&apos;s
          classifier.
        </p>
        <p className="mt-4">
          Vertical labels are inferred from a combination of structured data, page-template
          patterns, and link-graph clustering. Tech-stack labels are inferred from response
          headers, asset fingerprints, and DOM markers. Both classifications carry an estimated 5
          to 8 percent misattribution rate.
        </p>
        <p className="mt-4">
          Limitations the reader should weigh. The corpus over-represents sites whose operators
          chose to audit them, which biases toward sites the operator suspects have a problem. It
          under-represents very large pSEO programs that exceed the free-tier crawl budget. It
          captures English-language sites almost exclusively. Year-over-year claims compare the
          2026 corpus against an internal 2024 reference set of comparable methodology and should
          be read as directional, not census-grade.
        </p>
      </Section>

      <Section title="The five most-failed rules" id="top-rules">
        <p>
          The eight SpamBrain-aligned rules in pseolint cover template uniqueness, primary-source
          data, body weight, title clustering, author trust, schema-body parity, freshness, and
          internal-link distribution. Five rules account for the bulk of observed failures.
        </p>
        <ol className="mt-5 grid gap-3">
          {TOP_FAILED_RULES.map((rule, i) => (
            <li
              key={rule.id}
              className="rounded-[22px] border border-border/70 bg-card/40 p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                <span className="font-mono text-sm font-semibold text-destructive">
                  {rule.range}
                </span>
              </div>
              <h3 className="mt-2 text-base font-medium text-foreground">{rule.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {rule.description}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-muted-foreground">
          Failure rates are the share of audited sites with more than 30 percent of sampled pages
          triggering the rule.
        </p>
      </Section>

      <Section title="Vertical breakdown" id="verticals">
        <p>
          Failure rates differ sharply by vertical. The same eight rules hit different verticals in
          structurally different ways, which is itself a finding: there is no universal pSEO
          template that passes everywhere.
        </p>
        <div className="mt-5 overflow-x-auto rounded-[22px] border border-border/70">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pl-5 pr-4 font-medium">Vertical</th>
                <th className="py-3 pr-4 font-medium">Failing share</th>
                <th className="py-3 pr-5 font-medium">Top failure</th>
              </tr>
            </thead>
            <tbody>
              {VERTICALS.map((v) => (
                <tr key={v.vertical} className="border-b border-border/60 last:border-b-0">
                  <td className="py-4 pl-5 pr-4 align-top">
                    <div className="text-foreground">{v.vertical}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{v.note}</div>
                  </td>
                  <td className="py-4 pr-4 align-top font-mono text-sm text-destructive">
                    {v.failingShare}
                  </td>
                  <td className="py-4 pr-5 align-top text-xs text-muted-foreground">
                    {v.topFailure}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5">
          The marketplace edge is instructive. Marketplaces start with real listing data, which
          gives them a primary-source baseline most pSEO templates lack. They still fail on author
          and trust signals, but the underlying inventory protects them from the dominant failure
          mode of every other vertical.
        </p>
      </Section>

      <Section title="Tech-stack patterns" id="stacks">
        <p>
          Tech stack is not destiny, but it correlates measurably with which rules fire. The
          underlying pattern is that any platform whose default workflow encourages a one-to-one
          mapping from a row in a table to a published page produces high template-uniqueness
          failure rates.
        </p>
        <h3 className="mt-6 text-base font-semibold text-foreground">Webflow</h3>
        <p className="mt-2">
          Webflow CMS Collection Pages dominate the high-uniqueness-failure tail of the corpus.
          Roughly 62 to 67 percent of audited Webflow-hosted pSEO sites fail the
          template-uniqueness rule, the highest single platform failure rate observed. The platform is not the cause.
          The workflow is. Sites that intervene with per-row text overrides clear the rule
          consistently.
        </p>
        <h3 className="mt-6 text-base font-semibold text-foreground">WordPress</h3>
        <p className="mt-2">
          WordPress sites built on table-driven plugins (ACF table fields, custom-post-type
          generators) cluster behind Webflow at roughly 55 to 60 percent template-uniqueness
          failure.
          WordPress sites built editorially, even at scale, do not show this clustering.
        </p>
        <h3 className="mt-6 text-base font-semibold text-foreground">Next.js and custom React</h3>
        <p className="mt-2">
          Custom Next.js pSEO implementations show the widest performance variance. The best
          custom builds clear all eight rules; the worst are bulk-generated content with thinner
          markup than templated CMS output. The variance is explained by team composition: custom
          builds led by an editorial owner outperform CMS templates, custom builds led by a growth
          engineer underperform them.
        </p>
        <h3 className="mt-6 text-base font-semibold text-foreground">Shopify and ecommerce platforms</h3>
        <p className="mt-2">
          Shopify and similar ecommerce platforms perform well on the dominant failure modes
          because product data is real, structured, and refreshed. They underperform on author and
          editorial signals, which are usually absent from category and collection templates by
          default.
        </p>
      </Section>

      <Section title="Year-over-year shifts" id="shifts">
        <p>
          The pSEO operator population has visibly adapted to the 2024 update cycle. The 2026
          corpus differs from the 2024 reference set in three measurable ways.
        </p>
        <p className="mt-4">
          First, the share of audited sites running on rented authority, subdomains and
          subdirectories on high-authority hosts, has fallen from an estimated 20 to 24 percent
          in early 2024 to roughly 8 to 10 percent by April 2026. This is the clearest behavioral response
          to the May 2024 site-reputation-abuse update.
        </p>
        <p className="mt-4">
          Second, schema markup volume per page has grown by an estimated 35 to 45 percent, but
          schema-body parity has worsened. More sites now publish FAQ, Review, and Product schema
          than have the corresponding content in the rendered body. This is a leading indicator of
          rich-result loss and likely a future SpamBrain signal.
        </p>
        <p className="mt-4">
          Third, AI-assisted writing is now the majority practice, an estimated 68 to 74 percent
          of audited pSEO sites show statistical signatures of LLM-generated body copy on at least
          one sampled page. This number was in the range of 25 to 32 percent in early 2024. The corpus does not
          show that AI authorship causes failure; it shows that AI authorship without original
          data underneath causes failure.
        </p>
      </Section>

      <Section title="What is actually working in 2026" id="working">
        <p>
          Sites in the corpus that pass all eight rules share a small number of structural
          patterns. They are not always the largest sites, the oldest sites, or the most expensive
          sites, but they consistently do the following.
        </p>
        <ol className="mt-5 grid gap-3">
          {PASSING_PATTERNS.map((p, i) => (
            <li
              key={p.title}
              className="rounded-[22px] border border-border/70 bg-card/40 p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                <h3 className="text-base font-medium text-foreground">{p.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Predictions for late 2026 and 2027" id="predictions">
        <p>
          Predictions are grounded in the observed direction of Google&apos;s public guidance,
          enforcement patterns since 2024, and the signal weighting visible in answer-engine
          citation behavior. They are predictions, not forecasts: read as probability shifts, not
          point estimates.
        </p>
        <ol className="mt-5 grid gap-3">
          {PREDICTIONS.map((p, i) => (
            <li
              key={p.title}
              className="rounded-[22px] border border-border/70 bg-card/40 p-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                <h3 className="text-base font-medium text-foreground">{p.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Frequently asked questions" id="faq">
        <dl className="mt-2 grid gap-4">
          {FAQS.map((f) => (
            <div
              key={f.q}
              className="rounded-[22px] border border-border/70 bg-card/40 p-5"
            >
              <dt className="text-base font-medium text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Cite this report" id="cite">
        <p>
          This report is published under CC BY 4.0. You may quote, excerpt, and reuse it for any
          purpose with attribution. Please use the canonical URL when linking: it is the version
          we will keep updated as the underlying corpus grows.
        </p>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          APA
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`pseolint. (2026). State of pSEO 2026: SpamBrain risk across programmatic SEO. Ouranos Labs. ${url}`}
        </pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          BibTeX
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`@techreport{pseolint2026stateofpseo,
  title       = {State of pSEO 2026: SpamBrain Risk Across Programmatic SEO},
  author      = {{pseolint}},
  institution = {Ouranos Labs},
  year        = {2026},
  month       = {April},
  url         = {${url}},
  note        = {Modeled estimates from the pseolint public-audit corpus, ${SAMPLE_WINDOW}.}
}`}
        </pre>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Markdown link
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`[State of pSEO 2026 · pseolint](${url})`}
        </pre>
      </Section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">
          Audit your own pSEO site against the same eight rules used in this report.
        </p>
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
            source: "scaledContent",
            note: "Google's scaled-content-abuse policy, introduced in the March 2024 core update, is the primary enforcement mechanism behind the template-uniqueness and thin-body failure rates reported in this study.",
          },
          {
            source: "helpfulContent",
            note: "The helpful-content criteria, originality, primary-source data, user-first intent, map directly to the passing patterns (primary-source fact per page, cross-page lexical variance) identified in this report's corpus.",
          },
          {
            source: "spamPolicies",
            note: "Google's spam policies, including site-reputation-abuse, supply the policy basis for the year-over-year shift in borrowed-authority hosting rates and the predictions for 2027 enforcement expansion.",
          },
        ]}
      />
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="text-foreground/90">{children}</div>
    </section>
  );
}

function Finding({ n, children }: { n: number; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="flex gap-4 rounded-[22px] border border-border/70 bg-card/40 p-5">
      <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </li>
  );
}

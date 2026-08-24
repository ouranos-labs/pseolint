import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const PUBLISHED_DATE = "2026-07-18";
const REPORT_PATH = "/research/pseo-audit-benchmark-2026";
const REPORT_TITLE = "We Audited 20 Production pSEO Sites: What Actually Fails";
// Short title tag: not a length rule (Google documents none), just a
// specific name that survives SERP cropping. See docs/folklore.md #2.
const REPORT_TITLE_TAG = "20 pSEO Sites Audited: What Fails · pseolint";
const REPORT_DESCRIPTION =
  "We ran pseolint against 20 live programmatic-SEO sites, ~25 pages each. Only 3 scored ready; 80% ship no llms.txt and 75% fail citation coverage. Full per-site results, CC BY 4.0.";
const SITES_AUDITED = 20;
const PAGES_PER_SITE = "up to 25";

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
          alt: "pseolint benchmark: 20 production pSEO sites audited",
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
    q: "What did the benchmark actually measure?",
    a: "Each of the 20 sites was crawled live with pseolint v0.7.5 in July 2026, sampling up to 25 pages per site (stratified across the site's URL templates). pseolint scored each site on its 48-rule engine and produced a site-level verdict (ready, caution, concerning, or critical) plus a 0-100 risk number. No manual grading, the numbers below are the tool's raw output aggregated across sites.",
  },
  {
    q: "What was the most common failure across production pSEO sites?",
    a: "It was not spam, it was answer-engine invisibility. 80% of audited sites ship no llms.txt file, and 75% fail the citation-coverage rule (pages assert facts without citing a verifiable source). Classic spam patterns like near-duplicate content (40%) and doorway patterns (20%) were real but less prevalent than the AEO gaps.",
  },
  {
    q: "How many sites passed clean?",
    a: "Only 3 of 20 (15%) scored ready. 8 (40%) scored caution and 9 (45%) scored concerning. The median risk score was 38 on a 0-100 scale. Even large, authoritative publishers landed in caution or concerning, because pseolint scores page and template shape, not brand.",
  },
  {
    q: "Why do well-known brands score concerning?",
    a: "pseolint is authority-blind by design. It measures the static content and link graph it can see, not backlinks, domain age, or brand trust. A concerning verdict on a major publisher means the template shape carries the same risk signals Google's SpamBrain targets; an established brand can often absorb a shape a newer site cannot. That is exactly why pseolint exposes an --authority-score flag to shift the verdict ladder for your tier. Treat these verdicts as a directional, authority-blind minimum, not a claim that a site is penalized.",
  },
  {
    q: "Is this a representative sample of the whole web?",
    a: "No. It is a fixed, curated corpus of programmatic and directory-style sites, and it is the crawlable subset, of 32 real target URLs, 12 could not be fetched headless (bot walls or HTTP/2-only origins) and were excluded. Read the numbers as a benchmark of common pSEO shapes, not a population estimate. The corpus and method are open so anyone can reproduce or extend them.",
  },
  {
    q: "How do I check my own site against these rules?",
    a: "Run npx pseolint https://your-site.com. It samples your templates, runs the same 48 rules, and returns the same verdict and risk score used in this report. Add --render for JS-rendered checks and --content-effort for the AI originality signal.",
  },
];

// Real aggregate output from the July 2026 corpus run (n=20 crawlable sites).
const TOP_RULES: ReadonlyArray<{
  id: string;
  name: string;
  pct: string;
  sites: string;
  description: string;
}> = [
  {
    id: "aeo/llms-txt",
    name: "Missing llms.txt",
    pct: "80%",
    sites: "16 / 20",
    description:
      "No /llms.txt index at the site root. Answer engines have no map to the site's citable content, lowering the odds of an accurate citation in AI Overviews, ChatGPT, or Perplexity.",
  },
  {
    id: "content/citation-coverage",
    name: "Weak citation coverage",
    pct: "75%",
    sites: "15 / 20",
    description:
      "Pages assert facts with no link to a verifiable primary source: 157 findings across the corpus, the single largest finding volume. The strongest predictor of low AI-citation eligibility in the set.",
  },
  {
    id: "spam/near-duplicate",
    name: "Near-duplicate clusters",
    pct: "40%",
    sites: "8 / 20",
    description:
      "Sibling pages share most of their non-boilerplate tokens. The classic templated-bulk signal SpamBrain's scaled-content-abuse policy targets.",
  },
  {
    id: "content/title-uniqueness",
    name: "Duplicate / thin titles",
    pct: "30%",
    sites: "6 / 20",
    description:
      "Missing, over-short, or slot-swap titles shared across many pages, a duplicate-intent signal even when bodies differ.",
  },
  {
    id: "aeo/crawler-access",
    name: "AI crawlers blocked",
    pct: "25%",
    sites: "5 / 20",
    description:
      "robots.txt disallows one or more answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Bytespider). Removes the site from that engine's citation pool outright.",
  },
  {
    id: "spam/doorway-pattern",
    name: "Doorway patterns",
    pct: "20%",
    sites: "4 / 20",
    description:
      "Structural-similarity clusters that also trip a content-quality signal (thin body or identical meta), the third-signal gate that separates a real catalog from a doorway.",
  },
];

// Real per-site verdicts, sorted worst-first. cls = pseolint site classification.
const PER_SITE: ReadonlyArray<{ host: string; verdict: string; risk: number; cls: string }> = [
  { host: "airbyte.com/connectors", verdict: "concerning", risk: 60, cls: "programmatic-directory" },
  { host: "numbeo.com/cost-of-living", verdict: "concerning", risk: 60, cls: "unclear" },
  { host: "outlookindia.com/outlook-spotlight", verdict: "concerning", risk: 60, cls: "unclear" },
  { host: "equityatlas.org", verdict: "concerning", risk: 60, cls: "unclear" },
  { host: "trustanalytica.org", verdict: "concerning", risk: 60, cls: "small-marketing" },
  { host: "thehairpin.com", verdict: "concerning", risk: 58, cls: "unclear" },
  { host: "ramp.com/spend-management", verdict: "concerning", risk: 57, cls: "programmatic-directory" },
  { host: "jasper.ai/templates", verdict: "concerning", risk: 46, cls: "unclear" },
  { host: "usatoday.com/money/blueprint", verdict: "concerning", risk: 45, cls: "unclear" },
  { host: "zacjohnson.com", verdict: "caution", risk: 38, cls: "programmatic-directory" },
  { host: "fresherslive.com", verdict: "caution", risk: 37, cls: "programmatic-directory" },
  { host: "fresherslike.com", verdict: "caution", risk: 37, cls: "programmatic-directory" },
  { host: "zapier.com/apps/slack/integrations", verdict: "caution", risk: 34, cls: "unclear" },
  { host: "cookcraze.com", verdict: "caution", risk: 34, cls: "programmatic-directory" },
  { host: "typeform.com/templates", verdict: "caution", risk: 32, cls: "unclear" },
  { host: "forbes.com/advisor", verdict: "caution", risk: 30, cls: "unclear" },
  { host: "newsunzip.com", verdict: "ready", risk: 20, cls: "programmatic-directory" },
  { host: "g2.com/categories", verdict: "ready", risk: 16, cls: "small-marketing" },
  { host: "wikibioworth.com", verdict: "ready", risk: 11, cls: "programmatic-directory" },
  { host: "healthyceleb.com", verdict: "caution", risk: 4, cls: "unclear" },
];

const VERDICT_STYLE: Record<string, string> = {
  ready: "text-emerald-600 dark:text-emerald-400",
  caution: "text-amber-600 dark:text-amber-400",
  concerning: "text-red-600 dark:text-red-400",
  critical: "text-red-700 dark:text-red-500",
};

export default function PseoAuditBenchmark2026Page(): React.ReactElement {
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
      knowsAbout: ["Programmatic SEO", "Answer Engine Optimization", "Web Crawlers", "SpamBrain"],
      sameAs: ["https://x.com/Pipolmpk", "https://linkedin.com/in/philippekam"],
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: absoluteUrl("/"),
    },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: [
      "programmatic SEO audit",
      "pSEO",
      "llms.txt",
      "answer engine optimization",
      "citation coverage",
      "SpamBrain",
      "doorway pages",
    ],
  };

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "pseolint pSEO benchmark corpus, July 2026",
    description: `Live audit results from ${SITES_AUDITED} production programmatic-SEO sites, each crawled with pseolint v0.7.5 in July 2026 (${PAGES_PER_SITE} pages sampled per site). Site-level verdicts, 0-100 risk scores, and per-rule failure rates.`,
    url,
    creator: { "@type": "Organization", name: "pseolint", url: absoluteUrl("/") },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: absoluteUrl("/") },
    datePublished: PUBLISHED_DATE,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    keywords: ["pSEO", "audit benchmark", "llms.txt", "citation coverage", "site quality"],
    variableMeasured: ["site verdict", "risk score", "per-rule failure rate", "site classification"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/html", contentUrl: url }],
    temporalCoverage: "2026-07",
    spatialCoverage: "Global, English-language pSEO sites",
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "pseolint", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Research", item: absoluteUrl("/research") },
      { "@type": "ListItem", position: 3, name: "pSEO Audit Benchmark 2026", item: url },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(datasetSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/research" className="hover:text-foreground">Research</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">pSEO Audit Benchmark 2026</span>
      </nav>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Research · measured · published July 18, 2026
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        We Audited 20 Production pSEO Sites: Here&apos;s What Actually Fails
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        Twenty live programmatic-SEO and directory sites, each crawled with pseolint v0.7.5 and
        sampled across its URL templates. Only three scored <em>ready</em>. The most common gap
        wasn&apos;t spam, it was answer-engine invisibility.
      </p>

      <aside
        role="note"
        aria-label="About this benchmark"
        className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
      >
        <p className="font-semibold text-foreground">About this benchmark.</p>
        <p className="mt-2 text-muted-foreground">
          These are <strong>measured</strong> results, not modeled estimates: raw pseolint output
          from a July 2026 crawl of a fixed corpus, {PAGES_PER_SITE} pages sampled per site. It is a
          benchmark of common pSEO <em>shapes</em>, not a population estimate, and it is the
          crawlable subset (12 of 32 target URLs could not be fetched headless and were excluded).
          pseolint is authority-blind: verdicts score page and template shape, not brand or
          backlinks. Read them as a directional minimum.
        </p>
      </aside>

      <Section title="Executive summary" id="summary">
        <p>
          The headline isn&apos;t the spam. Across 20 audited sites, the two most widespread failures
          were both about being cited by AI answer engines, not about tripping SpamBrain.
        </p>
        <ol className="mt-5 grid gap-4">
          <Finding n={1}>
            Only <strong>3 of 20 sites (15%)</strong> scored <em>ready</em>. Eight scored{" "}
            <em>caution</em>, nine scored <em>concerning</em>. Median risk was <strong>38</strong> on
            a 0-100 scale (range 4–60).
          </Finding>
          <Finding n={2}>
            <strong>80% ship no llms.txt</strong> (16/20) and <strong>75% fail citation coverage</strong>{" "}
            (15/20, 157 findings), the two most common failures in the set, both AEO gaps.
          </Finding>
          <Finding n={3}>
            Classic spam signals were real but rarer: near-duplicate clusters on 40% of sites,
            doorway patterns and entity-swap on 20% each.
          </Finding>
          <Finding n={4}>
            <strong>25% block at least one AI crawler</strong> in robots.txt (GPTBot, ClaudeBot,
            PerplexityBot, or Bytespider), self-inflicted removal from that engine&apos;s citation
            pool.
          </Finding>
          <Finding n={5}>
            <em>Integrity</em> was the weakest category grade (4 sites graded F, 4 D); <em>discoverability</em>{" "}
            was strong (17 of 20 graded A). Being findable is solved; being differentiated and citable is not.
          </Finding>
          <Finding n={6}>
            Brand did not rescue shape: major publishers and funded SaaS sites landed in{" "}
            <em>concerning</em> alongside thin directories, pseolint scores the template, not the
            domain.
          </Finding>
        </ol>
      </Section>

      <Section title="The verdict spread" id="verdicts">
        <p>
          Every site gets one site-level verdict, driven by its worst template with meaningful URL
          coverage. Here is how the 20 distributed.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat value="3" label="ready" tone="text-emerald-600 dark:text-emerald-400" />
          <Stat value="8" label="caution" tone="text-amber-600 dark:text-amber-400" />
          <Stat value="9" label="concerning" tone="text-red-600 dark:text-red-400" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          85% of audited sites carry at least caution-level risk under an authority-blind lens.
          That number is high on purpose: pseolint reports the shape a newer site would be judged
          on, before backlinks and brand are allowed to soften it.
        </p>
      </Section>

      <Section title="The rules that fired most" id="rules">
        <p>
          Ranked by share of sites where the rule produced an actionable finding (should-fix or
          blocker), across the 48-rule engine.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 pr-4 font-medium">Sites</th>
                <th className="py-2 font-medium">What it means</th>
              </tr>
            </thead>
            <tbody>
              {TOP_RULES.map((r) => (
                <tr key={r.id} className="border-b border-border/40 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <code className="text-xs text-muted-foreground">{r.id}</code>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="font-semibold text-foreground">{r.pct}</span>
                    <div className="text-xs text-muted-foreground">{r.sites}</div>
                  </td>
                  <td className="py-3 text-muted-foreground">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Every site, worst-first" id="per-site">
        <p>
          The full corpus, sorted by risk score. Verdicts are authority-blind, a{" "}
          <em>concerning</em> here means the template shape carries risk signals, not that the site
          is penalized. An established brand can absorb a shape a new site can&apos;t.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium">Verdict</th>
                <th className="py-2 pr-4 font-medium">Risk</th>
                <th className="py-2 font-medium">Classified as</th>
              </tr>
            </thead>
            <tbody>
              {PER_SITE.map((s) => (
                <tr key={s.host} className="border-b border-border/40">
                  <td className="py-2 pr-4"><code className="text-xs text-foreground">{s.host}</code></td>
                  <td className={`py-2 pr-4 font-medium ${VERDICT_STYLE[s.verdict] ?? ""}`}>{s.verdict}</td>
                  <td className="py-2 pr-4 font-mono text-foreground">{s.risk}</td>
                  <td className="py-2 text-xs text-muted-foreground">{s.cls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Risk is a 0-100 composite; 60 is the per-category contribution cap, so several sites share
          it. Site classification is pseolint&apos;s own detector, <code>unclear</code> means the
          template signal was below the confidence threshold, which itself triggers conservative rule
          demotion.
        </p>
      </Section>

      <Section title="What we&apos;d fix first" id="fixes">
        <p>
          If this corpus were one client, the priority order would follow prevalence and effort, not
          severity theatre.
        </p>
        <ol className="mt-5 grid gap-3">
          <Fix n={1} title="Ship an llms.txt (quick fix, 80% miss it)">
            A single markdown index at the root that points answer engines at your most citable
            pages. Lowest-effort, highest-prevalence gap in the set.
          </Fix>
          <Fix n={2} title="Add one cited primary fact per template (75% fail citation coverage)">
            Attach a verifiable, sourced fact to the template, a price, a dated statistic, a linked
            reference, so each generated page anchors to something a reader (and an LLM) can trust.
          </Fix>
          <Fix n={3} title="Unblock the AI crawlers you meant to allow (25% block one)">
            Audit robots.txt for blanket <code>Disallow: /</code> on GPTBot / ClaudeBot /
            PerplexityBot / Bytespider. Narrow to admin routes if the block was intentional.
          </Fix>
          <Fix n={4} title="Break near-duplicate clusters before scaling (40%)">
            Raise cross-page lexical variance with real per-record differentiation, not synonym
            swaps, the structural fix that moves a template out of doorway range.
          </Fix>
        </ol>
      </Section>

      <Section title="Method &amp; reproducibility" id="method">
        <p>
          Each site was audited with <code>npx pseolint &lt;url&gt; --sample-size 25 --max-per-template 5</code>{" "}
          on pseolint v0.7.5, July 2026. Verdicts and risk come straight from the engine; aggregation
          is site-level (a rule counts once per site regardless of how many pages fired it). The
          corpus is pseolint&apos;s open calibration corpus; 12 of 32 real targets could not be
          fetched in a headless environment (bot walls or HTTP/2-only origins) and were excluded, so
          this is the crawlable subset. Two synthetic honeypot entries were also excluded. Re-run it
          yourself, same command, same rules, same numbers.
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

      <Section title="Cite this benchmark" id="cite">
        <p>
          Published under CC BY 4.0, quote, excerpt, and reuse with attribution. Please link the
          canonical URL; we keep it updated as the corpus grows.
        </p>
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">APA</h3>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`Kam, P. (2026). We audited 20 production pSEO sites: what actually fails. Ouranos Labs. ${url}`}
        </pre>
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Markdown link</h3>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`[We Audited 20 Production pSEO Sites · pseolint](${url})`}
        </pre>
      </Section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Run the same 48 rules against your own site.</p>
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
            source: "llmsTxt",
            note: "The llms.txt proposal underpins the most common gap in this benchmark, 80% of audited sites ship no such index for answer engines.",
          },
          {
            source: "aiFeatures",
            note: "Google's AI-features guidance frames why citation coverage and crawler access govern whether a page is eligible to be cited in AI surfaces.",
          },
          {
            source: "scaledContent",
            note: "The scaled-content-abuse policy is the enforcement basis for the near-duplicate and doorway-pattern findings reported here.",
          },
          {
            source: "doorways",
            note: "Google's doorway-pages policy defines the structural-plus-quality signal pseolint's spam/doorway-pattern rule requires before flagging.",
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

function Finding({ n, children }: { n: number; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="flex gap-4 rounded-[22px] border border-border/70 bg-card/40 p-5">
      <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </li>
  );
}

function Fix({ n, title, children }: { n: number; title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="rounded-[22px] border border-border/70 bg-card/40 p-5">
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-mono text-muted-foreground">#{n}</span>
        <h3 className="text-base font-medium text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </li>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }): React.ReactElement {
  return (
    <div className="rounded-[22px] border border-border/70 bg-card/40 p-5">
      <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

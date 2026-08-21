import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const PUBLISHED_DATE = "2026-07-18";
const REPORT_PATH = "/research/llms-txt-programmatic-seo";
const REPORT_TITLE = "llms.txt for Programmatic Sites: The AEO Index 80% of Sites Skip";
// Short title tag: not a length rule (Google documents none), just a
// specific name that survives SERP cropping. See docs/folklore.md #2.
const REPORT_TITLE_TAG = "llms.txt for Programmatic Sites · pseolint";
const REPORT_DESCRIPTION =
  "In a 20-site benchmark, 80% of production pSEO sites shipped no llms.txt. It is the widest, lowest-effort answer-engine gap on the web. What the file is, what goes in it, and how to verify yours.";

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
          alt: "llms.txt for programmatic sites, an AEO guide from pseolint",
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
    q: "What is llms.txt?",
    a: "It is a plain markdown file at the root of your site (yoursite.com/llms.txt) that gives large language models a curated map of your most citable content. Think of it as a table of contents written for an AI reader: a short description of the site, then grouped links with one-line summaries. It is not robots.txt, which controls crawler access. llms.txt does the opposite job, it invites and guides.",
  },
  {
    q: "Does llms.txt actually affect whether I get cited?",
    a: "It is a proposed standard, not a ranking factor Google has confirmed, so treat it as an eligibility and efficiency signal rather than a guaranteed boost. Providing a clean index lowers the compute cost for a model to find and quote your content, and it points the model at the pages you want quoted instead of leaving it to guess. On a large programmatic site, where the citable pages are a small fraction of the total, that guidance is the whole point.",
  },
  {
    q: "Why does it matter more for programmatic sites?",
    a: "A programmatic site can publish tens of thousands of templated pages. An answer engine has no cheap way to tell which of those pages carry the citable facts and which are near-identical filler. llms.txt is where you say it explicitly: here are the 40 pages worth quoting, grouped and described. Without it, the model either skips the site or cites a page you did not intend.",
  },
  {
    q: "Is llms.txt the same as blocking or allowing AI crawlers?",
    a: "No, and the two are frequently in contradiction. In the same 20-site benchmark, 25% of sites blocked at least one AI crawler in robots.txt. Shipping an llms.txt while your robots.txt disallows GPTBot, ClaudeBot, or PerplexityBot cancels the effort: the model that reads your index cannot fetch the pages it points to. Fix crawler access first, then publish the index.",
  },
  {
    q: "What is the difference between llms.txt and llms-full.txt?",
    a: "llms.txt is the concise index of links and summaries. llms-full.txt is an optional companion that inlines the full text of those pages into one file, so a model can ingest your key content without following every link. Ship llms.txt first; add llms-full.txt only if your citable content is stable enough that a flattened snapshot will not go stale quickly.",
  },
  {
    q: "How do I check my llms.txt is valid and complete?",
    a: "Run npx pseolint https://your-site.com. The aeo/llms-txt rule checks for the file's presence and basic structure, and aeo/crawler-access flags any AI crawler you are blocking in robots.txt, so you catch the contradiction in the same pass. If both are clean, your citable pages are both reachable and mapped.",
  },
];

const CONTENTS: ReadonlyArray<{ part: string; detail: string }> = [
  {
    part: "An H1 title and a blockquote summary",
    detail:
      "The first line is # Your Site Name. Follow it with a > blockquote of one or two sentences saying what the site is and who it serves. This is the context a model reads before anything else.",
  },
  {
    part: "Grouped links with one-line descriptions",
    detail:
      "Use ## headings to group your citable pages (for example: ## Guides, ## Data, ## Reference). Under each, a markdown list of links, and after each link a short description of what a reader gets there. Descriptions are not optional filler; they are how the model decides what to quote.",
  },
  {
    part: "Only pages worth citing",
    detail:
      "This is the discipline programmatic sites miss. Do not dump your sitemap. Include the pages that carry a verifiable, quotable fact, and leave the templated long tail out. A short, high-signal index beats an exhaustive one.",
  },
  {
    part: "An optional ## Optional section",
    detail:
      "A convention for links a model can skip if it is short on context: secondary references, deep-dive pages. It tells the model what to drop first, which is useful when your citable set is large.",
  },
];

export default function LlmsTxtProgrammaticSeoPage(): React.ReactElement {
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
      knowsAbout: ["Answer Engine Optimization", "llms.txt", "Programmatic SEO", "AI Search"],
      sameAs: ["https://x.com/Pipolmpk", "https://linkedin.com/in/philippekam"],
    },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: absoluteUrl("/") },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: [
      "llms.txt",
      "answer engine optimization",
      "AI search optimization",
      "programmatic SEO",
      "AI citations",
      "GEO",
    ],
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to write an llms.txt for a programmatic site",
    description:
      "Create a root llms.txt that maps an answer engine to your citable content in four steps.",
    step: CONTENTS.map((c, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: c.part,
      text: c.detail,
    })),
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
      { "@type": "ListItem", position: 3, name: "llms.txt for Programmatic Sites", item: url },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(howToSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/research" className="hover:text-foreground">Research</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">llms.txt for Programmatic Sites</span>
      </nav>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Guide · updated July 18, 2026
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        llms.txt for Programmatic Sites: The AEO Index 80% of Sites Skip
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        In a July 2026 pseolint crawl of 20 production programmatic-SEO sites, four in five shipped
        no llms.txt at all. It is the single most common answer-engine gap in the wild, and also the
        cheapest to close. Here is what the file is, what belongs in it, and how to verify yours.
      </p>

      <aside
        role="note"
        aria-label="Key takeaway"
        className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
      >
        <p className="font-semibold text-foreground">The one-sentence version.</p>
        <p className="mt-2 text-muted-foreground">
          llms.txt is a root markdown file that hands an answer engine a curated map of your citable
          pages. On a programmatic site, where the pages worth quoting are a thin slice of the total,
          that map is the difference between being cited and being skipped.
        </p>
      </aside>

      <Section title="What llms.txt is (and is not)" id="what">
        <p>
          llms.txt is a proposed standard: a plain markdown file served at{" "}
          <code>yoursite.com/llms.txt</code> that describes your site and links to the content most
          worth reading, each link annotated with a one-line summary. It is written for a machine
          reader, so it is concise and structured rather than designed to look good in a browser.
        </p>
        <p className="mt-4">
          It is often confused with robots.txt. They are opposites. robots.txt tells crawlers what
          they may not touch. llms.txt tells an AI reader what is worth reading and why. One gates
          access; the other guides attention. You need both pointing the same direction, which many
          sites fail to do.
        </p>
      </Section>

      <Section title="Why programmatic sites need it most" id="why">
        <p>
          A hand-built site with 30 pages does not really need a map; a model can read the whole
          thing. A programmatic site with 30,000 templated pages is a different problem. The facts
          worth quoting live on a small fraction of those pages, and an answer engine has no cheap
          way to find them. It will either give up on the site or quote a page you never meant to
          surface.
        </p>
        <p className="mt-4">
          llms.txt is where you resolve that ambiguity by hand. You name the citable pages, group
          them, and describe them, so the model spends its limited attention on your best content
          instead of your template chrome. Every other AEO gap in our{" "}
          <Link href="/research/pseo-audit-benchmark-2026" className="text-primary hover:underline">
            20-site benchmark
          </Link>{" "}
          (weak citation coverage on 75% of sites, blocked crawlers on 25%) compounds when the model
          cannot even locate your good pages first.
        </p>
      </Section>

      <Section title="What goes in a good llms.txt" id="contents">
        <p>The format is deliberately simple. Four parts, in order.</p>
        <ol className="mt-5 grid gap-3">
          {CONTENTS.map((c, i) => (
            <li key={c.part} className="rounded-[22px] border border-border/70 bg-card/40 p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                <h3 className="text-base font-medium text-foreground">{c.part}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-muted-foreground">A minimal example:</p>
        <pre className="mt-2 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`# Acme Integrations

> Acme connects 400+ SaaS tools. This index lists our
> most citable integration guides and data pages.

## Guides
- [Slack + Acme setup](/guides/slack): step-by-step, with rate limits and scopes.
- [Webhook reference](/guides/webhooks): payload schemas and retry behavior.

## Data
- [Integration uptime report](/data/uptime): monthly, per-connector, sourced.

## Optional
- [Changelog](/changelog): release history for context.`}
        </pre>
      </Section>

      <Section title="The mistake that cancels the whole thing" id="mistake">
        <p>
          The most common failure is not a malformed file. It is shipping a clean llms.txt while
          robots.txt blocks the very crawlers meant to read it. In the benchmark, a quarter of sites
          disallowed at least one answer-engine crawler. If your robots.txt carries a blanket{" "}
          <code>Disallow: /</code> for GPTBot, ClaudeBot, PerplexityBot, or Bytespider, the model
          that reads your index cannot fetch the pages it points to, and the index is decoration.
        </p>
        <p className="mt-4">
          Fix the access first. Confirm the crawlers you want to cite you are allowed, then publish
          the index that tells them where to look. Order matters.
        </p>
      </Section>

      <Section title="Verify it in one command" id="verify">
        <p>Both halves of this, the index and the access, are checked in a single audit.</p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`npx pseolint https://your-site.com`}
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">
          <code>aeo/llms-txt</code> reports whether the file exists and is structured, and{" "}
          <code>aeo/crawler-access</code> flags any AI crawler you are blocking in robots.txt. Green
          on both means your citable pages are reachable and mapped, which is the whole job.
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

      <Section title="Cite this guide" id="cite">
        <p>Published under CC BY 4.0. Quote and reuse with attribution to the canonical URL.</p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`Kam, P. (2026). llms.txt for programmatic sites: the AEO index 80% of sites skip. Ouranos Labs. ${url}`}
        </pre>
      </Section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Check whether your site is mapped for answer engines.</p>
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
            note: "The llms.txt proposal defines the file format and intent this guide operationalizes for programmatic sites.",
          },
          {
            source: "aiFeatures",
            note: "Google's AI-features guidance frames why reachable, well-structured content governs eligibility for citation in AI surfaces.",
          },
          {
            source: "robotsIntro",
            note: "The robots.txt reference underpins the crawler-access fix that must precede publishing an llms.txt.",
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

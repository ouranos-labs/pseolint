import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const PUBLISHED_DATE = "2026-07-18";
const REPORT_PATH = "/research/programmatic-seo-vs-doorway-pages";
const REPORT_TITLE = "Programmatic SEO vs. Doorway Pages: How to Survive a SpamBrain Pass";
// Short title tag: not a length rule (Google documents none), just a
// specific name that survives SERP cropping. See docs/folklore.md #2.
const REPORT_TITLE_TAG = "Programmatic SEO vs. Doorway Pages · pseolint";
const REPORT_DESCRIPTION =
  "The line between a programmatic catalog that ranks and a doorway that gets deindexed isn't scale, it's three specific signals. How SpamBrain draws it, and the exact checks that tell you which side you're on.";

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
          alt: "Programmatic SEO vs. doorway pages · pseolint",
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
    q: "Are programmatic SEO pages the same as doorway pages?",
    a: "No. Programmatic SEO generates many pages from a dataset and a shared template, one page per city, integration, or currency pair. That is legitimate when each page carries unique, useful, per-record value. A doorway page is a thin gateway created only to rank, offering the visitor nothing they couldn't get faster elsewhere. The pages can look structurally identical; what separates them is whether the per-record content actually differs and helps.",
  },
  {
    q: "Does Google penalize a site just for having thousands of similar pages?",
    a: "Not for the count itself. Zapier's app-integration pages, Wise's currency-converter pages, and G2's category pages are all near-duplicate by design and rank fine, because each record has unique body text and a unique meta description. Scale is not the trigger. Degeneration is. When the per-record content collapses to a keyword swap over identical boilerplate, SpamBrain's scaled-content-abuse policy applies.",
  },
  {
    q: "What exactly turns a template cluster into a doorway in pseolint?",
    a: "pseolint requires three signals to co-occur before it calls a cluster a doorway, not one. A pair of pages must be (1) near-duplicate, (2) entity-swap (differing only by a swapped entity like a city or product name), AND (3) show a content-quality failure: thin body OR an identical meta description. Structural similarity alone never converts to a doorway finding, because real catalogs share it too. Only when the per-record content also degenerates does the spam/doorway-pattern rule fire.",
  },
  {
    q: "How do I know if my programmatic pages are at risk right now?",
    a: "Run npx pseolint https://your-site.com. It clusters your URLs into templates, samples pages from each, and reports spam/near-duplicate, spam/entity-swap, spam/thin-content, and spam/doorway-pattern with a per-template verdict. If doorway-pattern fires, at least one template is degenerating on all three signals. If only near-duplicate and entity-swap fire, you have a catalog shape, differentiate the body before you scale it further.",
  },
  {
    q: "What is the single most effective fix?",
    a: "Add one verifiable, per-record fact to the template that a reader could not get elsewhere, a real price, a dated statistic, a parsed regulation, an aggregated metric. That single change moves more pages out of the doorway band than any other intervention, because it simultaneously breaks near-duplication, defeats the entity-swap signal, and clears the thin-content gate.",
  },
  {
    q: "Do doorway pages still work in 2026?",
    a: "No. Since the March 2024 core update folded scaled content abuse into the main spam policy, the enforcement is silent and algorithmic, SpamBrain demotes or deindexes without a manual action, so there is often no warning in Search Console. In a July 2026 pseolint benchmark of 20 production pSEO sites, 20% still tripped the doorway-pattern rule and 40% carried near-duplicate clusters, meaning many are one content-quality slip away from it.",
  },
];

const SIGNALS: ReadonlyArray<{ n: number; rule: string; name: string; detail: string }> = [
  {
    n: 1,
    rule: "spam/near-duplicate",
    name: "Near-duplicate body",
    detail:
      "Two sibling pages share most of their non-boilerplate tokens. On its own this is just a template, every catalog on the web trips it. Necessary for a doorway, nowhere near sufficient.",
  },
  {
    n: 2,
    rule: "spam/entity-swap",
    name: "Entity-swap",
    detail:
      "The pages differ only by a swapped entity, a city, a product, a currency. Still not a doorway: Wise's USD→EUR and USD→GBP pages are entity-swaps of each other and rank fine, because the numbers underneath are real and different.",
  },
  {
    n: 3,
    rule: "spam/thin-content · content/meta-uniqueness",
    name: "Content-quality collapse",
    detail:
      "The third signal is the one that converts. A thin body (little unique content once template chrome is subtracted) OR an identical meta description across the cluster. Real catalogs have unique per-record bodies and metas; doorways degenerate on at least one. Only when signal 3 joins 1 and 2 does spam/doorway-pattern fire.",
  },
];

export default function ProgrammaticSeoVsDoorwayPagesPage(): React.ReactElement {
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
      knowsAbout: ["Programmatic SEO", "Doorway Pages", "SpamBrain", "Google Spam Policies"],
      sameAs: ["https://x.com/Pipolmpk", "https://linkedin.com/in/philippekam"],
    },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: absoluteUrl("/") },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    keywords: [
      "programmatic SEO",
      "doorway pages",
      "SpamBrain",
      "scaled content abuse",
      "near-duplicate content",
      "entity swap",
      "Google spam policy",
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
      { "@type": "ListItem", position: 3, name: "Programmatic SEO vs. Doorway Pages", item: url },
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
        <span className="text-foreground">Programmatic SEO vs. Doorway Pages</span>
      </nav>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Guide · updated July 18, 2026
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Programmatic SEO vs. Doorway Pages: How to Survive a SpamBrain Pass
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        The line between a programmatic catalog that ranks and a doorway that gets deindexed is not
        scale. Zapier ships tens of thousands of near-identical pages and ranks; a 200-page city
        grid gets wiped. The difference is three specific signals. Here is exactly where the line
        sits, and how to check which side you&apos;re on.
      </p>

      <aside
        role="note"
        aria-label="Key takeaway"
        className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
      >
        <p className="font-semibold text-foreground">The one-sentence version.</p>
        <p className="mt-2 text-muted-foreground">
          Google does not penalize similar pages, it penalizes <em>degenerate</em> ones. A cluster
          becomes a doorway only when near-duplicate structure and entity-swap variation are joined
          by a content-quality collapse (thin body or identical meta). Two of three is a catalog.
          Three of three is a doorway.
        </p>
      </aside>

      <Section title="Why scale is not the trigger" id="scale">
        <p>
          The instinct after every spam update is to assume Google is hunting large page counts. It
          is not. Search&apos;s own guidance draws the line at intent and value, not volume: pages
          built primarily to rank, that funnel users somewhere else without serving them, are
          doorways regardless of count. Pages built from a real dataset that answer a real query are
          fine regardless of count.
        </p>
        <p className="mt-4">
          The proof is in what ranks. Zapier&apos;s per-integration pages, Wise&apos;s currency-pair
          pages, and G2&apos;s category pages are all near-duplicate <em>and</em> entity-swap by
          design, the two signals people assume define a doorway. They rank because the third
          signal never fires: each record carries unique body content and a unique meta description.
          The numbers, the descriptions, the specifics differ per record.
        </p>
      </Section>

      <Section title="The three signals SpamBrain actually stacks" id="signals">
        <p>
          pseolint encodes the bright line as a co-occurrence gate. Its <code>spam/doorway-pattern</code>{" "}
          rule refuses to fire on structural similarity alone, it requires all three of these to
          land on the same cluster:
        </p>
        <ol className="mt-5 grid gap-3">
          {SIGNALS.map((s) => (
            <li key={s.n} className="rounded-[22px] border border-border/70 bg-card/40 p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-mono text-muted-foreground">Signal {s.n}</span>
                <h3 className="text-base font-medium text-foreground">{s.name}</h3>
              </div>
              <code className="mt-1 block text-xs text-muted-foreground">{s.rule}</code>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-muted-foreground">
          This gate is not a guess, it&apos;s a calibration finding. An earlier, looser version fired
          on every catalog pair and produced hundreds of false doorway findings on sites that ship in
          production and rank. Requiring the content-quality signal is what makes the verdict match
          reality.
        </p>
      </Section>

      <Section title="What this looks like in the wild" id="benchmark">
        <p>
          In a July 2026 pseolint crawl of 20 production programmatic-SEO sites, the signals separated
          cleanly. Near-duplicate structure was everywhere; full doorway degeneration was not.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat value="40%" label="near-duplicate clusters" />
          <Stat value="20%" label="entity-swap" />
          <Stat value="20%" label="doorway-pattern (all 3)" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Read that as: many sites carry the catalog shape (signals 1–2), and a meaningful minority
          have already crossed into doorway territory by adding the content-quality collapse. The gap
          between the two is the safest, cheapest place to intervene. Full methodology and per-site
          results are in the{" "}
          <Link href="/research/pseo-audit-benchmark-2026" className="text-primary hover:underline">
            20-site benchmark
          </Link>
          .
        </p>
      </Section>

      <Section title="The self-test: catalog or doorway?" id="self-test">
        <p>Answer these for one template cluster on your site. Every &ldquo;yes&rdquo; below signal 2 moves you toward doorway.</p>
        <ol className="mt-5 grid gap-3">
          <Check label="Do sibling pages share most of their body text once nav/footer are removed?">
            Necessary but harmless alone, <code>spam/near-duplicate</code>. Every catalog says yes.
          </Check>
          <Check label="Do they differ only by a swapped entity (city, product, name)?">
            Still just a catalog, <code>spam/entity-swap</code>. Wise and Zapier both say yes here.
          </Check>
          <Check label="Is the unique per-record body thin once the template is subtracted?">
            This is the tipping point, <code>spam/thin-content</code>. A yes here converts the cluster.
          </Check>
          <Check label="Do the pages share an identical meta description?">
            The other converter, <code>content/meta-uniqueness</code>. A yes here also converts.
          </Check>
          <Check label="Could a visitor get everything on the page faster somewhere else?">
            The human version of the whole test. If yes, the page is a gateway, not a destination.
          </Check>
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Yes to the first two only: you have a catalog, safe, but differentiate before scaling. Yes
          to a third or fourth as well: <code>spam/doorway-pattern</code> will fire, and so will
          SpamBrain.
        </p>
      </Section>

      <Section title="How to survive the pass" id="fixes">
        <p>Ordered by leverage, the first fix defeats all three signals at once.</p>
        <ol className="mt-5 grid gap-3">
          <Fix n={1} title="Add one verifiable per-record fact to the template">
            A real price, a dated statistic, a parsed regulation, an aggregated metric, sourced from
            data you own or license. It breaks near-duplication, defeats entity-swap, and clears
            thin-content in a single move. The change most often skipped because it requires owning a
            dataset; also the one that works.
          </Fix>
          <Fix n={2} title="Give every record a unique meta description">
            Generate the meta from the record&apos;s own fields, not a static template string. Cheap,
            and it removes one of the two content-quality converters outright.
          </Fix>
          <Fix n={3} title="Raise cross-page lexical variance with real differentiation">
            Per-record FAQs, local statistics, expert notes, not synonym swaps, which SpamBrain reads
            straight through. The goal is genuinely different content, not obfuscated identical content.
          </Fix>
          <Fix n={4} title="Prune, don't just publish">
            noindex or de-publish records that attract no impressions in a defined window. A cluster
            of dead thin pages drags the whole template&apos;s score down; removing them is often a
            faster recovery than rewriting them.
          </Fix>
          <Fix n={5} title="Gate it in CI so it can't regress">
            Add <code>npx pseolint &lt;url&gt; --ci-threshold concerning</code> to your pipeline. Once
            a template is clean, this fails the build if a future change pushes it back toward the
            doorway band, before it ships, not after SpamBrain finds it.
          </Fix>
        </ol>
      </Section>

      <Section title="Run the check yourself" id="run">
        <p>Every claim in this guide maps to a rule you can run against your own site right now.</p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`npx pseolint https://your-site.com --sample-size 30 --max-per-template 5`}
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">
          It clusters your URLs into templates, samples each, and returns a per-template verdict with{" "}
          <code>spam/near-duplicate</code>, <code>spam/entity-swap</code>, <code>spam/thin-content</code>,
          and <code>spam/doorway-pattern</code> broken out, so you see exactly which of the three
          signals is firing, and on which template.
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
        <p>Published under CC BY 4.0, quote and reuse with attribution to the canonical URL.</p>
        <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/70 bg-card/60 p-4 text-xs leading-relaxed text-foreground">
{`Kam, P. (2026). Programmatic SEO vs. doorway pages: how to survive a SpamBrain pass. Ouranos Labs. ${url}`}
        </pre>
      </Section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Find out which side of the line your templates are on.</p>
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
            source: "doorways",
            note: "Google's doorway-pages policy defines the intent-and-value line this guide operationalizes as a three-signal gate.",
          },
          {
            source: "scaledContent",
            note: "The scaled-content-abuse policy, folded into the main spam policy in the March 2024 core update, is the enforcement mechanism behind SpamBrain's silent demotion of degenerate clusters.",
          },
          {
            source: "helpfulContent",
            note: "The helpful-content criteria, original, primary-source, user-first, map to the per-record-fact fix that clears all three doorway signals at once.",
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

function Check({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <li className="rounded-[22px] border border-border/70 bg-card/40 p-5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
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

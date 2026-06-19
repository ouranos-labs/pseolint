import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackView } from "@/lib/analytics/track-view";
import {
  MARKETING_RULES,
  findMarketingRule,
  getRelatedMarketingRules,
  type MarketingRule
} from "@/lib/marketing-rules";
import { env } from "@/lib/env";
import { InlineAuditWidget } from "@/components/marketing/inline-audit-widget";
import { SourcesSection } from "@/components/marketing/sources-section";
import { WorkedExampleSection } from "@/components/marketing/worked-example-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

function ruleUrl(slug: string): string {
  return `${SITE_URL.replace(/\/$/, "")}/rules/${slug}`;
}

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs are
 * compile-time-static here; the escape is cheap and defensive.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export function generateStaticParams(): Array<{ ruleId: string }> {
  return MARKETING_RULES.map((rule) => ({ ruleId: rule.slug }));
}

interface PageProps {
  params: Promise<{ ruleId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ruleId } = await params;
  const rule = findMarketingRule(ruleId);
  if (!rule) {
    return { title: "Rule not found · pseolint" };
  }
  const url = ruleUrl(rule.slug);
  return {
    title: `${rule.title} · pseolint`,
    description: rule.metaDescription,
    keywords: [rule.primaryKeyword, rule.ruleId, "SpamBrain", "programmatic SEO", "pSEO"],
    alternates: { canonical: url },
    openGraph: {
      title: rule.title,
      description: rule.metaDescription,
      type: "article",
      url,
      siteName: "pseolint",
      images: [`${SITE_URL}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: rule.title,
      description: rule.metaDescription
    }
  };
}

interface TechArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "TechArticle";
  headline: string;
  description: string;
  url: string;
  inLanguage: "en";
  about: { "@type": "Thing"; name: string };
  keywords: string[];
  isPartOf: { "@type": "WebSite"; name: "pseolint"; url: string };
  publisher: { "@type": "Organization"; name: "Ouranos Labs"; url: string };
  author: {
    "@type": "Person";
    name: string;
    jobTitle: string;
    knowsAbout: string[];
    sameAs: string[];
  };
}

interface FaqPageJsonLd {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
}

function buildArticleJsonLd(rule: MarketingRule): TechArticleJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: rule.title,
    description: rule.metaDescription,
    url: ruleUrl(rule.slug),
    inLanguage: "en",
    about: { "@type": "Thing", name: rule.primaryKeyword },
    keywords: [rule.primaryKeyword, rule.ruleId, "SpamBrain", "programmatic SEO"],
    isPartOf: { "@type": "WebSite", name: "pseolint", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: SITE_URL },
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Web Crawlers"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    }
  };
}

function buildFaqJsonLd(rule: MarketingRule): FaqPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: rule.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a }
    }))
  };
}

function getRuleArchetype(ruleId: string, slug: string): 'spam' | 'aeo' | 'tech' | 'links' | 'default' {
  if (ruleId.startsWith("spam/")) return 'spam';
  if (ruleId.startsWith("aeo/") || ruleId === "content/missing-author" || ruleId === "content/eeat-signals") return 'aeo';
  if (ruleId.startsWith("links/")) return 'links';
  if (
    ruleId.startsWith("tech/") ||
    ruleId.startsWith("schema/") ||
    ruleId.startsWith("cannibal/") ||
    slug.includes("meta") ||
    slug.includes("heading") ||
    slug.includes("title") ||
    slug.includes("alt-text") ||
    slug === "crawler-access" ||
    slug === "llms-txt"
  ) {
    return 'tech';
  }
  return 'default';
}

function getTechCodeSnippet(slug: string): string {
  if (slug === "llms-txt") {
    return `# llms.txt
# Directions for LLMs and crawler agents

## Main Section
- [pseolint](https://pseolint.dev): Learn about programmatic SEO audits.
- [Rules Reference](https://pseolint.dev/rules): Explainer guides for SpamBrain.`;
  }
  if (slug === "crawler-access") {
    return `// apps/web/src/app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: 'https://pseolint.dev/sitemap.xml',
  };
}`;
  }
  return `// next.config.js
module.exports = {
  reactStrictMode: true,
  // Custom headers for crawler optimization
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'index, follow' }
        ]
      }
    ];
  }
};`;
}

export default async function RulePage({ params }: PageProps) {
  const { ruleId } = await params;
  const rule = findMarketingRule(ruleId);
  if (!rule) {
    notFound();
  }

  const articleJsonLd = buildArticleJsonLd(rule);
  const faqJsonLd = buildFaqJsonLd(rule);
  const related = getRelatedMarketingRules(rule.relatedRules);
  const archetype = getRuleArchetype(rule.ruleId, rule.slug);

  const faqElement = (
    <Section title="Frequently asked questions">
      <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
        {rule.faqs.map((faq, index) => (
          <div
            key={`${rule.slug}-faq-${index}`}
            className="border-b border-border/60 px-5 py-5 last:border-b-0"
          >
            <dt className="text-sm font-semibold text-foreground">{faq.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <TrackView event={{ name: "rule_viewed", props: { ruleId: rule.ruleId } }} />
      <script
        type="application/ld+json"
        // Compile-time-static payload built from MARKETING_RULES; safeJsonLd
        // additionally escapes `<` so any string can't break out of <script>.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <Link href="/rules" className="transition-colors hover:text-foreground">
          Rule reference
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono normal-case tracking-normal text-muted-foreground">
          {rule.ruleId}
        </span>
      </div>

      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-[44px]"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        {rule.title}
      </h1>

      <p className="mt-4 max-w-2xl text-base text-foreground">{rule.oneLiner}</p>

      {/* Archetype B: Answer-First Structure FAQ render at the top */}
      {archetype === 'aeo' && (
        <div className="mt-8">
          {faqElement}
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href={`/tools/${rule.relatedTool}`}
          className="inline-flex h-11 items-center rounded-[14px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Test this rule on your site &rarr;
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[14px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Run a full audit
        </Link>
      </div>

      <div className="mt-10">
        <InlineAuditWidget
          headline={`Test your site for ${rule.title.toLowerCase()}`}
          cta="Run a SpamBrain check"
          ruleHint={`We'll surface findings tagged with \`${rule.ruleId}\`.`}
        />
      </div>

      {/* Archetype A: SpamBrain Policy Impact Alert */}
      {archetype === 'spam' && (
        <aside className="my-8 rounded-[22px] border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-foreground">
          <div className="flex gap-4">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-amber-500">SpamBrain Policy Enforcement Alert</h3>
              <p className="mt-2 text-muted-foreground">
                This pattern is a primary signal for Google's automated SpamBrain classifier. High densities of this pattern trigger site-wide helpfulness demotions that typically require a 90-day recovery window.
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                <li>Evaluated at the host and directory cluster level.</li>
                <li>Directly impacts indexing priority and soft-404 thresholds.</li>
                <li>Can escalate to manual action reviews.</li>
              </ul>
            </div>
          </div>
        </aside>
      )}

      {/* Archetype B: Generative Citation Checklist */}
      {archetype === 'aeo' && (
        <article className="mt-10 rounded-[22px] border border-border/80 bg-card/30 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Generative Citation Checklist</h3>
          <p className="mt-1.5 text-xs text-muted-foreground">Optimize your content to trigger Google AI Overviews and answer engine summaries:</p>
          <ul className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <input type="checkbox" readOnly checked className="mt-1 accent-primary" />
              <span className="text-sm text-foreground"><strong>Entity Grounding:</strong> Ensure the primary topic is declared with schema markup.</span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" readOnly checked className="mt-1 accent-primary" />
              <span className="text-sm text-foreground"><strong>Answer-First Format:</strong> Place direct answers (under 300 characters) in paragraph tags directly under headings.</span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" readOnly checked className="mt-1 accent-primary" />
              <span className="text-sm text-foreground"><strong>Authoritative Citations:</strong> Link to peer-reviewed sources or primary data sets to establish domain authority.</span>
            </li>
          </ul>
        </article>
      )}

      <Section title="What it detects">
        <Prose text={rule.whatItDetects} />
      </Section>

      <Section title="Why it matters">
        <Prose text={rule.whyItMatters} />
      </Section>

      {/* Archetype A fails/passes vs standard fails/passes */}
      {archetype === 'spam' ? (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Fail vs. Pass Comparison
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div data-example className="rounded-[18px] border border-destructive/30 bg-destructive/5 p-5">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">Failing Pattern</h4>
              <p className="text-sm leading-relaxed text-foreground">{rule.failingExample}</p>
            </div>
            <div data-example className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Passing Pattern</h4>
              <p className="text-sm leading-relaxed text-foreground">{rule.passingExample}</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <Section title="A page that fails">
            <div data-example className="rounded-[18px] border border-destructive/30 bg-destructive/5 p-5">
              <p className="text-sm leading-relaxed text-foreground">{rule.failingExample}</p>
            </div>
          </Section>

          <Section title="A page that passes">
            <div data-example className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
              <p className="text-sm leading-relaxed text-foreground">{rule.passingExample}</p>
            </div>
          </Section>
        </>
      )}

      {/* Archetype C: Technical Configuration Panel & CLI Debug */}
      {archetype === 'tech' && (
        <>
          <section className="mt-12 rounded-[22px] border border-border/70 bg-black/90 p-5 font-mono text-xs text-zinc-300">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <span className="text-zinc-500">📄 configuration-example.js</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <pre className="overflow-x-auto">
              <code>{getTechCodeSnippet(rule.slug)}</code>
            </pre>
          </section>

          <section className="mt-6 rounded-[18px] border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs">
            <p className="text-zinc-500"># Run local audit for this rule:</p>
            <div className="mt-2 flex items-center gap-2 text-primary">
              <span>$</span>
              <code className="text-foreground">npx pseolint --rule={rule.ruleId}</code>
            </div>
          </section>
        </>
      )}

      {/* Archetype D: Internal Link Architecture SVG and Anchor Text Table */}
      {archetype === 'links' && (
        <>
          <section className="mt-12 rounded-[22px] border border-border/60 bg-card/40 p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Internal Link Architecture</h3>
            <div className="flex justify-center py-4 bg-background/50 rounded-xl">
              <svg width="280" height="120" viewBox="0 0 280 120" className="text-foreground fill-none stroke-current stroke-2">
                <circle cx="50" cy="30" r="16" className="stroke-primary fill-primary/10" />
                <text x="50" y="34" className="stroke-none fill-foreground text-[10px] font-semibold text-center" textAnchor="middle">HUB</text>
                
                <circle cx="140" cy="30" r="16" className="stroke-primary fill-primary/10" />
                <text x="140" y="34" className="stroke-none fill-foreground text-[10px] font-semibold" textAnchor="middle">SILO</text>
                
                <circle cx="230" cy="30" r="16" className="stroke-muted fill-muted/10" />
                <text x="230" y="34" className="stroke-none fill-muted-foreground text-[10px] font-semibold" textAnchor="middle">ISLAND</text>
                
                <path d="M 66 30 L 124 30" className="stroke-primary" markerEnd="url(#arrow)" />
                <path d="M 156 30 L 214 30" className="stroke-destructive stroke-dashed" />
                <path d="M 140 46 L 140 84 C 140 94, 50 94, 50 46" className="stroke-primary" />
                
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary stroke-none" />
                  </marker>
                </defs>
              </svg>
            </div>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              A correctly structured link silo feeds authority to parent hubs while avoiding dead-end loops or orphan island pages.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recommended Anchor Text Distribution</h3>
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/60">
                    <th className="p-3 font-semibold text-foreground">Anchor Type</th>
                    <th className="p-3 font-semibold text-foreground">Optimal Ratio</th>
                    <th className="p-3 font-semibold text-foreground">Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="p-3 font-medium text-foreground">Exact Match Keyword</td>
                    <td className="p-3 text-muted-foreground">10% - 15%</td>
                    <td className="p-3 font-mono text-muted-foreground">"thin content SEO"</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="p-3 font-medium text-foreground">Partial Match / LSI</td>
                    <td className="p-3 text-muted-foreground">30% - 40%</td>
                    <td className="p-3 font-mono text-muted-foreground">"learn about doorway patterns"</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-foreground">Branded / Generative</td>
                    <td className="p-3 text-muted-foreground">Remaining</td>
                    <td className="p-3 font-mono text-muted-foreground">"pseolint platform"</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Section title="How to fix it">
        <ol className="space-y-3">
          {rule.howToFix.map((step, index) => (
            <li
              key={`${rule.slug}-fix-${index}`}
              className="flex gap-4 rounded-[18px] border border-border/60 bg-card/40 p-4"
            >
              <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 font-mono text-xs text-primary">
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="SpamBrain context">
        <Prose text={rule.spamBrainContext} />
      </Section>

      {/* Render FAQ here only if it wasn't rendered at the top */}
      {archetype !== 'aeo' && faqElement}

      <WorkedExampleSection title="How this shows up in practice" paragraphs={rule.extra ?? []} />

      <SourcesSection sources={rule.sources} />

      {related.length > 0 && (
        <Section title="Related rules">
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((sibling) => (
              <li key={sibling.slug}>
                <Link
                  href={`/rules/${sibling.slug}`}
                  className="group flex h-full flex-col rounded-[18px] border border-border/70 bg-card/40 p-5 transition-colors hover:border-primary/40 hover:bg-card/70"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {sibling.ruleId}
                  </span>
                  <span className="mt-2 text-sm font-medium text-foreground">
                    {sibling.title.split("—")[0]?.trim() ?? sibling.title}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">{sibling.oneLiner}</span>
                  <span className="mt-3 text-xs text-primary transition-transform group-hover:translate-x-0.5">
                    Read &rarr;
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p className="text-foreground">
          Want to know whether this rule actually fires on your site?
        </p>
        <p className="mt-2">
          Run pseolint against your sitemap. The audit is free, takes about a minute, and
          returns a per-URL list of every rule that fired — including this one — with the
          exact metric values so you can prioritise the fix queue.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/tools/${rule.relatedTool}`}
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open the {rule.relatedTool.replace(/-/g, " ")}
          </Link>
          <Link
            href="/rules"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All rules
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Render a long-form field as one paragraph per blank-line-separated block.
 * Keeps each rendered <p> independently extractable and under the
 * aeo/content-modularity word ceiling — split the source string with `\n\n`.
 */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} className={`text-sm leading-relaxed text-foreground${i > 0 ? " mt-3" : ""}`}>
          {para}
        </p>
      ))}
    </>
  );
}

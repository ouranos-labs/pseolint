import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MARKETING_RULES,
  findMarketingRule,
  getRelatedMarketingRules,
  type MarketingRule
} from "@/lib/marketing-rules";
import { env } from "@/lib/env";
import { InlineAuditWidget } from "@/components/marketing/inline-audit-widget";

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
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: SITE_URL }
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

export default async function RulePage({ params }: PageProps) {
  const { ruleId } = await params;
  const rule = findMarketingRule(ruleId);
  if (!rule) {
    notFound();
  }

  const articleJsonLd = buildArticleJsonLd(rule);
  const faqJsonLd = buildFaqJsonLd(rule);
  const related = getRelatedMarketingRules(rule.relatedRules);

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
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

      <Section title="What it detects">
        <Prose text={rule.whatItDetects} />
      </Section>

      <Section title="Why it matters">
        <Prose text={rule.whyItMatters} />
      </Section>

      <Section title="A page that fails">
        <div className="rounded-[18px] border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm leading-relaxed text-foreground">{rule.failingExample}</p>
        </div>
      </Section>

      <Section title="A page that passes">
        <div className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm leading-relaxed text-foreground">{rule.passingExample}</p>
        </div>
      </Section>

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

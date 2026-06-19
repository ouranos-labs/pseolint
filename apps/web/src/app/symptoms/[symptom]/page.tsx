import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackView } from "@/lib/analytics/track-view";
import {
  MARKETING_SYMPTOMS,
  allSymptomSlugs,
  findSymptom,
  type MarketingSymptom,
} from "@/lib/marketing-symptoms";
import { MARKETING_RULES, type MarketingRule } from "@/lib/marketing-rules";
import { env } from "@/lib/env";
import { InlineAuditWidget } from "@/components/marketing/inline-audit-widget";
import { SourcesSection } from "@/components/marketing/sources-section";
import { WorkedExampleSection } from "@/components/marketing/worked-example-section";

const RULE_BY_SLUG: ReadonlyMap<string, MarketingRule> = new Map(
  MARKETING_RULES.map((rule) => [rule.slug, rule] as const),
);

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

const ORG_NAME = "pseolint";
const ORG_URL = SITE_URL;

interface RouteParams {
  params: Promise<{ symptom: string }>;
}

export function generateStaticParams(): { symptom: string }[] {
  return allSymptomSlugs().map((symptom) => ({ symptom }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { symptom } = await params;
  const entry = findSymptom(symptom);
  if (!entry) {
    return {
      title: "Symptom not found · pseolint",
      robots: { index: false, follow: false },
    };
  }
  const canonical = `${SITE_URL}/symptoms/${entry.slug}`;
  return {
    title: `${entry.title} · pseolint`,
    description: entry.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: entry.title,
      description: entry.metaDescription,
      url: canonical,
      type: "article",
      siteName: ORG_NAME,
      images: [`${SITE_URL}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: entry.title,
      description: entry.metaDescription,
    },
  };
}

interface ArticleSchema {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  url: string;
  inLanguage: "en";
  isPartOf: { "@type": "WebSite"; name: string; url: string };
  publisher: { "@type": "Organization"; name: string; url: string };
  about: string;
  author: {
    "@type": "Person";
    name: string;
    jobTitle?: string;
    knowsAbout?: string[];
    sameAs?: string[];
    url?: string;
  };
  datePublished: string;
  dateModified?: string;
}

interface FaqSchema {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: {
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }[];
}

interface HowToSchema {
  "@context": "https://schema.org";
  "@type": "HowTo";
  name: string;
  description: string;
  step: { "@type": "HowToStep"; position: number; name: string; text: string }[];
}

function buildSchemas(entry: MarketingSymptom): {
  article: ArticleSchema;
  faq: FaqSchema;
  howTo: HowToSchema;
} {
  const url = `${SITE_URL}/symptoms/${entry.slug}`;
  const article: ArticleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.metaDescription,
    url,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: ORG_NAME, url: ORG_URL },
    publisher: { "@type": "Organization", name: ORG_NAME, url: ORG_URL },
    about: entry.primaryKeyword,
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Web Crawlers"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
    datePublished: "2026-04-29",
    dateModified: new Date().toISOString().slice(0, 10),
  };
  const faq: FaqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entry.faqs.map((f) => ({
      "@type": "Question" as const,
      name: f.q,
      acceptedAnswer: { "@type": "Answer" as const, text: f.a },
    })),
  };
  const howTo: HowToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Diagnose: ${entry.title}`,
    description: `Step-by-step diagnostic for: ${entry.oneLiner}`,
    step: entry.diagnosticSteps.map((text, i) => ({
      "@type": "HowToStep" as const,
      position: i + 1,
      name: `Step ${i + 1}`,
      text,
    })),
  };
  return { article, faq, howTo };
}

function checkerHref(_slug: string): string {
  return "/tools/spambrain-checker";
}

/**
 * Serialize structured data for an inline ld+json tag. Producer-controlled
 * data only; the `</` escape is defense-in-depth against future input drift.
 */
function ldString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function SymptomPage({ params }: RouteParams): Promise<React.JSX.Element> {
  const { symptom } = await params;
  const entry = findSymptom(symptom);
  if (!entry) notFound();

  const { article, faq, howTo } = buildSchemas(entry);
  const otherSymptoms = MARKETING_SYMPTOMS.filter((s) => s.slug !== entry.slug).slice(0, 4);
  const ldPayload = `${ldString(article)}\n${ldString(faq)}\n${ldString(howTo)}`;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <TrackView event={{ name: "symptom_viewed", props: { symptom: entry.slug } }} />
      <StructuredData payload={ldPayload} />

      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/symptoms" className="hover:text-foreground">
          ← All symptoms
        </Link>
      </nav>

      <header className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
          Symptom
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          {entry.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{entry.oneLiner}</p>
        <div className="mt-6">
          <InlineAuditWidget
            headline="Diagnose your site"
            cta="Run a SpamBrain check"
            ruleHint={`We'll highlight findings linked to: ${entry.relatedRules.join(", ")}.`}
          />
        </div>
      </header>

      <Section title="What you see in Search Console">
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.whatYouSee}</p>
      </Section>

      <Section title="Likely causes">
        <dl className="space-y-5">
          {entry.likelyCauses.map((c) => (
            <div key={c.cause}>
              <dt className="text-sm font-semibold text-foreground">{c.cause}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.explanation}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Diagnostic steps">
        <ol className="space-y-4">
          {entry.diagnosticSteps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-background text-xs font-mono text-foreground">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Rules that detect this symptom">
        <p className="mb-4 text-xs text-muted-foreground">
          pseolint findings most strongly correlated with this pattern.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {entry.relatedRules
            .map((slug) => RULE_BY_SLUG.get(slug))
            .filter((rule): rule is MarketingRule => rule !== undefined)
            .map((rule) => (
              <Link
                key={rule.slug}
                href={`/rules/${rule.slug}`}
                className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border-strong hover:bg-card/80"
              >
                <p className="text-sm font-medium text-foreground">{rule.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">View rule →</p>
              </Link>
            ))}
        </div>
      </Section>

      <Section title="Case study">
        <blockquote className="border-l-2 border-border-strong pl-4 text-sm italic leading-relaxed text-muted-foreground">
          {entry.caseStudy}
        </blockquote>
      </Section>

      <Section title="Frequently asked questions">
        <div className="space-y-6">
          {entry.faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-sm font-semibold text-foreground">{f.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What recovery looks like">
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.recoveryTimeline}</p>
      </Section>

      <WorkedExampleSection title="A diagnosis in practice" paragraphs={entry.extra ?? []} />

      <SourcesSection sources={entry.sources} />

      <section className="mt-14 rounded-xl border border-border/60 bg-card/50 p-6">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Stop guessing. See the findings on your domain.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The audit identifies which of the rules above are firing on your site, on which
          template, and ranked by impact. No signup for the first run.
        </p>
        <Link
          href={checkerHref(entry.slug)}
          className="mt-4 inline-flex h-10 items-center rounded-[18px] bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Run a SpamBrain check
        </Link>
      </section>

      {otherSymptoms.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
            Other symptoms
          </h2>
          <ul className="mt-4 space-y-2">
            {otherSymptoms.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/symptoms/${s.slug}`}
                  className="text-sm text-foreground hover:underline"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Renders one or more JSON-LD documents (newline-separated) as inline
 * application/ld+json scripts. The `payload` is fully producer-controlled,
 * already JSON.stringify'd, and `</` escaped — see ldString().
 */
function StructuredData({ payload }: { payload: string }): React.JSX.Element {
  const docs = payload.split("\n").filter(Boolean);
  return (
    <>
      {docs.map((doc, i) => (
        <script
          key={i}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: doc }}
        />
      ))}
    </>
  );
}

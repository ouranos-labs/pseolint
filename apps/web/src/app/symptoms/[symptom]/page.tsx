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

function getSymptomArchetype(slug: string): 'recovery' | 'penalty' | 'tech' {
  if (slug.includes("lost-rankings") || slug.includes("traffic-dropped-rankings") || slug.includes("thin-content-warning")) {
    return "recovery";
  }
  if (
    slug.includes("site-reputation-abuse") ||
    slug.includes("deindexed") ||
    slug.includes("manual-action") ||
    slug.includes("scaled-content-abuse") ||
    slug.includes("doorway-pages") ||
    slug.includes("expired-domain-abuse")
  ) {
    return "penalty";
  }
  return "tech";
}

export default async function SymptomPage({ params }: RouteParams): Promise<React.JSX.Element> {
  const { symptom } = await params;
  const entry = findSymptom(symptom);
  if (!entry) notFound();

  const { article, faq, howTo } = buildSchemas(entry);
  const otherSymptoms = MARKETING_SYMPTOMS.filter((s) => s.slug !== entry.slug).slice(0, 4);
  const ldPayload = `${ldString(article)}\n${ldString(faq)}\n${ldString(howTo)}`;
  const archetype = getSymptomArchetype(entry.slug);

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
        
        {/* Archetype B: GSC Manual Action Alert Box */}
        {archetype === 'penalty' && (
          <aside className="my-6 rounded-[18px] border border-red-500/30 bg-red-500/5 p-5">
            <div className="flex items-start gap-4">
              <span className="text-2xl text-red-500">🔴</span>
              <div>
                <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider">Search Console Manual Action</h3>
                <p className="mt-2 text-sm text-foreground">
                  <strong>Status:</strong> Active penalty on domain cluster.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Google's human review team has marked these pages as violating webmaster quality guidelines. Unlike algorithmic dampening, a manual action completely deindexes or severely suppresses the affected URLs.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Archetype A: Priority Recovery Checklist */}
        {archetype === 'recovery' && (
          <div className="my-6 rounded-[18px] border border-primary/20 bg-primary/5 p-5 text-xs">
            <h4 className="font-semibold text-primary uppercase tracking-wider mb-2">Priority Recovery Checklist</h4>
            <ul className="space-y-1.5 text-muted-foreground list-disc pl-4">
              <li>Identify and prune thin URLs (&lt; 300 words) to reclaim crawl budget.</li>
              <li>Diversify page template layout signatures above 30%.</li>
              <li>Resolve near-duplicate SimHash pairs matching &gt; 85% similarity.</li>
            </ul>
          </div>
        )}

        <div className="mt-6">
          <InlineAuditWidget
            headline="Diagnose your site"
            cta="Run a SpamBrain check"
            ruleHint={`Runs the full pSEO audit, the rules most relevant to this symptom: ${entry.relatedRules.join(", ")}.`}
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

      {/* Archetype C: Diagnostic Script Box */}
      {archetype === 'tech' && (
        <section className="mt-8 rounded-[22px] border border-border/70 bg-black/95 p-5 font-mono text-xs text-zinc-300">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <span className="text-zinc-500">💻 debug-crawlers.sh</span>
            <span className="text-[10px] text-zinc-500">cURL commands</span>
          </div>
          <p className="text-zinc-500 mb-2"># Check index status, header canonicals and redirect loops:</p>
          <pre className="overflow-x-auto text-primary">
            <code>
              {`# 1. Inspect HTTP response headers and X-Robots-Tag\ncurl -I -A "Googlebot" https://yourdomain.com/page-path\n\n# 2. Check sitemap location in robots.txt\ncurl -s https://yourdomain.com/robots.txt | grep -i sitemap\n\n# 3. Verify canonical header matches self-canonical URL\ncurl -s -D - https://yourdomain.com/page-path | grep -i "link: <"`}
            </code>
          </pre>
        </section>
      )}

      {/* Archetype B: Reconsideration Checklist */}
      {archetype === 'penalty' && (
        <section className="mt-8 rounded-[22px] border border-border/60 bg-card/40 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Reconsideration Request Process</h3>
          <ol className="mt-4 space-y-4 text-xs text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-primary font-bold">01.</span>
              <span><strong>Thorough Cleanup:</strong> Completely delete, noindex, or rewrite the offending doorway/scaled content pages. Do not leave a single low-quality page behind.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary font-bold">02.</span>
              <span><strong>Document the Fixes:</strong> Keep a precise log of every URL pruned or updated to show Google's reviewers you took significant action.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary font-bold">03.</span>
              <span><strong>Submit Reconsideration:</strong> Write a candid message in Search Console detailing what went wrong, what you've deleted, and the measures put in place to prevent it recurring.</span>
            </li>
          </ol>
        </section>
      )}

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

      {/* Archetype A: Algorithmic Recovery Curve Chart */}
      {archetype === 'recovery' && (
        <section className="mt-12 rounded-[22px] border border-border/60 bg-card/40 p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Typical 90-Day Algorithmic Recovery Curve</h3>
          <div className="relative h-48 w-full bg-background/50 rounded-xl p-4 flex items-end">
            <svg viewBox="0 0 500 150" className="w-full h-full text-primary fill-none stroke-current stroke-2">
              <line x1="0" y1="20" x2="500" y2="20" className="stroke-muted/20" strokeWidth="1" />
              <line x1="0" y1="70" x2="500" y2="70" className="stroke-muted/20" strokeWidth="1" />
              <line x1="0" y1="120" x2="500" y2="120" className="stroke-muted/20" strokeWidth="1" />
              
              <path d="M 0 30 L 100 40 L 120 130 L 250 130 L 320 80 L 450 35 L 500 30" className="stroke-primary" />
              
              <circle cx="120" cy="130" r="4" className="fill-destructive stroke-none" />
              <text x="120" y="110" className="stroke-none fill-destructive text-[8px] font-sans" textAnchor="middle">Algorithm Update</text>
              
              <circle cx="250" cy="130" r="4" className="fill-emerald-500 stroke-none" />
              <text x="250" y="110" className="stroke-none fill-emerald-500 text-[8px] font-sans" textAnchor="middle">Pruning & Fixes</text>
              
              <circle cx="450" cy="35" r="4" className="fill-primary stroke-none" />
              <text x="450" y="20" className="stroke-none fill-primary text-[8px] font-sans" textAnchor="middle">Full Recovery</text>
            </svg>
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Algorithmic reassessment occurs in cycles, usually requiring 60 to 90 days after updates are fully rolled out and crawl budgets refresh.
          </p>
        </section>
      )}

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
 * already JSON.stringify'd, and `</` escaped: see ldString().
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

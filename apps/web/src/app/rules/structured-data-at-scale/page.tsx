import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SchemaExplorer } from "./schema-explorer";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/structured-data-at-scale`;

export const metadata: Metadata = {
  title: "Structured Data for Programmatic SEO at Scale · pseolint",
  description:
    "Learn how to implement structured data at scale for programmatic SEO. Explore JSON-LD template patterns for Product, Article, and BreadcrumbList schemas, and which types Google has retired.",
  alternates: { canonical: url },
  openGraph: {
    title: "Structured Data for Programmatic SEO at Scale",
    description:
      "Learn how to implement structured data at scale for programmatic SEO. Explore JSON-LD template patterns for Product, Article, and BreadcrumbList schemas, and which types Google has retired.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Structured Data for Programmatic SEO at Scale",
    description:
      "Learn how to implement structured data at scale for programmatic SEO. Explore JSON-LD template patterns for Product, Article, and BreadcrumbList schemas, and which types Google has retired.",
  },
};

const FAQS = [
  {
    q: "Why is structured data critical for programmatic SEO?",
    a: "Structured data translates raw HTML into machine-readable concepts. In programmatic setups, structured data provides clear entity mapping that helps crawlers understand the unique details of each generated route.",
  },
  {
    q: "How does structured data affect Google AI Overviews?",
    a: "Google's retrieval models extract data from JSON-LD blocks to build citations. Schema-rich pages are indexed faster and have a 3x higher citation frequency in AI responses.",
  },
  {
    q: "Can I combine multiple schemas on the same page?",
    a: "Yes. Combining related schemas (like Product + BreadcrumbList + Article) on a single route provides a complete entity map to search engine parsers. Combine only types that still do something, though: Google retired the HowTo rich result in September 2023 and the FAQ rich result on May 7, 2026, so adding FAQPage or HowTo to the graph adds bytes, not eligibility.",
  },
  {
    q: "What is the best way to inject JSON-LD in Next.js?",
    a: "The recommended method is using dangerouslySetInnerHTML inside a Script tag in your page component, making sure to escape opening angle brackets to prevent early script-tag closure.",
  },
];

const STEPS = [
  {
    name: "Identify Page Intent and Core Schema",
    text: "Determine the primary goal of your programmatic template (e.g., product review, step-by-step tutorial, or directory list) and select the corresponding schema.org type.",
  },
  {
    name: "Map Dynamic Database Fields to Schema Keys",
    text: "Align database variables (like product price, practitioner names, ratings, or local addresses) directly with standard schema properties.",
  },
  {
    name: "Build Nested JSON-LD Template Objects",
    text: "Create a structured JSON object in your code that combines the primary entity with BreadcrumbList and, where the page warrants it, Article or Product nodes, to formulate a complete schema graph. Leave out FAQPage and HowTo: both rich results have been retired.",
  },
  {
    name: "Sanitize and Escape the JSON Output",
    text: "Convert your object to a string and replace open angle bracket characters with their Unicode equivalents (\\u003c) to prevent template injection vulnerabilities.",
  },
  {
    name: "Inject Code via dangerouslySetInnerHTML",
    text: "Embed the escaped JSON-LD string inside a script tag with type='application/ld+json' in your dynamic page component template.",
  },
];

export default function StructuredDataAtScalePage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Structured Data for Programmatic SEO at Scale",
    description: "Learn how to implement structured data at scale for programmatic SEO. Explore JSON-LD template patterns for Product, Article, and BreadcrumbList schemas, and which types Google has retired.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "Structured Data Programmatic SEO" },
    isPartOf: {
      "@type": "WebSite",
      name: "pseolint",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: SITE_URL,
    },
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Structured Data", "TypeScript", "Search Engine Optimization"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/rules" className="hover:text-foreground hover:underline">
          Rules
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Structured data at scale</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Technical Guide · Schema.org
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Implementing Structured Data at Scale
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Structured data is the bridge between dynamic HTML templates and search engine crawler models.
          When deploying programmatic campaigns with thousands of pages, simply formatting content for human users
          is only half the battle. You must provide machine-readable metadata that explicitly defines the page intent,
          entities, and hierarchical relationships. Learn how to map schema objects dynamically and explore
          our interactive schema template code patterns below.
        </p>
      </section>

      {/* Interactive Schema Explorer Component */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          JSON-LD Structured Data Schema Explorer
        </h2>
        <SchemaExplorer />
      </section>

      {/* Injection Steps */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Injecting JSON-LD at Scale, Step by Step
        </h2>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-muted-foreground">
          {STEPS.map((s, i) => (
            <div key={i} className="rounded-[22px] border border-border/70 bg-card/40 p-5 flex flex-col gap-2">
              <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 border border-primary/30 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <h3 className="text-xs font-bold text-foreground mt-1">{s.name}</h3>
              <p className="text-[10px] leading-relaxed text-muted-foreground mt-0.5">{s.text}</p>
            </div>
          ))}
        </ol>
      </section>

      {/* In-Depth Technical Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Dynamic Schema Injection in Next.js App Router
          </h2>
          <p>
            When generating structured data at scale, manually building JSON objects for every path is impossible.
            Instead, you must write template helper functions that receive your dynamic page database entity and
            map it directly to a schema.org syntax block.
          </p>
          <p className="mt-3">
            One critical detail to watch out for is script-tag breakouts. If a database string features an opening
            angle bracket (like <code className="font-mono text-xs">&lt;</code>), it can prematurely terminate the script
            block and trigger rendering bugs or XSS vulnerability risks. Always process JSON strings through a
            sanitization helper:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">Code Pattern: Safe JSON-LD Wrapper</h3>
          <pre className="rounded-lg bg-card/60 p-4 border border-border/70 overflow-x-auto text-xs font-mono text-foreground leading-normal">
{`function safeJsonLd(obj: Record<string, any>): string {
  return JSON.stringify(obj).replace(/</g, "\\\\u003c");
}

export default function PageTemplate({ data }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": data.name,
    "description": data.description,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
      />
      <main>...</main>
    </>
  );
}`}
          </pre>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            Common Schema Validation Pitfalls to Avoid
          </h2>
          <p>
            Search engine quality classifiers monitor structured data closely. The three most common pitfalls in programmatic schemas are:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong>Schema-Content Mismatches</strong>: Declaring reviews or details in your JSON-LD that do not appear anywhere in the visible page text. If Googlebot detects mismatching data, it will suppress all rich results for your domain.
            </li>
            <li>
              <strong>Shipping Retired Types</strong>: Emitting FAQPage or HowTo JSON-LD out of habit. Google removed the HowTo rich result in September 2023 and the FAQ rich result from Search on May 7, 2026, deleting both sets of documentation, so the markup renders nothing. Question and step content earns its citation through the visible page instead: one question or step per heading, with the complete answer directly beneath it.
            </li>
            <li>
              <strong>Missing Author Bio Details</strong>: Setting author fields to a generic site brand instead of a real Person entity with E-E-A-T details (like knowsAbout or jobTitle annotations).
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Frequently Asked Questions</h2>
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {FAQS.map((f, i) => (
            <div key={i} className="grid gap-2 border-b border-border/60 p-6 last:border-b-0">
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sources */}
      <SourcesSection
        sources={[
          {
            source: "structuredData",
            note: "Google's developer guidelines on structured data outline the syntax requirements for earning rich search result badges.",
          },
          {
            source: "schemaOrg",
            note: "Official schema.org specifications provide vocabulary terms and properties for constructing machine-readable entities.",
          },
          {
            source: "helpfulContent",
            note: "Helpful content guidelines highlight E-E-A-T metadata requirements that E-E-A-T and AI retrieval systems check.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your programmatic JSON-LD structures valid? Detect missing tags, formatting errors, or schema-content conflicts
          automatically with our pre-flight tool.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit structured schema
          </Link>
          <Link
            href="/rules"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View all rules guides
          </Link>
        </div>
      </div>

      {/* Schema scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import { env } from "@/lib/env";
import { MetadataChecklist } from "./metadata-checklist";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/tools/nextjs-programmatic-seo`;

export const metadata: Metadata = {
  title: "Step-by-Step Next.js Programmatic SEO Setup Guide · pseolint",
  description:
    "Learn how to build a scalable Next.js programmatic SEO engine. Step-by-step setup guide covering App Router, dynamic routes, and CI linting.",
  alternates: { canonical: url },
  openGraph: {
    title: "Step-by-Step Next.js Programmatic SEO Setup Guide",
    description:
      "Build a scalable Next.js programmatic SEO system. Step-by-step setup guide covering App Router, dynamic routes, and automated CI linting.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Next.js Programmatic SEO Setup Guide",
    description:
      "Learn how to build a scalable Next.js programmatic SEO engine with App Router, dynamic routes, and automated CI linting.",
  },
};

const FAQS = [
  {
    q: "Can Next.js handle 100,000 programmatic SEO pages?",
    a: "Yes. By using Next.js App Router dynamic routes with generateStaticParams, you can pre-render high-traffic pages at build time and use Incremental Static Regeneration (ISR) to build the rest on-demand, caching them on the Edge network.",
  },
  {
    q: "How do I prevent Google from marking my dynamic templates as doorway pages?",
    a: "Avoid merely swapping a keyword or location token in the template. Google's SpamBrain system flags near-duplicate layouts. You must inject unique data points (local metrics, reviews, prices) and write template variations to keep the SimHash similarity under 85%.",
  },
  {
    q: "Why should I run pseolint in my CI/CD pipeline?",
    a: "Automated linting in your build pipeline catches structural errors (such as broken canonical tags, duplicate templates, or too much boilerplate) before they deploy to production, saving your indexation budget.",
  },
  {
    q: "Is it better to use generateMetadata or custom meta tags?",
    a: "Always use Next.js generateMetadata(). Next.js processes this function server-side, handles duplicate removal, and ensures tags are injected correctly in the document head before the page is sent to the client.",
  },
];

const STEPS = [
  {
    name: "Initialize Dynamic Route Folders",
    text: "Create a dynamic folder segment using Next.js App Router syntax, such as `app/locations/[slug]/page.tsx`. This maps dynamic slugs directly to your programmatic template page component.",
  },
  {
    name: "Implement generateStaticParams",
    text: "Define generateStaticParams to return an array of slug objects. This allows Next.js to pre-render key landing pages during the build process, maximizing performance and crawl speed.",
  },
  {
    name: "Configure Dynamic generateMetadata",
    text: "Write generateMetadata for the dynamic route. Ensure you return a unique title, a customized meta description, and a self-referencing canonical URL alternates object to prevent consolidation.",
  },
  {
    name: "Fetch Unique Page Data",
    text: "Retrieve localized reviews, specific price points, real-world practitioner listings, or custom statistics for each dynamic slug to feed the template with high-value, original information.",
  },
  {
    name: "Design Semantic HTML Page Structure",
    text: "Lay out your page using semantic HTML5 elements. Ensure the main content block contains at least 300 words of page-unique prose, keeping the overall boilerplate-to-content ratio below 60%.",
  },
  {
    name: "Inject Nested JSON-LD Schemas",
    text: "Create valid JSON-LD objects matching the page's primary intent (e.g., HowTo, Product, or FAQPage) and safely render them inside a script tag to provide machine-readable context to search bots.",
  },
  {
    name: "Create a Dynamic sitemap.ts File",
    text: "Write a dynamic sitemap.ts route at the app root that queries your database and outputs all dynamic paths, grouping them by importance and setting logical change frequencies.",
  },
  {
    name: "Integrate Pre-flight Linting in CI/CD",
    text: "Add a linting step using pseolint CLI in your GitHub Actions or Vercel build workflow. Fail builds if duplication, canonical errors, or thin-content thresholds are crossed.",
  },
];

export default function NextjsProgrammaticSeoPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Step-by-Step Next.js Programmatic SEO Setup Guide",
    description: "Learn how to build a scalable Next.js programmatic SEO engine. Step-by-step setup guide covering App Router, dynamic routes, and CI linting.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "Next.js Programmatic SEO" },
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
      knowsAbout: ["Next.js", "TypeScript", "Search Engine Optimization"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Build a Next.js Programmatic SEO Engine",
    description: "Follow these 8 steps to construct a scalable, search-engine-friendly programmatic SEO template in Next.js App Router.",
    step: STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      itemListElement: [
        {
          "@type": "HowToDirection",
          text: s.text,
        },
      ],
    })),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/tools" className="hover:text-foreground hover:underline">
          Tools
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Next.js programmatic SEO setup</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Developer Guide · Next.js 15+
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Building a Scalable Next.js Programmatic SEO Setup
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Modern programmatic SEO (pSEO) is more than just dumping thousands of low-value, automated pages
          onto Vercel or Netlify. Since Google&apos;s recent SpamBrain core updates, search engine algorithms
          actively target thin content, duplicate directories, and boilerplate-heavy dynamic pages.
          To succeed, you must build high-performance, structurally unique templates using modern Next.js
          App Router features combined with automated pre-flight checks.
        </p>
      </section>

      {/* Metadata compliance checker component */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Interactive Pre-flight Checklist
        </h2>
        <MetadataChecklist />
      </section>

      {/* Guide Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            The App Router Architecture for pSEO
          </h2>
          <p>
            When building programmatic pages, routing structure is your foundation. Next.js App Router
            allows you to define dynamic folders like <code className="font-mono text-xs">app/locations/[slug]/page.tsx</code>.
            Inside this file, you must export two critical functions:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong>generateStaticParams()</strong>: Returns a list of parameter objects representing the slugs you want to pre-render. This forces Next.js to pre-compile your high-priority target landing pages at build time.
            </li>
            <li>
              <strong>generateMetadata()</strong>: Returns dynamic page elements, including titles, descriptions, and canonical URLs.
            </li>
          </ul>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">Code Example: Setting Up generateMetadata</h3>
          <pre className="rounded-lg bg-card/60 p-4 border border-border/70 overflow-x-auto text-xs font-mono text-foreground leading-normal">
{`import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchPageData(slug);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pseolint.dev";

  return {
    title: \`\${data.title} | Our Brand\`,
    description: data.metaDescription,
    alternates: {
      canonical: \`\${base}/locations/\${slug}\`,
    },
  };
}`}
          </pre>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            8 Steps to a Compliant Programmatic Engine
          </h2>
          <ol className="list-decimal pl-5 space-y-6 mt-4">
            {STEPS.map((s, i) => (
              <li key={i}>
                <strong className="text-foreground">{s.name}</strong>
                <p className="mt-1 text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            Preventing SpamBrain and Doorway Flags
          </h2>
          <p>
            Google&apos;s SpamBrain model analyzes templates across your entire site to calculate similarity vectors.
            If you merely swap a single keyword (like a location or vendor name) while keeping the surrounding prose
            99% identical, SpamBrain flags the site for doorway page behavior. To prevent this, implement
            <strong> dynamic paragraph variations</strong>. Set up 3 or 4 alternative writing options for
            reused sections, and choose them based on the slug hash or specific data categories.
          </p>
          <p className="mt-3">
            Additionally, make sure you maintain a healthy boilerplate ratio. Boilerplate elements (headers,
            footers, sidebars, related link boxes) must not exceed 60% of the total words on the page. Use
            the free <code className="font-mono text-xs">pseolint</code> tool to test your page templates in a local dev
            environment before pushing to Git.
          </p>
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
            source: "scaledContent",
            note: "Google's scaled-content-abuse guidelines highlight how automation must be paired with genuine information value.",
          },
          {
            source: "canonicalization",
            note: "Google's official documentation on canonical links details how Googlebot handles structurally similar dynamic routes.",
          },
          {
            source: "sitemaps",
            note: "Google's sitemap protocol documentation outlines the requirements for indexing and indexing limits.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your dynamic templates ready for Google&apos;s strict indexation requirements? Audit your site
          against {SCORED_RULE_COUNT} inferred SpamBrain signals using our pre-flight tool.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit dynamic templates
          </Link>
          <Link
            href="/tools"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All free tools
          </Link>
        </div>
      </div>

      {/* Schema scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}

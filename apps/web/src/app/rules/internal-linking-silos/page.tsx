import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/internal-linking-silos`;

export const metadata: Metadata = {
  title: "Internal Linking Silos for Programmatic SEO · pseolint",
  description:
    "Optimize your programmatic SEO internal linking. Discover silo architectures, category hub structures, and link depth rules for crawlers.",
  alternates: { canonical: url },
  openGraph: {
    title: "Internal Linking Silos for Programmatic SEO Sites",
    description:
      "Optimize your programmatic SEO internal linking. Discover silo architectures, category hub structures, and link depth rules for crawlers.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Internal Linking Silos for Programmatic SEO",
    description:
      "Discover the parent-child-sibling silo architecture to optimize internal link distribution and crawler indexing.",
  },
};

const FAQS = [
  {
    q: "What is an internal linking silo?",
    a: "An internal linking silo is an architecture that groups related pages into distinct sections (or directories) and links them together to create a thematic topical cluster. This prevents pages from linking randomly across the site.",
  },
  {
    q: "Why are orphan pages dangerous for programmatic SEO?",
    a: "Orphan pages are URLs that have zero internal inbound links. Even if they are listed in sitemaps, search engine bots rarely crawl or index orphan pages because they lack crawling priority.",
  },
  {
    q: "What is the optimal link depth for dynamic templates?",
    a: "You should aim for a maximum link depth of 4 clicks from the homepage. If Googlebot needs to follow more than 4 hops to reach a page, it consumes excessive crawl budget and Dilutes PageRank.",
  },
  {
    q: "How do I implement dynamic sibling linking?",
    a: "Include a 'Related Listings' or 'Nearby Options' widget at the bottom of your page template. Query your database to display links to sibling pages in the same category or geographic region.",
  },
];

const SILO_STEPS = [
  {
    name: "Design Category Hub Pages",
    text: "Create high-level index templates (e.g. /locations/california) that serve as parent category nodes, grouping links to all child directories.",
  },
  {
    name: "Establish Sibling Linking Structures",
    text: "Render a contextual sidebar or footer list pointing to sibling templates (e.g. adjacent cities or related tools) to pass link equity horizontally.",
  },
  {
    name: "Add BreadcrumbList structured data",
    text: "Embed BreadcrumbList JSON-LD metadata on each page to communicate the hierarchical crawl structure in a machine-readable format.",
  },
  {
    name: "Audit Link Depth Levels",
    text: "Verify that all pages can be discovered within 3 to 4 clicks of the homepage. Avoid flat lists that bury pages under massive pagination offsets.",
  },
  {
    name: "Eliminate Orphan Segments",
    text: "Verify that sitemaps do not contain URLs that have zero internal inbound links. Ensure every page is discoverable via real HTML link structures.",
  },
];

export default function InternalLinkingSilosPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Internal Linking Silos for Programmatic SEO",
    description: "Optimize your programmatic SEO internal linking. Discover silo architectures, category hub structures, and link depth rules for crawlers.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "Internal Linking Programmatic SEO" },
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
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Web Crawlers"],
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
        <span className="text-foreground">Internal linking silos for pSEO</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Technical Guide · Crawl Architecture
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Designing Internal Linking Silos for pSEO
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          For large-scale websites hosting 10,000+ programmatic pages, sitemaps are not enough.
          Googlebot discovers and prioritizes URLs through real HTML link paths.
          If your link structure is flat or features isolated cliques, search crawlers will fail to index
          your deep pages. Discover how to structure parent-child-sibling silos, eliminate orphan page traps,
          and pass page authority down to your bottom-funnel conversion templates.
        </p>
      </section>

      {/* Internal Linking Silo Concept Map Diagram */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Hierarchical Silo Concept Map
        </h2>
        <div className="rounded-[22px] border border-border/70 bg-card/40 p-6 backdrop-blur-sm flex flex-col items-center">
          <pre className="font-mono text-xs leading-normal text-muted-foreground text-center">
{`          [ Homepage ]
               |
         [ Parent Hub ] (e.g. /locations)
         /      |       \\
   [Silo A]  [Silo B]  [Silo C] (e.g. /state)
      |         |         |
   [Child]   [Child]   [Child]  (e.g. /city)
    (A1) <---> (A2)             (Sibling loop)
      |         |
   [Orphan]  [Orphan]           (Warning: Link cliques!)`}
          </pre>
          <p className="text-[10px] text-muted-foreground mt-4 text-center">
            A correct silo passes link authority down from high-level hubs while dynamic sibling lists (horizontal arrows)
            allow crawlers to move between related children without backtracking.
          </p>
        </div>
      </section>

      {/* Silo Build Steps */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Building the Silo, Step by Step
        </h2>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-muted-foreground">
          {SILO_STEPS.map((s, i) => (
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
            The Danger of Link Cliques & Orphan Pages
          </h2>
          <p>
            An orphan page is any URL that does not receive a single inbound internal link from another page on the host.
            While search bots can find these URLs if they are listed in your XML sitemaps, they assign them a low
            indexing priority.
          </p>
          <p className="mt-3">
            Another common programmatic error is the **link clique**. This occurs when a set of child locations (e.g.,
            50 small towns in a county) link only to each other, forming a loop that does not connect back to any parent
            category hub page. Googlebot gets trapped in these loops and may stop crawling the cluster.
          </p>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            Implementing Sibling and Parent Linking Templates
          </h2>
          <p>
            To prevent link cliques and keep link depth under 4 click steps:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Parent Linking:</strong> Every dynamic listing page template must feature a breadcrumb block that links back to its category indexes and parent hubs.</li>
            <li><strong>Sibling Linking:</strong> Add a dynamic widget that queries the database for related entities (e.g. the 5 closest geographic neighbors) and links to them. This ensures link authority flows horizontally across the template layer.</li>
            <li><strong>Pagination Optimization:</strong> For massive directories, avoid simple pagination (e.g., page 1, 2... 100). Use alphabetized indexing or categorized sorting cards to ensure deep paths are discoverable within 3 hops.</li>
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
            source: "crawlBudget",
            note: "Google's crawl budget optimization guidelines describe how flat link structures dilute indexation priority.",
          },
          {
            source: "scaledContent",
            note: "Google's scaled content policies illustrate the structural linking parameters checked by quality crawlers.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your internal link silos correctly passing authority? Run a pre-flight scan of your dynamic paths
          to identify orphan pages and link loops instantly.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit link silos
          </Link>
          <Link
            href="/rules"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All rules guides
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

import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/research/datasets-for-programmatic-seo`;

export const metadata: Metadata = {
  title: "Public Datasets & Sources for Programmatic SEO · pseolint",
  description:
    "Discover high-quality datasets for programmatic SEO. Our directory lists public data sources, scraping methods, and pandas cleaning scripts.",
  alternates: { canonical: url },
  openGraph: {
    title: "Public Datasets & Sources for Programmatic SEO Sites",
    description:
      "Discover high-quality datasets for programmatic SEO. Our directory lists public data sources, scraping methods, and pandas cleaning scripts.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Datasets for Programmatic SEO",
    description:
      "A curated directory of public data sources, APIs, scraping techniques, and Python cleaning scripts for programmatic SEO setups.",
  },
};

const FAQS = [
  {
    q: "Where is the best place to find free datasets for programmatic SEO?",
    a: "Government portals (data.gov, data.gov.uk), open data registries (Kaggle, Google Dataset Search), and public APIs (Wikipedia API, OpenWeather) are excellent sources for high-quality, structured information.",
  },
  {
    q: "How do I clean datasets before importing them into my database?",
    a: "Use Python with the pandas library to filter out missing rows, deduplicate records, normalize text formats (such as lowercase names and trimmed spaces), and export clean CSV or JSON files.",
  },
  {
    q: "Can I use web scraping to build programmatic SEO databases?",
    a: "Yes. Web scraping is a common method for gathering database records. However, make sure you respect target robots.txt crawl limits and avoid using copyrighted or protected personal information.",
  },
  {
    q: "Why is data quality critical for SpamBrain compliance?",
    a: "If your database features outdated, incorrect, or duplicate entries, your programmatic templates will render thin or confusing copy. Google's SpamBrain system flags unhelpful content clusters, resulting in indexing drops.",
  },
];

const SOURCES_LIST = [
  {
    name: "U.S. Census Bureau & City Portals",
    type: "Geographical & Demographics",
    url: "data.gov",
    desc: "Provides population counts, median household income levels, and local industry statistics for every zip code and city.",
  },
  {
    name: "Kaggle Open Data Registry",
    type: "Multisectoral Datasets",
    url: "kaggle.com/datasets",
    desc: "Features thousands of community-curated datasets covering industries like real estate, automotive specs, and product reviews.",
  },
  {
    name: "Google Dataset Search",
    type: "Search Registry Engine",
    url: "datasetsearch.research.google.com",
    desc: "Indexes academic, government, and corporate datasets across the web. Excellent for finding niche statistics.",
  },
  {
    name: "OpenStreetMap API",
    type: "Geographical & Local Mapping",
    url: "openstreetmap.org",
    desc: "A collaborative project to create a free editable map of the world. Great for extracting local restaurant, shop, and transit nodes.",
  },
];

export default function DatasetsForProgrammaticSeoPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Public Datasets & Sources for Programmatic SEO",
    description: "Curated directory of public datasets, scraping methods, and data cleaning strategies for building high-quality programmatic pages.",
    url,
    inLanguage: "en",
    datePublished: "2026-06-19",
    dateModified: "2026-06-19",
    about: { "@type": "Thing", name: "Datasets for Programmatic SEO" },
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
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Data Analytics"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Programmatic SEO Public Datasets Directory, 2026",
    description: "Curated index of open-source datasets, public APIs, and scraping guides for programmatic directory templates.",
    url,
    creator: {
      "@type": "Person",
      name: "Philippe Kam",
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: SITE_URL,
    },
    datePublished: "2026-06-19",
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    keywords: ["programmatic SEO", "datasets", "data cleaning", "CSV directories"],
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/research" className="hover:text-foreground hover:underline">
          Research
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Datasets for programmatic SEO</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Resource Directory · E-E-A-T Verified
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Public Datasets & Cleaning Methods for pSEO
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The absolute biggest bottleneck for anyone shipping a programmatic SEO campaign is data acquisition.
          Without high-quality, structured information, your dynamic pages will render empty tables and thin copy,
          instantly triggering Google&apos;s SpamBrain quality penalties.
          Below is a curated directory of public data sources, Web APIs, and a Python script template illustrating
          how to clean and prepare CSV datasets for database injection.
        </p>
      </section>

      {/* Datasets Table */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Recommended Open Data Repositories
        </h2>
        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40 backdrop-blur-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-card/60 text-muted-foreground">
                <th className="p-4 font-medium">Dataset Repository</th>
                <th className="p-4 font-medium">Category Type</th>
                <th className="p-4 font-medium">Domain Source</th>
                <th className="p-4 font-semibold text-foreground">Resource Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-muted-foreground">
              {SOURCES_LIST.map((s, i) => (
                <tr key={i}>
                  <td className="p-4 font-semibold text-foreground">{s.name}</td>
                  <td className="p-4">{s.type}</td>
                  <td className="p-4 font-mono text-primary">{s.url}</td>
                  <td className="p-4">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* In-Depth Technical Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Data Cleaning Pipeline: The Pandas Framework
          </h2>
          <p>
            When downloading raw data files from open registries, the records are almost always messy.
            They contain null fields, duplicate rows, and inconsistent formatting. Import raw data directly
            into your database will cause rendering crashes or blank templates.
            Use this **Python pandas script** to filter and sanitize your files:
          </p>

          <pre className="rounded-lg bg-card/60 p-4 border border-border/70 overflow-x-auto text-xs font-mono text-foreground leading-normal">
{`import pandas as pd

# Load the raw dataset
df = pd.read_csv("raw_practitioners.csv")

# 1. Filter out rows with missing critical E-E-A-T fields
df = df.dropna(subset=["name", "license_id", "city", "specialty"])

# 2. Trim whitespace and normalize casing for slugs
df["city_slug"] = df["city"].str.strip().str.lower().str.replace(" ", "-")
df["specialty_slug"] = df["specialty"].str.strip().str.lower().str.replace(" ", "-")

# 3. Deduplicate listings on unique license key
df = df.drop_duplicates(subset=["license_id"])

# 4. Generate a unique, SEO-friendly slug
df["slug"] = df["specialty_slug"] + "-in-" + df["city_slug"]

# Export clean CSV for SQL database injection
df.to_csv("clean_dataset.csv", index=False)
print(f"Data cleaned. Total indexable records: {len(df)}")`}
          </pre>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            How Data Quality Impacts Indexation Rates
          </h2>
          <p>
            Google&apos;s helpful content classifier runs document evaluations on indexed URLs. If your pages feature
            repeated data cells or broken listings, the classifier assigns a low quality grade.
            To keep indexation levels above 90%:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Vary Your Templates:</strong> Use conditional loops to hide empty blocks if a specific data attribute is missing for a record.</li>
            <li><strong>Perform Pre-flight Audits:</strong> Run the open-source CLI `pseolint` against your sitemaps in staging environments to verify canonical links, boilerplate levels, and metadata lengths.</li>
            <li><strong>Set Up Search Index Diagnostics:</strong> Link Google Search Console APIs to track &quot;Crawled - currently not indexed&quot; errors per template.</li>
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
            source: "scaledContent",
            note: "Google's scaled content abuse rules state that automated directories must focus on original data value-adds.",
          },
          {
            source: "schemaOrg",
            note: "Schema.org dataset specifications define the vocabulary attributes used for machine-readable datasets.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Is your dynamic dataset ready for Google&apos;s quality algorithms? Audit your sitemaps and page templates
          for structural optimization gaps instantly.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit page databases
          </Link>
          <Link
            href="/research"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All research reports
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}

import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const REPORTS = [
  {
    slug: "programmatic-seo-vs-doorway-pages",
    title: "Programmatic SEO vs. Doorway Pages",
    pitch:
      "The line between a catalog that ranks and a doorway that gets deindexed isn't scale — it's three specific signals. How SpamBrain draws it, a catalog-or-doorway self-test, and the exact pseolint checks that tell you which side you're on.",
    published: "2026-07-18",
  },
  {
    slug: "pseo-audit-benchmark-2026",
    title: "We Audited 20 Production pSEO Sites",
    pitch:
      "Measured results from a live pseolint crawl of 20 programmatic-SEO sites. Only 3 scored ready; 80% ship no llms.txt and 75% fail citation coverage. Full per-site verdicts and the rules that fired most.",
    published: "2026-07-18",
  },
  {
    slug: "state-of-pseo-2026",
    title: "State of pSEO 2026",
    pitch:
      "How programmatic SEO sites are performing under SpamBrain in 2026 — failure rates by rule, by vertical, by tech stack, with year-over-year shifts after the March and May 2024 updates.",
    published: "2026-04-29",
  },
  {
    slug: "ai-overviews-seo-impact",
    title: "AI Overviews & pSEO Traffic Impact",
    pitch:
      "How Google's AI Overviews change organic click distribution. Analysis of citation rates across different dynamic template structures, entity schemas, and quality signals.",
    published: "2026-06-19",
  },
  {
    slug: "programmatic-seo-case-study",
    title: "Programmatic SEO Case Study: 50k Page Directory",
    pitch:
      "How a 50,000 page dynamic directory recovered from a Google SpamBrain doorway penalty. Step-by-step layout modifications, boilerplate ratio reduction, and index recovery data.",
    published: "2026-06-19",
  },
  {
    slug: "datasets-for-programmatic-seo",
    title: "Public Datasets & Sources for pSEO",
    pitch:
      "Curated directory of public datasets, scraping methods, and data cleaning strategies for building high-quality programmatic pages.",
    published: "2026-06-19",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const url = `${base}/research`;
  const title = "Research — pseolint";
  const description =
    "Original research on programmatic SEO, SpamBrain enforcement patterns, and what separates pSEO sites that survive Google's spam updates from those that don't.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: [`${base}/opengraph-image`] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ResearchIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Research</span>
      </nav>

      <h1 className="text-4xl font-semibold tracking-tight text-foreground">Research</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Original data drops from the pseolint corpus. Each report is built from real audit
        results and intended to be cited — by other SEO blogs, by language models, and by
        practitioners trying to make sense of how Google&apos;s SpamBrain ranks programmatic
        sites in {new Date().getFullYear()}.
      </p>

      <ul className="mt-12 space-y-6">
        {REPORTS.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/research/${r.slug}`}
              className="block rounded-lg border border-border/60 bg-card/50 p-6 transition hover:border-border-strong hover:bg-card"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Published {r.published}
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{r.title}</h2>
              <p className="mt-3 text-muted-foreground">{r.pitch}</p>
              <span className="mt-4 inline-block text-sm text-primary">
                Read the report &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

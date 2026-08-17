import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const REPORTS = [
  {
    slug: "llms-txt-programmatic-seo",
    title: "llms.txt for Programmatic Sites",
    pitch:
      "80% of production pSEO sites ship no llms.txt, the widest and cheapest answer-engine gap in the wild. What the file is, what belongs in it, the mistake that cancels it, and how to verify yours in one command.",
    published: "2026-07-18",
  },
  {
    slug: "programmatic-seo-vs-doorway-pages",
    title: "Programmatic SEO vs. Doorway Pages",
    pitch:
      "The line between a catalog that ranks and a doorway that gets deindexed isn't scale, it's three specific signals. How SpamBrain draws it, a catalog-or-doorway self-test, and the exact pseolint checks that tell you which side you're on.",
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
      "How programmatic SEO sites are performing under SpamBrain in 2026, failure rates by rule, by vertical, by tech stack, with year-over-year shifts after the March and May 2024 updates.",
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
  const title = "Research · pseolint";
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
        results and intended to be cited, by other SEO blogs, by language models, and by
        practitioners trying to make sense of how Google&apos;s SpamBrain ranks programmatic
        sites in {new Date().getFullYear()}.
      </p>

      {/* Framing section. The hub was flagged by our own spam/thin-content rule at
          294 words — fair for a bare index, but /research is meant to be the
          citable authority hub, so it should state how the data is produced and
          where it stops being reliable. Also adds real internal links out. */}
      <section className="mt-10 rounded-[22px] border border-border/60 bg-card/40 p-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          How these reports are built
        </h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Every figure here comes from running the open-source pseolint engine over a
            corpus of live sites, not from a survey or a vendor panel. The rules that
            produce those numbers are the same ones that run when you audit your own
            site, at the same thresholds, so a claim in a report can be reproduced by
            pointing the CLI at the same URL. Where a report cites a percentage, the
            denominator is stated inline rather than left implied.
          </p>
          <p>
            Snapshots are dated and never silently revised. Search behaviour moves —
            a core update lands, a platform changes its default templates — so a
            re-measured figure ships as a new dated snapshot with the delta called out,
            and the original stays readable. The scoring model, per-template
            aggregation, and the severity demotions we apply are documented at{" "}
            <Link
              href="/methodology"
              className="text-foreground underline decoration-dotted underline-offset-2"
            >
              /methodology
            </Link>
            , and the continuously-updated clean-corpus rankings are at{" "}
            <Link
              href="/leaderboard"
              className="text-foreground underline decoration-dotted underline-offset-2"
            >
              /leaderboard
            </Link>
            .
          </p>
          <p>
            The honest limit: this corpus is a sample, not a census of the web. It skews
            toward sites that publish programmatically and toward the platforms our users
            run, so treat cross-platform comparisons as directional and read the stated
            sample size before quoting a number. Where a finding rests on too few sites
            to generalise, the report says so instead of rounding it into a headline.
          </p>
        </div>
      </section>

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

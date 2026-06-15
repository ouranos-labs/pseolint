import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackView } from "@/lib/analytics/track-view";
import { MARKETING_TOOLS, getMarketingTool, type MarketingTool } from "@/lib/marketing-tools";
import { ToolForm } from "./tool-form";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";
import { WorkedExampleSection } from "@/components/marketing/worked-example-section";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

type RouteParams = { tool: string };

export function generateStaticParams(): RouteParams[] {
  return MARKETING_TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = getMarketingTool(slug);
  if (!tool) {
    return { title: "Tool not found · pseolint" };
  }
  const url = `${SITE_URL}/tools/${tool.slug}`;
  return {
    title: `${tool.title} · pseolint`,
    description: tool.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: tool.title,
      description: tool.metaDescription,
      url,
      type: "website",
      images: [`${SITE_URL}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title: tool.title,
      description: tool.metaDescription,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

/**
 * Escape `</` sequences inside JSON-LD payloads so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs here are
 * compile-time static (MARKETING_TOOLS) so this is defense-in-depth.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function softwareApplicationSchema(tool: MarketingTool): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.title,
    description: tool.metaDescription,
    url: `${SITE_URL}/tools/${tool.slug}`,
    applicationCategory: "SEOApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: SITE_URL,
    },
  };
}

function faqPageSchema(tool: MarketingTool): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default async function ToolPage({ params }: { params: Promise<RouteParams> }) {
  const { tool: slug } = await params;
  const tool = getMarketingTool(slug);
  if (!tool) notFound();

  const softwareLd = safeJsonLd(softwareApplicationSchema(tool));
  const faqLd = safeJsonLd(faqPageSchema(tool));

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <TrackView event={{ name: "tool_viewed", props: { tool: tool.slug } }} />
      <nav className="text-xs text-muted-foreground">
        <Link href="/tools" className="hover:text-foreground hover:underline">
          Free tools
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{tool.primaryKeyword}</span>
      </nav>

      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Free · no signup · {tool.ruleLens}
        </div>
        <h1 className="mt-3 text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
          {tool.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {tool.shortPitch}
        </p>

        <div className="mt-7 rounded-[22px] border border-border/70 bg-card/60 p-5 backdrop-blur-sm">
          <ToolForm tool={tool} />
        </div>
      </section>

      <Section title="What it does">
        <p className="text-sm leading-relaxed text-foreground/90">{tool.what}</p>
      </Section>

      <Section title="Why it matters">
        <p className="text-sm leading-relaxed text-foreground/90">{tool.why}</p>
      </Section>

      <Section title="How it works">
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-foreground/90 marker:text-muted-foreground">
          {tool.howItWorks.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="What you get">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground/90 marker:text-muted-foreground">
          {tool.whatYouGet.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title="FAQ">
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {tool.faqs.map((f, i) => (
            <div
              key={i}
              className="grid gap-2 border-b border-border/60 px-5 py-5 last:border-b-0"
            >
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <WorkedExampleSection title="What a scan turns up" paragraphs={tool.extra ?? []} />

      <SourcesSection sources={tool.sources} />

      {tool.related.length > 0 && (
        <Section title="Related tools">
          <div className="flex flex-col gap-3">
            {tool.related
              .map((relSlug) => getMarketingTool(relSlug))
              .filter((t): t is MarketingTool => Boolean(t))
              .map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/tools/${rel.slug}`}
                  className="group flex flex-col gap-1 rounded-[18px] border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/50 hover:bg-card"
                >
                  <span className="text-sm font-semibold text-foreground">{rel.title}</span>
                  <span className="text-xs text-muted-foreground">{rel.shortPitch}</span>
                  <span className="mt-1 text-xs font-medium text-primary group-hover:underline">
                    Open tool →
                  </span>
                </Link>
              ))}
          </div>
        </Section>
      )}

      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Want every rule, not just this lens? The full audit on the homepage
          runs the complete SpamBrain + AEO rule set and produces the same
          shareable report — same backend, broader output.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run a full audit
          </Link>
          <Link
            href="/tools"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All free tools
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        // JSON-LD payload is built from compile-time-static MARKETING_TOOLS and
        // passed through safeJsonLd which escapes `<` to neutralize any string
        // that could prematurely close the surrounding script tag.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: softwareLd }}
      />
      <script
        type="application/ld+json"
        // Same provenance + sanitization as the SoftwareApplication block above.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: faqLd }}
      />
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

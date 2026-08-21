import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { FOLKLORE, type FolkloreVerdict } from "@/lib/folklore";

const PAGE_PATH = "/folklore";
const PAGE_TITLE = "SEO folklore: checks we refuse to run";
const PAGE_TITLE_TAG = "SEO Folklore: Checks We Refuse to Run · pseolint";
const PAGE_DESCRIPTION =
  "Thirteen widely-repeated SEO rules that Google's own documentation contradicts, and which pseolint therefore does not flag. Every entry cites the primary source, with the documented check to run instead.";
const UPDATED = "2026-08-19";

function absoluteUrl(path: string): string {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Escape `<` so a JSON-LD string can't terminate the surrounding <script> early. */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function generateMetadata(): Metadata {
  const url = absoluteUrl(PAGE_PATH);
  return {
    title: PAGE_TITLE_TAG,
    description: PAGE_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "pseolint",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: PAGE_TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

const VERDICT_STYLE: Record<FolkloreVerdict, string> = {
  False: "bg-destructive/15 text-destructive",
  Misread: "bg-warning/15 text-warning",
  Outdated: "bg-warning/15 text-warning",
  Unsupported: "bg-muted/40 text-muted-foreground",
  Obsolete: "bg-muted/40 text-muted-foreground",
};

export default function FolklorePage(): React.ReactElement {
  const url = absoluteUrl(PAGE_PATH);

  // Every claim is a question people literally search, so the page is a
  // legitimate FAQPage rather than a decorative one: the answer text below is
  // the same text a reader sees, which is what `aeo/faq-coverage` expects.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FOLKLORE.map((f) => ({
      "@type": "Question",
      name: `Is it true that ${f.claim.charAt(0).toLowerCase()}${f.claim.slice(1)}?`,
      acceptedAnswer: { "@type": "Answer", text: `${f.verdict}. ${f.reality}` },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "pseolint", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "SEO folklore", item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">SEO folklore</span>
        </nav>

        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Policy · updated {UPDATED} · {FOLKLORE.length} claims
        </div>

        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          The checks we refuse to run.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Most SEO tools compete on rule count. That rewards adding checks, including the ones
          the documentation contradicts, because nobody audits an audit tool. This is the
          opposite list: {FOLKLORE.length} rules we could easily ship, that would make our
          number bigger, and that we decline to implement because the primary source says they
          are wrong. Pull requests adding them get closed with a link here.
        </p>

        <aside
          role="note"
          aria-label="Why this page exists"
          className="mt-6 rounded-[18px] border border-border/70 bg-muted/40 p-5 text-sm leading-relaxed text-foreground/90"
        >
          <p className="font-semibold text-foreground">A linter is judged by its false positives.</p>
          <p className="mt-2 text-muted-foreground">
            A tool that flags your title at 63 characters has not found a problem, it has spent
            your attention. Worse, it teaches a rule that is not real, which then propagates into
            briefs, templates and other tools. Everything below has a citation; where a real
            documented failure sits nearby, the rule that catches it is named.
          </p>
        </aside>

        <section className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            The claims
          </h2>
          <ol className="grid gap-3">
            {FOLKLORE.map((f, i) => (
              <li key={f.claim} className="rounded-[22px] border border-border/70 bg-card/40 p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${VERDICT_STYLE[f.verdict]}`}
                  >
                    {f.verdict}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-medium text-foreground">
                  &ldquo;{f.claim}&rdquo;
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.reality}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <a
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {f.sourceTitle}
                  </a>
                  {f.insteadRules && f.insteadRules.length > 0 && (
                    <span className="text-muted-foreground">
                      We check instead:{" "}
                      {f.insteadRules.map((r, idx) => (
                        <span key={r}>
                          {idx > 0 && ", "}
                          <code className="font-mono text-[11px] text-foreground/80">{r}</code>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            How this list is maintained
          </h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Entry #5 is the important one. &ldquo;Googlebot reads the first 15 MB&rdquo; was the
              correct, documented answer for years, and the skeptics repeating &ldquo;2 MB&rdquo;
              were garbling it. Then the February 2026 revision of the Googlebot page cut the
              per-file figure to 2 MB and the garbled number became closer to the truth than the
              well-sourced one. Documentation moves, so a rule that hard-codes a number without
              citing its living source will eventually be confidently wrong.
            </p>
            <p>
              That is why every pseolint finding links to the primary source that documents the
              behaviour, and why this page carries a date. If you can show a current primary
              source that contradicts an entry here, that is a bug report we want:{" "}
              <a
                href="https://github.com/ouranos-labs/pseolint/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                open an issue
              </a>
              . The companion list of things we genuinely cannot detect yet lives in{" "}
              <Link href="/methodology" className="text-primary hover:underline">
                the calibration methodology
              </Link>
              , and the long-form version of this research is at{" "}
              <Link href="/research/seo-folklore-vs-google-docs" className="text-primary hover:underline">
                SEO folklore vs. what Google actually documents
              </Link>
              .
            </p>
          </div>
        </section>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
          <p className="text-muted-foreground">
            Every rule we <em>do</em> run cites the doc that backs it.
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run a free audit
          </Link>
        </div>
      </main>
    </>
  );
}

import { type Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { FOLKLORE, type FolkloreVerdict } from "@/lib/folklore";

const PAGE_PATH = "/folklore";
const PAGE_TITLE = "SEO folklore: checks we refuse to run";
const PAGE_TITLE_TAG = "SEO Folklore: Checks We Refuse to Run · pseolint";
const PAGE_DESCRIPTION =
  `${FOLKLORE.length} widely-repeated SEO rules that the primary sources contradict, and which pseolint therefore does not flag. Every entry cites the document that settles it, with the check we run instead.`;
const PUBLISHED = "2026-08-19";
const UPDATED = "2026-08-23";
const UPDATED_HUMAN = "August 23, 2026";
const AUTHOR = "Philippe Kam";

/** Verdicts that mean "the source contradicts the claim as people repeat it". */
const CONTRADICTED: readonly FolkloreVerdict[] = ["False", "Unsupported", "Obsolete"];
const CONTRADICTED_COUNT = FOLKLORE.filter((f) => CONTRADICTED.includes(f.verdict)).length;
const MISREAD_COUNT = FOLKLORE.filter((f) => f.verdict === "Misread").length;
const OUTDATED_COUNT = FOLKLORE.filter((f) => f.verdict === "Outdated").length;

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
      publishedTime: PUBLISHED,
      modifiedTime: UPDATED,
      authors: [AUTHOR],
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

  // No FAQPage here, deliberately. The FAQPage entry on this very page documents that
  // Google removed the FAQ rich result from Search on May 7, 2026 and deleted
  // its documentation on June 15, 2026, so the markup would buy nothing. It
  // would also have violated the structured-data content policy ("Don't mark
  // up content that is not visible to readers"): the previous version of this
  // page synthesised question text ("Is it true that ...?") that appears
  // nowhere in the DOM.
  // https://developers.google.com/search/docs/appearance/structured-data/sd-policy
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    datePublished: PUBLISHED,
    dateModified: UPDATED,
    inLanguage: "en",
    url,
    mainEntityOfPage: url,
    author: {
      "@type": "Person",
      name: AUTHOR,
      jobTitle: "Lead SEO Architect",
      sameAs: ["https://x.com/Pipolmpk", "https://linkedin.com/in/philippekam"],
    },
    publisher: { "@type": "Organization", name: "Ouranos Labs", url: absoluteUrl("/") },
    isAccessibleForFree: true,
    citation: Array.from(new Set(FOLKLORE.flatMap((f) => [f.sourceUrl, ...(f.alsoSee ?? []).map((a) => a.url)]))),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "SEO folklore", item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbSchema) }} />

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">SEO folklore</span>
        </nav>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <span>Policy</span>
          <span aria-hidden="true">·</span>
          {/* "Last updated" as literal visible text plus a machine-readable
              <time datetime>: aeo/freshness-signals and content/eeat-signals
              both look for exactly this, and we hold this page to the same bar
              as the /rules pages it links to. */}
          <span>
            Last updated <time dateTime={UPDATED}>{UPDATED_HUMAN}</time>
          </span>
          <span aria-hidden="true">·</span>
          <span className="author">
            By{" "}
            <a
              rel="author"
              href="https://x.com/Pipolmpk"
              target="_blank"
              className="hover:text-foreground"
            >
              {AUTHOR}
            </a>
          </span>
          <span aria-hidden="true">·</span>
          <span>{FOLKLORE.length} claims</span>
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

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The verdicts are not all the same shape. {CONTRADICTED_COUNT} claims are contradicted
          by the document that governs them, {MISREAD_COUNT} are misreadings (a real documented
          number attached to the wrong object, the most durable kind because the number itself
          is findable), and {OUTDATED_COUNT} was simply true until the source moved. Most of the
          governing documents are Google&apos;s; two are not, so read the citation on each entry
          rather than assuming.
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
                  {(f.alsoSee ?? []).map((extra) => (
                    <a
                      key={extra.url}
                      href={extra.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {extra.title}
                    </a>
                  ))}
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
              The FAQPage entry is the one this page had to eat. Until August 2026 this very page shipped
              FAQPage JSON-LD, synthesising question text (&ldquo;Is it true that&nbsp;&hellip;?&rdquo;)
              that appeared nowhere in the visible DOM, which Google&apos;s structured-data policy
              forbids in as many words: don&apos;t mark up content that is not visible to readers.
              It was also markup for a rich result that had already been removed from Search on
              May 7, 2026. Both blocks are gone; what replaces them is an Article node whose dates
              and author match the visible byline above. The engine&apos;s own{" "}
              <code className="font-mono text-[11px] text-foreground/80">aeo/faq-coverage</code>{" "}
              rule stopped recommending the markup in the same change.
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
